import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { readInviteToken } from '@/lib/auth/invite-tokens.js'
import { inviteLinkSecret } from '@/lib/onboarding/invite-link'
import { InviteAccess, InviteBroken } from './InviteAccess'

export const metadata: Metadata = {
    title: 'Tu invitación · NexTrain',
    robots: { index: false, follow: false },
}

/**
 * Enlace de los emails de invitación (atleta y equipo), válido 7 días.
 * Abrir la página no hace nada: el enlace de acceso de Supabase se genera al
 * pulsar el botón (NXT-145).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    let read: ReturnType<typeof readInviteToken>
    try {
        read = readInviteToken(decodeURIComponent(token), inviteLinkSecret())
    } catch {
        read = { ok: false, reason: 'invalid' }
    }

    return (
        <AuthShell>
            {read.ok
                ? <InviteAccess token={decodeURIComponent(token)} kind={read.payload.kind} />
                : <InviteBroken reason={read.reason === 'expired' ? 'expired' : 'gone'} />}
        </AuthShell>
    )
}
