import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { AuthShell, AuthStatus, SUPPORT_EMAIL } from '@/components/auth/AuthShell'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachWorkspaceInfo, ensureCoachWorkspace, getSignupIntent } from '@/lib/onboarding/coach-workspace'
import { resumeSetupStep } from '@/lib/onboarding/coach-setup.js'
import { isExpectedAthletesId } from '@/lib/onboarding/coach-options'
import { canManageTeam } from '@/lib/team/team-rules.js'
import { getCoachAIProfile } from '@/data/coach-ai-profile'
import { coachHasInAppAI } from '@/lib/onboarding/coach-setup-profile'
import { CoachSetupWizard, type MethodState } from './CoachSetupWizard'
import { finishSetupAction, saveSetupStepAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Primer día del coach tras confirmar el email (NXT-186): crea su espacio si
 * aún no existe y abre la configuración guiada: sus datos, su método y su voz.
 * Con lo que contesta se escribe su perfil, y la IA lo pule al terminar.
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

    // Solo el propietario o un administrador configuran el espacio (NXT-163)
    const admin = createAdminClient()
    const [{ data: membership }, { data: profile }, { data: coach }, aiProfile, aiEnabled] = await Promise.all([
        admin.from('coach_memberships').select('role').eq('coach_id', coachId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
        admin.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
        admin.from('coaches').select('city, instagram, website').eq('id', coachId).maybeSingle(),
        getCoachAIProfile(coachId),
        coachHasInAppAI(coachId),
    ])
    if (!canManageTeam(membership?.role ?? '')) redirect('/coach/dashboard')

    const metadataName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
    const fullName = profile?.full_name?.trim() || metadataName
    const savedStep = workspace.onboarding_state.setup_step
    // El espacio nace con el nombre del coach: no lo damos por nombre de negocio
    // hasta que haya pasado por ese paso.
    const businessSaved = Boolean(savedStep) && savedStep !== 'tu' && savedStep !== 'negocio'
    const businessName = workspace.name && workspace.name !== 'Mi espacio'
        && (businessSaved || (workspace.name !== fullName && workspace.name !== metadataName))
        ? workspace.name
        : ''

    const method: MethodState = {
        specialty: aiProfile?.specialty ?? [],
        client_types: aiProfile?.client_types ?? [],
        athlete_level: aiProfile?.athlete_level ?? [],
        training_priorities: aiProfile?.training_priorities ?? [],
        progression_style: aiProfile?.progression_style ?? '',
        training_philosophy: aiProfile?.training_philosophy ?? '',
        macro_or_options: aiProfile?.macro_or_options ?? '',
        nutrition_no_progress_action: aiProfile?.nutrition_no_progress_action ?? '',
        nutrition_rules: aiProfile?.nutrition_rules ?? '',
        metrics_vs_feelings: aiProfile?.metrics_vs_feelings ?? '',
        checkin_priorities: aiProfile?.checkin_priorities ?? '',
        alert_types: aiProfile?.alert_types ?? '',
        communication_tone: aiProfile?.communication_tone ?? '',
        response_style: aiProfile?.response_style ?? [],
        free_notes: aiProfile?.free_notes ?? '',
    }

    return (
        <CoachSetupWizard
            aiEnabled={aiEnabled}
            firstName={fullName.split(/\s+/)[0] || null}
            saveStep={saveSetupStepAction}
            finish={finishSetupAction}
            initial={{
                step: resumeSetupStep(savedStep, workspace.disciplines),
                resumed: Boolean(savedStep) || Boolean(profile?.phone),
                about: { fullName, phone: profile?.phone ?? '', city: coach?.city ?? '' },
                business: {
                    businessName,
                    instagram: coach?.instagram ? `@${coach.instagram}` : '',
                    website: coach?.website ?? '',
                },
                disciplines: workspace.disciplines,
                expectedAthletes: isExpectedAthletesId(workspace.expected_athletes) ? workspace.expected_athletes : null,
                method,
            }}
        />
    )
}
