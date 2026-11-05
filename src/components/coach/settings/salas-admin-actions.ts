'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendInvitation } from '@/lib/team/send-invitation'
import { isValidEmail, normalizeEmail } from '@/lib/team/team-rules'

export interface SalaSummary {
    coachId: string
    name: string
    createdAt: string
    ownerActive: boolean
    invitationId: string | null
    invitedEmail: string | null
}

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const STUDIO_PLAN = 'studio'
const STUDIO_CLIENT_LIMIT = 250
const NOT_ALLOWED = 'Solo el equipo de NexTrain puede dar de alta salas.'

async function getPlatformAdminId(): Promise<string | null> {
    const supabase = await createClient()
    const [{ data: isAdmin }, { data: { user } }] = await Promise.all([
        supabase.rpc('is_platform_admin'),
        supabase.auth.getUser(),
    ])
    return isAdmin === true && user ? user.id : null
}

export async function getSalasAction(): Promise<ActionResult<SalaSummary[]>> {
    if (!(await getPlatformAdminId())) return { success: false, error: NOT_ALLOWED }

    const admin = createAdminClient()
    const { data: subscriptions, error } = await admin
        .from('coach_subscriptions')
        .select('coach_id')
        .eq('plan', STUDIO_PLAN)
    if (error) return { success: false, error: 'No se pudo cargar la lista.' }

    const ids = (subscriptions ?? []).map(row => row.coach_id as string)
    if (ids.length === 0) return { success: true, data: [] }

    const [{ data: spaces }, { data: owners }, { data: invitations }] = await Promise.all([
        admin.from('coaches').select('id, name, created_at').in('id', ids).order('created_at', { ascending: false }),
        admin.from('coach_memberships').select('coach_id').in('coach_id', ids).eq('role', 'owner').eq('status', 'active'),
        admin.from('coach_invitations').select('id, coach_id, email').in('coach_id', ids).eq('role', 'owner').eq('status', 'pending'),
    ])
    const withOwner = new Set((owners ?? []).map(row => row.coach_id))
    const invitationBySpace = new Map((invitations ?? []).map(row => [row.coach_id, row]))

    return {
        success: true,
        data: (spaces ?? []).map(space => {
            const invitation = invitationBySpace.get(space.id)
            return {
                coachId: space.id,
                name: space.name,
                createdAt: space.created_at,
                ownerActive: withOwner.has(space.id),
                invitationId: invitation?.id ?? null,
                invitedEmail: invitation?.email ?? null,
            }
        }),
    }
}

/**
 * Crea el espacio de una sala con el plan Studio de cortesía e invita a su propietario.
 * El espacio queda creado aunque falle el email: se puede reenviar desde la lista.
 */
export async function createSalaAction(input: { name: string; ownerEmail: string }): Promise<ActionResult> {
    const inviterId = await getPlatformAdminId()
    if (!inviterId) return { success: false, error: NOT_ALLOWED }

    const name = input.name.replace(/\s+/g, ' ').trim()
    const email = normalizeEmail(input.ownerEmail)
    if (name.length < 2 || name.length > 80) return { success: false, error: 'El nombre debe tener entre 2 y 80 caracteres.' }
    if (!isValidEmail(email)) return { success: false, error: 'Escribe un email válido.' }

    const admin = createAdminClient()
    const { data: space, error } = await admin
        .from('coaches')
        .insert({
            name,
            created_by: inviterId,
            subscription_tier: STUDIO_PLAN,
            billing_cycle: 'monthly',
            max_active_clients: STUDIO_CLIENT_LIMIT,
            onboarding_state: { studio_pending: true },
        })
        .select('id')
        .single()
    if (error || !space) return { success: false, error: 'No se pudo crear la sala.' }

    const { error: planError } = await admin
        .from('coach_subscriptions')
        .upsert(
            { coach_id: space.id, status: 'comped', plan: STUDIO_PLAN, billing_cycle: 'monthly' },
            { onConflict: 'coach_id' }
        )
    if (planError) return { success: false, error: 'La sala se ha creado, pero no se pudo activar su plan.' }

    const { data: invitation, error: invitationError } = await admin
        .from('coach_invitations')
        .insert({ coach_id: space.id, email, role: 'owner', invited_by: inviterId })
        .select('id')
        .single()
    if (invitationError || !invitation) {
        return { success: false, error: 'La sala se ha creado, pero no se pudo preparar la invitación.' }
    }

    try {
        await sendInvitation({
            invitationId: invitation.id,
            email,
            role: 'owner',
            coachId: space.id,
            inviterId,
            inviterName: 'NexTrain',
        })
        return { success: true }
    } catch {
        return { success: false, error: 'La sala se ha creado, pero el email no se ha enviado. Reenvíalo desde la lista.' }
    }
}

export async function resendSalaInvitationAction(invitationId: string): Promise<ActionResult> {
    const inviterId = await getPlatformAdminId()
    if (!inviterId) return { success: false, error: NOT_ALLOWED }

    const admin = createAdminClient()
    const { data: invitation } = await admin
        .from('coach_invitations')
        .select('id, coach_id, email')
        .eq('id', invitationId)
        .eq('role', 'owner')
        .eq('status', 'pending')
        .maybeSingle()
    if (!invitation) return { success: false, error: 'Esta invitación ya no está pendiente.' }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await admin.from('coach_invitations').update({ expires_at: expiresAt }).eq('id', invitation.id)

    try {
        await sendInvitation({
            invitationId: invitation.id,
            email: invitation.email,
            role: 'owner',
            coachId: invitation.coach_id,
            inviterId,
            inviterName: 'NexTrain',
        })
        return { success: true }
    } catch {
        return { success: false, error: 'No se pudo enviar el email.' }
    }
}
