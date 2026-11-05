'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEAM_ROLES, invitationState, normalizeEmail } from '@/lib/team/team-rules'

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

    // El selector de espacio aún no existe: cada cuenta trabaja en un solo espacio
    const { data: others } = await admin
        .from('coach_memberships')
        .select('coach_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', TEAM_ROLES)
        .neq('coach_id', invitation.coach_id)
    if ((others ?? []).length > 0) {
        return { success: false, error: 'Tu cuenta ya pertenece a otro espacio. Pide que te inviten con otro email' }
    }

    const { error } = await admin.from('coach_memberships').upsert(
        { coach_id: invitation.coach_id, user_id: user.id, role: invitation.role, status: 'active' },
        { onConflict: 'coach_id,user_id' },
    )
    if (error) return { success: false, error: 'No se pudo completar la invitación' }

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

    return { success: true, redirectTo: invitation.needs_password ? '/set-password' : '/coach' }
}
