import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { sendAthleteInviteEmail } from '@/lib/email/mailer'
import { accessLinkPlan, canLinkInvitedClient, isAlreadyRegisteredMessage } from './account-access-rules.js'
import { findAuthAccountByEmail, replaceWithThrowawayPassword } from './auth-account'
import { buildInvitePageUrl } from './invite-link'

/** Pantalla a la que llega el atleta tras abrir el enlace: bienvenida y contraseña */
export const ATHLETE_LANDING_PATH = '/bienvenida'

export interface AccessLink {
    url: string
    /** El enlace es una invitación (cuenta nueva o sin confirmar) */
    accountCreated: boolean
    /** Cuenta a la que da acceso el enlace */
    userId: string | null
    /** La cuenta ya tenía el email confirmado (enlace mágico) */
    accountConfirmed: boolean
    /** Para validar el enlace con verifyOtp en la página de la invitación */
    tokenHash: string | null
    verifyType: 'invite' | 'email'
}

/**
 * Enlace de un solo uso para entrar sin contraseña. Si la cuenta aún no
 * existe, la crea (invite); si existe sin confirmar, antes le pone una
 * contraseña aleatoria y la invita; si está confirmada, es un enlace mágico.
 */
export async function buildAccessLink(
    email: string,
    landingPath: string,
    fullName?: string | null,
): Promise<AccessLink> {
    const admin = createAdminClient()
    const redirectTo = `${getAppUrl()}/auth/callback?next=${encodeURIComponent(landingPath)}`

    const existing = await findAuthAccountByEmail(admin, email)
    const plan = accessLinkPlan(existing)

    if (plan !== 'magic_link') {
        if (plan === 'reset_then_invite' && existing) await replaceWithThrowawayPassword(admin, existing.id)

        const invite = await admin.auth.admin.generateLink({
            type: 'invite',
            email,
            options: { redirectTo, data: fullName ? { full_name: fullName } : undefined },
        })
        if (!invite.error && invite.data.properties?.action_link) {
            return {
                url: invite.data.properties.action_link,
                accountCreated: true,
                userId: invite.data.user?.id ?? existing?.id ?? null,
                accountConfirmed: false,
                tokenHash: invite.data.properties.hashed_token ?? null,
                verifyType: 'invite',
            }
        }
        // Solo sigue si la cuenta está confirmada (se confirmó entre medias)
        if (invite.error && !isAlreadyRegisteredMessage(invite.error.message)) throw new Error(invite.error.message)
    }

    const magic = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
    if (magic.error || !magic.data.properties?.action_link) {
        throw new Error(magic.error?.message ?? 'No se pudo generar el enlace de acceso')
    }
    return {
        url: magic.data.properties.action_link,
        accountCreated: false,
        userId: magic.data.user?.id ?? existing?.id ?? null,
        accountConfirmed: true,
        tokenHash: magic.data.properties.hashed_token ?? null,
        verifyType: 'email',
    }
}

export async function buildAthleteAccessLink(email: string, fullName?: string | null): Promise<AccessLink> {
    return buildAccessLink(email, ATHLETE_LANDING_PATH, fullName)
}

/**
 * Enlaza la ficha invitada con la cuenta del enlace, como hacía antes el
 * disparador al crear la cuenta: así el coach puede preparar el plan mientras
 * el atleta no entra. Solo si la cuenta está sin confirmar y nadie conoce su
 * contraseña (canLinkInvitedClient). Si no se enlaza aquí, lo hace la base al
 * confirmar el email o linkPendingClientForUser al entrar.
 */
export async function linkInvitedClient(
    client: { id: string; auth_user_id: string | null; user_id: string | null; status: string | null; is_sample: boolean | null; signed_up_at: string | null },
    access: AccessLink,
) {
    if (!access.userId || access.accountConfirmed || client.auth_user_id) return
    const admin = createAdminClient()
    const { data: others, error } = await admin
        .from('clients')
        .select('id')
        .or(`auth_user_id.eq.${access.userId},user_id.eq.${access.userId}`)
        .eq('status', 'active')
        .neq('id', client.id)
        .limit(1)
    if (error) {
        console.warn('[sendAthleteInvite] link check:', error.message)
        return
    }
    const canLink = canLinkInvitedClient({
        accountId: access.userId,
        accountConfirmed: access.accountConfirmed,
        client,
        otherActiveClients: others?.length ?? 0,
    })
    if (!canLink) return

    const now = new Date().toISOString()
    const { error: updateError } = await admin
        .from('clients')
        .update({
            auth_user_id: access.userId,
            user_id: access.userId,
            signed_up_at: client.signed_up_at ?? now,
            onboarding_updated_at: now,
            updated_at: now,
        })
        .eq('id', client.id)
        .is('auth_user_id', null)
    if (updateError) console.warn('[sendAthleteInvite] link:', updateError.message)
}

