import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { sendAthleteInviteEmail } from '@/lib/email/mailer'

/** Pantalla a la que llega el atleta tras abrir el enlace (crear contraseña) */
export const ATHLETE_LANDING_PATH = '/set-password?mode=invite'

function isAlreadyRegistered(message: string) {
    const text = message.toLowerCase()
    return text.includes('already') || text.includes('registered') || text.includes('exists')
}

/**
 * Enlace de un solo uso para entrar sin contraseña. Si la cuenta aún no
 * existe, la crea (invite); si ya existe, es un enlace mágico.
 */
export async function buildAthleteAccessLink(email: string, fullName?: string | null): Promise<string> {
    const admin = createAdminClient()
    const redirectTo = `${getAppUrl()}/auth/callback?next=${encodeURIComponent(ATHLETE_LANDING_PATH)}`

    const invite = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo, data: fullName ? { full_name: fullName } : undefined },
    })
    if (!invite.error && invite.data.properties?.action_link) return invite.data.properties.action_link
    if (invite.error && !isAlreadyRegistered(invite.error.message)) throw new Error(invite.error.message)

    const magic = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
    if (magic.error || !magic.data.properties?.action_link) {
        throw new Error(magic.error?.message ?? 'No se pudo generar el enlace de acceso')
    }
    return magic.data.properties.action_link
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
        .select('id, email, full_name, is_sample')
        .eq('id', params.clientId)
        .eq('coach_id', params.coachId)
        .maybeSingle()

    if (error || !client) return { ok: false, error: 'Atleta no encontrado' }
    if (client.is_sample) return { ok: false, error: 'Es tu atleta de ejemplo: a ella no se le envía nada.' }
    if (!client.email) return { ok: false, error: 'El atleta no tiene email' }

    let accessUrl: string
    try {
        accessUrl = params.tempPassword ? `${getAppUrl()}/login` : await buildAthleteAccessLink(client.email, client.full_name)
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
    await admin
        .from('clients')
        .update({ invite_status: 'sent', invited_at: now, onboarding_updated_at: now })
        .eq('id', client.id)
        .is('signed_up_at', null)
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
