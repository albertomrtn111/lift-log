import { redirect } from 'next/navigation'
import { Link2Off, Users } from 'lucide-react'
import { AuthShell, AuthStatus } from '@/components/auth/AuthShell'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABELS, invitationState, normalizeEmail } from '@/lib/team/team-rules'
import { JoinButton } from './JoinButton'

interface JoinPageProps {
    searchParams: Promise<{ invitacion?: string }>
}

function Invalid({ message }: { message: string }) {
    return (
        <AuthShell>
            <AuthStatus icon={Link2Off} tone="muted" title="No se puede usar esta invitación">
                <p>{message}</p>
            </AuthStatus>
        </AuthShell>
    )
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
    const { invitacion } = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    if (!invitacion || !/^[0-9a-f-]{36}$/i.test(invitacion)) {
        return <Invalid message="El enlace no es válido. Pide que te lo reenvíen." />
    }

    const admin = createAdminClient()
    const { data: invitation } = await admin
        .from('coach_invitations')
        .select('id, coach_id, email, role, status, expires_at')
        .eq('id', invitacion)
        .maybeSingle()

    if (!invitation || normalizeEmail(invitation.email as string) !== normalizeEmail(user.email)) {
        return <Invalid message="Esta invitación es para otra cuenta." />
    }
    if (invitationState(invitation) !== 'pending') {
        return <Invalid message="La invitación ha caducado o ya se ha usado. Pide que te la reenvíen." />
    }

    const { data: space } = await admin.from('coaches').select('name').eq('id', invitation.coach_id).maybeSingle()
    const role = ROLE_LABELS[invitation.role as keyof typeof ROLE_LABELS] ?? invitation.role

    return (
        <AuthShell>
            <AuthStatus
                icon={Users}
                title={`Únete a ${(space?.name as string | undefined) ?? 'este espacio'}`}
                actions={<JoinButton invitationId={invitation.id as string} />}
            >
                <p>Entrarás en el equipo como {role}.</p>
            </AuthStatus>
        </AuthShell>
    )
}
