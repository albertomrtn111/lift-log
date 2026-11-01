import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { AuthShell, AuthStatus, SUPPORT_EMAIL } from '@/components/auth/AuthShell'
import { WelcomeForm } from './WelcomeForm'
import { ensureCoachWorkspace, getCoachWorkspaceInfo, getSignupIntent } from '@/lib/onboarding/coach-workspace'

export const dynamic = 'force-dynamic'

/**
 * Primera pantalla del coach tras confirmar el email: crea su espacio
 * (si aún no existe) y pide tres datos del negocio.
 */
export default async function WelcomePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    let coachId = await getCoachIdForUser(user.id)

    if (!coachId) {
        const intent = getSignupIntent(user)
        // Sin plan elegido en el registro no es un alta de coach
        if (!intent) redirect('/no-access')
        try {
            coachId = await ensureCoachWorkspace(user, intent)
        } catch (error) {
            console.error('[welcome] No se pudo crear el espacio:', error)
            return (
                <AuthShell>
                    <AuthStatus icon={AlertCircle} tone="destructive" title="No hemos podido preparar tu espacio">
                        <p>Recarga la página en unos segundos. Si sigue fallando, escríbenos a {SUPPORT_EMAIL}.</p>
                    </AuthStatus>
                </AuthShell>
            )
        }
    }

    const workspace = await getCoachWorkspaceInfo(coachId)
    if (!workspace || !workspace.onboarding_state.welcome_pending) redirect('/coach/dashboard')

    const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
    // El nombre por defecto del espacio es el del coach: no lo damos por bueno como nombre de negocio
    const businessName = workspace.name && workspace.name !== fullName && workspace.name !== 'Mi espacio' ? workspace.name : ''

    return (
        <AuthShell
            panelTitle={<>Tu método, <span className="text-brand-soft">a escala</span></>}
            panelText="En unos minutos tendrás a tu primer atleta dentro con su plan."
        >
            <WelcomeForm
                firstName={fullName.split(/\s+/)[0] || null}
                initialBusinessName={businessName}
                initialDisciplines={workspace.disciplines}
                initialExpectedAthletes={workspace.expected_athletes}
            />
        </AuthShell>
    )
}
