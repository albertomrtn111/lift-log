'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invitationState, normalizeEmail } from '@/lib/team/team-rules'
import { memberLimitErrorMessage } from '@/lib/subscription/plan-limits'

type JoinResult = { success: true; redirectTo: string } | { success: false; error: string }

export async function acceptInvitationAction(invitationId: string): Promise<JoinResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { success: false, error: 'Inicia sesión para aceptar la invitación' }

    const admin = createAdminClient()
    const { data: invitation } = await admin
        .from('coach_invitations')
        .select('id, coach_id, email, role, status, expires_at, needs_password')
        .eq('id', invitationId)
        .maybeSingle()

    if (!invitation || invitationState(invitation) !== 'pending') {
        return { success: false, error: 'Esta invitación ya no es válida' }
    }
    if (normalizeEmail(invitation.email as string) !== normalizeEmail(user.email)) {
        return { success: false, error: 'Esta invitación es para otro email' }
    }

    const { error } = await admin.from('coach_memberships').upsert(
        { coach_id: invitation.coach_id, user_id: user.id, role: invitation.role, status: 'active' },
        { onConflict: 'coach_id,user_id' },
    )
    // El límite de miembros del plan lo aplica la base: la invitación sigue pendiente
    if (error) return { success: false, error: memberLimitErrorMessage(error, 'join') ?? 'No se pudo completar la invitación' }

    await restoreAssignments(admin, invitation.coach_id as string, user.id)

    // Al unirse entra directamente en el espacio nuevo.
    await admin.from('profiles').update({ last_coach_id: invitation.coach_id }).eq('id', user.id)

    await admin
        .from('coach_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)
    await admin.from('coach_member_events').insert({
        coach_id: invitation.coach_id,
        actor_user_id: user.id,
        action: 'joined',
        target_user_id: user.id,
        target_email: user.email,
        details: { role: invitation.role },
    })

    return { success: true, redirectTo: invitation.needs_password ? '/set-password' : '/coach/dashboard' }
}

/** Si ya estuvo en el equipo y le quitaron, vuelve a llevar los atletas que tenía asignados. */
async function restoreAssignments(admin: ReturnType<typeof createAdminClient>, coachId: string, userId: string) {
    const { data: removal } = await admin
        .from('coach_member_events')
        .select('details')
        .eq('coach_id', coachId)
        .eq('target_user_id', userId)
        .eq('action', 'removed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    const saved = (removal?.details as { client_ids?: unknown } | null)?.client_ids
    const clientIds = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
    if (clientIds.length === 0) return

    // Solo los que siguen siendo de este espacio
    const { data: clients } = await admin.from('clients').select('id').eq('coach_id', coachId).in('id', clientIds)
    const rows = (clients ?? []).map(client => ({ client_id: client.id as string, user_id: userId, created_by: userId }))
    if (rows.length === 0) return
    const { error } = await admin.from('client_professionals').upsert(rows, { onConflict: 'client_id,user_id', ignoreDuplicates: true })
    if (error) console.error('[unirse] No se pudieron devolver los atletas asignados', error.message)
}
