import 'server-only'

import { sendTeamInviteEmail } from '@/lib/email/mailer'
import { buildAccessLink } from '@/lib/onboarding/athlete-invite'
import { buildInvitePageUrl } from '@/lib/onboarding/invite-link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS } from '@/lib/team/team-rules'

const JOIN_PATH = '/unirse'

/** Pantalla a la que llega quien abre la invitación de equipo */
export function teamJoinPath(invitationId: string): string {
    return `${JOIN_PATH}?invitacion=${invitationId}`
}

/** Envía el email de una invitación. Lanza un error si no se ha podido enviar. */
export async function sendInvitation(params: {
    invitationId: string
    email: string
    role: string
    coachId: string
    inviterId: string
    /** Quien firma, si no es el nombre de quien invita */
    inviterName?: string
}) {
    const admin = createAdminClient()
    // Crea la cuenta si no existe; el email lleva la página propia, válida 7
    // días, que genera el enlace de acceso al pulsar el botón (NXT-145)
    const { accountCreated } = await buildAccessLink(params.email, teamJoinPath(params.invitationId))
    const url = buildInvitePageUrl('team', params.invitationId)
    const [{ data: space }, { data: inviter }] = await Promise.all([
        admin.from('coaches').select('name').eq('id', params.coachId).maybeSingle(),
        admin.from('profiles').select('full_name').eq('id', params.inviterId).maybeSingle(),
    ])
    const spaceName = (space?.name as string | undefined)?.trim() || 'NexTrain'
    const result = await sendTeamInviteEmail({
        to: params.email,
        inviterName: params.inviterName ?? ((inviter?.full_name as string | undefined)?.trim() || spaceName),
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