/** Nombre con el que firma el coach: su nombre; si no, el del negocio */
async function getCoachSender(coachId: string, coachUserId: string) {
    const admin = createAdminClient()
    const [{ data: profile }, { data: coach }] = await Promise.all([
        admin.from('profiles').select('full_name').eq('id', coachUserId).maybeSingle(),
        admin.from('coaches').select('name').eq('id', coachId).maybeSingle(),
    ])
    const businessName = (coach?.name as string | undefined)?.trim() || null
    const coachName = (profile?.full_name as string | undefined)?.trim() || businessName || 'Tu entrenador'
    return { coachName, businessName }
}

/**
 * Envía (o reenvía) la invitación del atleta con el email nuevo y deja
 * constancia en clients y client_invite_logs.
 */
export async function sendAthleteInvite(params: {
    coachId: string
    coachUserId: string
    clientId: string
    tempPassword?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const admin = createAdminClient()
    const { data: client, error } = await admin
        .from('clients')
        .select('id, email, full_name, is_sample, preferences, status, auth_user_id, user_id, signed_up_at')
        .eq('id', params.clientId)
        .eq('coach_id', params.coachId)
        .maybeSingle()

    if (error || !client) return { ok: false, error: 'Atleta no encontrado' }
    if (client.is_sample) return { ok: false, error: 'Es tu atleta de ejemplo: a ella no se le envía nada.' }
    if (!client.email) return { ok: false, error: 'El atleta no tiene email' }

    let accessUrl: string
    try {
        if (params.tempPassword) {
            accessUrl = `${getAppUrl()}/login`
        } else {
            // Crea la cuenta y enlaza la ficha ya, para que el coach pueda
            // preparar el plan. El email no lleva este enlace de Supabase (de un
            // solo uso, caduca en una hora): lleva la página propia, válida 7
            // días, que genera uno nuevo al pulsar el botón (NXT-145).
            const access = await buildAthleteAccessLink(client.email, client.full_name)
            await linkInvitedClient(client, access)
            accessUrl = buildInvitePageUrl('athlete', client.id)
        }
    } catch (linkError) {
        const message = linkError instanceof Error ? linkError.message : String(linkError)
        await logInvite(params, client.email, 'failed', message)
        return { ok: false, error: 'No se pudo generar el enlace de acceso.' }
    }

    const { coachName, businessName } = await getCoachSender(params.coachId, params.coachUserId)
    const result = await sendAthleteInviteEmail({
        to: client.email,
        athleteName: client.full_name,
        coachName,
        businessName,
        accessUrl,
        tempPassword: params.tempPassword,
        coachId: params.coachId,
    })

    if (!result.ok) {
        await logInvite(params, client.email, 'failed', result.error ?? null)
        return { ok: false, error: result.error || 'No se pudo enviar la invitación' }
    }

    const now = new Date().toISOString()
    // Invitado con el flujo nuevo: al entrar verá la bienvenida guiada.
    // Ojo: la ficha se enlaza (y se marca signed_up_at) en cuanto el enlace
    // crea la cuenta, así que "cuenta creada" es password_set_at (el atleta ya
    // tiene contraseña).
    const preferences = (client.preferences ?? {}) as { onboarding?: Record<string, unknown> }
    const onboarding: Record<string, unknown> = { ...(preferences.onboarding ?? {}), guided: true }
    if (params.tempPassword && !onboarding.password_set_at) onboarding.password_set_at = now
    const accountReady = Boolean(onboarding.password_set_at)
    await admin
        .from('clients')
        .update({
            preferences: { ...preferences, onboarding },
            invited_at: now,
            onboarding_updated_at: now,
            ...(accountReady ? {} : { invite_status: 'sent' }),
        })
        .eq('id', client.id)
    await logInvite(params, client.email, 'sent', null)
    return { ok: true }
}

async function logInvite(
    params: { coachId: string; coachUserId: string; clientId: string },
    email: string,
    status: 'sent' | 'failed',
    errorMessage: string | null,
) {
    const admin = createAdminClient()
    const { error } = await admin.from('client_invite_logs').insert({
        coach_id: params.coachId,
        client_id: params.clientId,
        email,
        status,
        error: errorMessage,
        meta: { flow: 'guided_onboarding' },
        created_by: params.coachUserId,
    })
    if (error) console.warn('[sendAthleteInvite] invite log not saved:', error.message)
}
