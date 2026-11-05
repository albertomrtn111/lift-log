'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCoachActor } from '@/lib/auth/get-coach-actor'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAccessLink } from '@/lib/onboarding/athlete-invite'
import { sendTeamInviteEmail } from '@/lib/email/mailer'
import {
    INVITABLE_ROLES,
    ROLE_LABELS,
    TEAM_ROLES,
    canChangeMember,
    canManageTeam,
    invitationState,
    isValidEmail,
    normalizeEmail,
    seatsLeft,
} from '@/lib/team/team-rules'

export interface TeamMember {
    userId: string
    name: string
    email: string
    role: string
    isYou: boolean
    canChange: boolean
}

export interface TeamInvitation {
    id: string
    email: string
    role: string
    state: string
    expiresAt: string
}

export interface TeamData {
    enabled: boolean
    canManage: boolean
    seats: number | null
    members: TeamMember[]
    invitations: TeamInvitation[]
}

interface ActionResult {
    success: boolean
    error?: string
}

const JOIN_PATH = '/unirse'

/** Comprueba que quien actúa puede gestionar el equipo y que su plan lo incluye. */
async function requireTeamManager() {
    const actor = await getCoachActor()
    if (!canManageTeam(actor.role)) throw new Error('No tienes permiso para gestionar el equipo')
    const { data: enabled } = await actor.supabase.rpc('coach_has_feature', {
        p_coach_id: actor.coachId,
        p_feature: 'team',
    })
    if (!enabled) throw new Error('Tu plan no incluye equipo')
    return actor
}

async function logEvent(event: {
    coachId: string
    actorUserId: string
    action: string
    targetUserId?: string
    targetEmail?: string
    details?: Record<string, unknown>
}) {
    const { error } = await createAdminClient().from('coach_member_events').insert({
        coach_id: event.coachId,
        actor_user_id: event.actorUserId,
        action: event.action,
        target_user_id: event.targetUserId ?? null,
        target_email: event.targetEmail ?? null,
        details: event.details ?? {},
    })
    if (error) console.error('[team] No se pudo registrar el evento', error.message)
}

async function countSeats(coachId: string, supabase: SupabaseClient) {
    const admin = createAdminClient()
    const [{ data: limit }, { count: active }, { data: pending }] = await Promise.all([
        supabase.rpc('coach_feature_limit', { p_coach_id: coachId, p_feature: 'max_members' }),
        admin.from('coach_memberships').select('id', { count: 'exact', head: true })
            .eq('coach_id', coachId).eq('status', 'active').in('role', TEAM_ROLES),
        admin.from('coach_invitations').select('status, expires_at').eq('coach_id', coachId).eq('status', 'pending'),
    ])
    const open = (pending ?? []).filter(row => invitationState(row) === 'pending').length
    return seatsLeft(limit as number | null, active ?? 0, open)
}

async function sendInvitation(params: {
    invitationId: string
    email: string
    role: string
    coachId: string
    inviterId: string
}) {
    const admin = createAdminClient()
    const { url, accountCreated } = await buildAccessLink(params.email, `${JOIN_PATH}?invitacion=${params.invitationId}`)
    const [{ data: space }, { data: inviter }] = await Promise.all([
        admin.from('coaches').select('name').eq('id', params.coachId).maybeSingle(),
        admin.from('profiles').select('full_name').eq('id', params.inviterId).maybeSingle(),
    ])
    const spaceName = (space?.name as string | undefined)?.trim() || 'NexTrain'
    const result = await sendTeamInviteEmail({
        to: params.email,
        inviterName: (inviter?.full_name as string | undefined)?.trim() || spaceName,
        spaceName,
        roleLabel: ROLE_LABELS[params.role as keyof typeof ROLE_LABELS] ?? params.role,
        accessUrl: url,
        coachId: params.coachId,
    })
    if (accountCreated) {
        await admin.from('coach_invitations').update({ needs_password: true }).eq('id', params.invitationId)
    }
    if (!result.ok) throw new Error(result.error || 'No se pudo enviar el email')
}

