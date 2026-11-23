'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { inviteOutcome, readInviteToken } from '@/lib/auth/invite-tokens.js'
import { ATHLETE_LANDING_PATH, buildAccessLink, linkInvitedClient, type AccessLink } from '@/lib/onboarding/athlete-invite'
import { inviteLinkSecret } from '@/lib/onboarding/invite-link'
import { invitationState } from '@/lib/team/team-rules'
import { teamJoinPath } from '@/lib/team/send-invitation'

export type OpenInviteResult =
    | { status: 'access'; tokenHash: string; type: 'invite' | 'email'; next: string }
    | { status: 'login' }
    | { status: 'expired' }
    | { status: 'gone' }
    | { status: 'error' }

function accessResult(access: AccessLink, next: string): OpenInviteResult {
    if (!access.tokenHash) return { status: 'error' }
    return { status: 'access', tokenHash: access.tokenHash, type: access.verifyType, next }
}

/**
 * Botón de la página de la invitación (/auth/invitacion/<token>). Solo aquí se
 * genera el enlace de acceso de Supabase, así que abrir la página (o que la
 * abra el antispam del correo) no gasta nada (NXT-145).
 */
export async function openInviteAction(token: string): Promise<OpenInviteResult> {
    let secret: string
    try {
        secret = inviteLinkSecret()
    } catch (error) {
        console.error('[openInviteAction]', error instanceof Error ? error.message : error)
        return { status: 'error' }
    }
    const read = readInviteToken(token, secret)
    if (!read.ok) return { status: read.reason === 'expired' ? 'expired' : 'gone' }
    const { kind, id } = read.payload
    const admin = createAdminClient()

    try {
        if (kind === 'athlete') {
            const { data: client } = await admin
                .from('clients')
                .select('id, email, full_name, status, is_sample, preferences, auth_user_id, user_id, signed_up_at')
                .eq('id', id)
                .maybeSingle()
            const onboarding = ((client?.preferences ?? {}) as { onboarding?: { password_set_at?: string } }).onboarding
            const outcome = inviteOutcome({
                kind,
                athlete: client ? { ...client, passwordSet: Boolean(onboarding?.password_set_at) } : null,
            })
            if (outcome !== 'access' || !client?.email) return { status: outcome === 'login' ? 'login' : 'gone' }

            const access = await buildAccessLink(client.email, ATHLETE_LANDING_PATH, client.full_name)
            await linkInvitedClient(client, access)
            return accessResult(access, ATHLETE_LANDING_PATH)
        }

        const { data: invitation } = await admin
            .from('coach_invitations')
            .select('id, email, status, expires_at')
            .eq('id', id)
            .maybeSingle()
        const outcome = inviteOutcome({
            kind,
            team: invitation ? { state: invitationState(invitation), email: invitation.email as string | null } : null,
        })
        if (outcome !== 'access' || !invitation?.email) return { status: outcome === 'login' ? 'login' : 'gone' }

        const next = teamJoinPath(invitation.id as string)
        const access = await buildAccessLink(invitation.email as string, next)
        if (access.accountCreated) {
            await admin.from('coach_invitations').update({ needs_password: true }).eq('id', invitation.id)
        }
        return accessResult(access, next)
    } catch (error) {
        console.error('[openInviteAction]', error instanceof Error ? error.message : error)
        return { status: 'error' }
    }
}