export async function getTeamAction(): Promise<{ success: boolean; team?: TeamData; error?: string }> {
    try {
        const actor = await getCoachActor()
        const { data: enabled } = await actor.supabase.rpc('coach_has_feature', {
            p_coach_id: actor.coachId,
            p_feature: 'team',
        })
        const canManage = canManageTeam(actor.role)
        const admin = createAdminClient()
        const { data: rows, error } = await admin
            .from('coach_memberships')
            .select('user_id, role')
            .eq('coach_id', actor.coachId)
            .eq('status', 'active')
            .in('role', TEAM_ROLES)
        if (error) throw error

        const ids = (rows ?? []).map(row => row.user_id as string)
        const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', ids)
        const byId = new Map((profiles ?? []).map(profile => [profile.id as string, profile]))

        const members: TeamMember[] = (rows ?? []).map(row => {
            const profile = byId.get(row.user_id as string)
            const email = (profile?.email as string | null) ?? ''
            return {
                userId: row.user_id as string,
                name: (profile?.full_name as string | null)?.trim() || email,
                email,
                role: row.role as string,
                isYou: row.user_id === actor.userId,
                canChange: canChangeMember({
                    actorRole: actor.role,
                    actorUserId: actor.userId,
                    targetRole: row.role,
                    targetUserId: row.user_id,
                }),
            }
        })

        let invitations: TeamInvitation[] = []
        if (canManage) {
            const { data: pending } = await admin
                .from('coach_invitations')
                .select('id, email, role, status, expires_at')
                .eq('coach_id', actor.coachId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
            invitations = (pending ?? []).map(row => ({
                id: row.id as string,
                email: row.email as string,
                role: row.role as string,
                state: invitationState(row),
                expiresAt: row.expires_at as string,
            }))
        }

        return {
            success: true,
            team: {
                enabled: Boolean(enabled),
                canManage,
                seats: await countSeats(actor.coachId, actor.supabase),
                members,
                invitations,
            },
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo cargar el equipo' }
    }
}

export async function inviteMemberAction(input: { email: string; role: string }): Promise<ActionResult> {
    try {
        const actor = await requireTeamManager()
        const email = normalizeEmail(input.email)
        if (!isValidEmail(email)) return { success: false, error: 'Escribe un email válido' }
        if (!INVITABLE_ROLES.includes(input.role)) return { success: false, error: 'Ese rol no se puede invitar' }

        const seats = await countSeats(actor.coachId, actor.supabase)
        if (seats === 0) return { success: false, error: 'Tu plan no admite más miembros' }

        const admin = createAdminClient()
        const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
        if (profile) {
            const { data: member } = await admin
                .from('coach_memberships')
                .select('id')
                .eq('coach_id', actor.coachId)
                .eq('user_id', profile.id)
                .eq('status', 'active')
                .in('role', TEAM_ROLES)
                .maybeSingle()
            if (member) return { success: false, error: 'Esa persona ya está en el equipo' }
        }

        // Una invitación caducada deja sitio a la nueva
        await admin
            .from('coach_invitations')
            .update({ status: 'revoked' })
            .eq('coach_id', actor.coachId)
            .eq('email', email)
            .eq('status', 'pending')
            .lte('expires_at', new Date().toISOString())

        const { data: invitation, error } = await admin
            .from('coach_invitations')
            .insert({ coach_id: actor.coachId, email, role: input.role, invited_by: actor.userId })
            .select('id')
            .single()
        if (error) {
            if (error.code === '23505') return { success: false, error: 'Ya hay una invitación pendiente para ese email' }
            throw error
        }

        await sendInvitation({
            invitationId: invitation.id as string,
            email,
            role: input.role,
            coachId: actor.coachId,
            inviterId: actor.userId,
        })
        await logEvent({
            coachId: actor.coachId,
            actorUserId: actor.userId,
            action: 'invited',
            targetEmail: email,
            details: { role: input.role },
        })
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo invitar' }
    }
}

export async function resendInvitationAction(invitationId: string): Promise<ActionResult> {
    try {
        const actor = await requireTeamManager()
        const admin = createAdminClient()
        const { data: invitation } = await admin
            .from('coach_invitations')
            .select('id, email, role')
            .eq('id', invitationId)
            .eq('coach_id', actor.coachId)
            .eq('status', 'pending')
            .maybeSingle()
        if (!invitation) return { success: false, error: 'Invitación no encontrada' }

        await admin
            .from('coach_invitations')
            .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
            .eq('id', invitationId)
        await sendInvitation({
            invitationId,
            email: invitation.email as string,
            role: invitation.role as string,
            coachId: actor.coachId,
            inviterId: actor.userId,
        })
        await logEvent({
            coachId: actor.coachId,
            actorUserId: actor.userId,
            action: 'invitation_resent',
            targetEmail: invitation.email as string,
        })
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo reenviar' }
    }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
    try {
        const actor = await requireTeamManager()
        const { data, error } = await createAdminClient()
            .from('coach_invitations')
            .update({ status: 'revoked' })
            .eq('id', invitationId)
            .eq('coach_id', actor.coachId)
            .eq('status', 'pending')
            .select('email')
            .maybeSingle()
        if (error) throw error
        if (!data) return { success: false, error: 'Invitación no encontrada' }
        await logEvent({
            coachId: actor.coachId,
            actorUserId: actor.userId,
            action: 'invitation_revoked',
            targetEmail: data.email as string,
        })
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo cancelar' }
    }
}

async function loadTarget(coachId: string, userId: string) {
    const { data } = await createAdminClient()
        .from('coach_memberships')
        .select('role')
        .eq('coach_id', coachId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
    return data?.role as string | undefined
}

export async function changeMemberRoleAction(input: { userId: string; role: string }): Promise<ActionResult> {
    try {
        const actor = await requireTeamManager()
        if (!INVITABLE_ROLES.includes(input.role)) return { success: false, error: 'Ese rol no se puede asignar' }
        const targetRole = await loadTarget(actor.coachId, input.userId)
        if (!targetRole) return { success: false, error: 'Miembro no encontrado' }
        if (!canChangeMember({ actorRole: actor.role, actorUserId: actor.userId, targetRole, targetUserId: input.userId })) {
            return { success: false, error: 'No puedes cambiar a este miembro' }
        }

        const { error } = await createAdminClient()
            .from('coach_memberships')
            .update({ role: input.role })
            .eq('coach_id', actor.coachId)
            .eq('user_id', input.userId)
        if (error) throw error
        await logEvent({
            coachId: actor.coachId,
            actorUserId: actor.userId,
            action: 'role_changed',
            targetUserId: input.userId,
            details: { from: targetRole, to: input.role },
        })
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo cambiar el rol' }
    }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
    try {
        const actor = await requireTeamManager()
        const targetRole = await loadTarget(actor.coachId, userId)
        if (!targetRole) return { success: false, error: 'Miembro no encontrado' }
        if (!canChangeMember({ actorRole: actor.role, actorUserId: actor.userId, targetRole, targetUserId: userId })) {
            return { success: false, error: 'No puedes quitar a este miembro' }
        }

        const admin = createAdminClient()
        const { error } = await admin
            .from('coach_memberships')
            .update({ status: 'inactive' })
            .eq('coach_id', actor.coachId)
            .eq('user_id', userId)
        if (error) throw error

        const { data: clients } = await admin.from('clients').select('id').eq('coach_id', actor.coachId)
        const clientIds = (clients ?? []).map(client => client.id as string)
        if (clientIds.length > 0) {
            await admin.from('client_professionals').delete().eq('user_id', userId).in('client_id', clientIds)
        }
        await logEvent({
            coachId: actor.coachId,
            actorUserId: actor.userId,
            action: 'removed',
            targetUserId: userId,
            details: { role: targetRole },
        })
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo quitar al miembro' }
    }
}
