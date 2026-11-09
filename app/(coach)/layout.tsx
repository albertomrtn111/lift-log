import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachAssistantWidget } from '@/components/coach/assistant/CoachAssistantWidget'
import { CoachProvider } from '@/contexts/CoachContext'
import { CoachNotificationsProvider } from '@/components/coach/notifications/CoachNotificationsProvider'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canManageTeam } from '@/lib/team/team-rules'
import { SpaceBranding, spaceBrandingMetadata } from '@/components/brand/SpaceBranding'
import { getMyWorkspaces } from '@/lib/auth/active-coach'
import { premiumFontVars } from '@/lib/premium-fonts'
import '@/styles/nt-premium.css'
import { ENVIRONMENT_COOKIE, ENVIRONMENT_HOME, spaceEnvironment } from '@/lib/coach/environment-rules'
import './coach-premium.css'

export const generateMetadata = spaceBrandingMetadata

const SALA_ONBOARDING_PATH = '/coach/sala-inicio'

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // El onboarding de IA ya no es obligatorio: solo exigimos contestar la bienvenida
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let studioEnabled = false
    let environment = spaceEnvironment({ studio: false, online: true, saved: null })
    if (user) {
        const coachId = await getCoachIdForUser(user.id)
        if (coachId) {
            const { data: hasStudio } = await supabase.rpc('coach_has_feature', {
                p_coach_id: coachId,
                p_feature: 'studio_mode',
            })
            studioEnabled = hasStudio === true
            const workspace = await getCoachWorkspaceInfo(coachId)
            if (workspace?.onboarding_state.welcome_pending) {
                redirect('/welcome')
            }
            // Sala nueva: el propietario y los administradores pasan por el onboarding.
            const pathname = (await headers()).get('x-pathname') ?? ''
            const role = (await getMyWorkspaces()).find(item => item.coach_id === coachId)?.role
            if (
                workspace?.onboarding_state.studio_pending
                && canManageTeam(role ?? '')
                && pathname !== SALA_ONBOARDING_PATH
            ) {
                redirect(SALA_ONBOARDING_PATH)
            }

            // Online y Sala son entornos aparte. Quien solo tiene sala no ve el interruptor.
            if (studioEnabled) {
                const online = await Promise.all(['training_programs', 'cardio_sessions', 'macro_plans'].map(table =>
                    supabase.from(table).select('id', { count: 'exact', head: true }).eq('coach_id', coachId)))
                environment = spaceEnvironment({
                    studio: true,
                    online: online.some(result => (result.count ?? 0) > 0),
                    saved: (await cookies()).get(ENVIRONMENT_COOKIE)?.value,
                })
                // Al entrar se vuelve al entorno en el que estabas.
                if (environment.environment === 'sala' && pathname === ENVIRONMENT_HOME.online) {
                    redirect(ENVIRONMENT_HOME.sala)
                }
            }
        }
    }

    return (
        <SpaceBranding>
            <style dangerouslySetInnerHTML={{ __html: premiumFontVars }} />
            <CoachProvider>
                <CoachNotificationsProvider>
                    <div className="coach-shell coach-mobile-shell flex min-h-screen min-w-0 overflow-x-hidden bg-background pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] lg:px-0">
                        {/* Tapa la barra de estado del iPhone: el contenido pasa por debajo sin verse */}
                        <div className="app-mobile-statusbar lg:hidden" aria-hidden="true" />
                        <CoachSidebar workspaces={await getMyWorkspaces()} environment={environment} />
                        <main className="coach-mobile-main min-w-0 flex-1 overflow-x-hidden pt-[var(--safe-area-top)] max-lg:[&>*>header.sticky]:top-[var(--safe-area-top)] lg:pl-64 lg:pt-0">
                            {children}
                        </main>
                        <CoachAssistantWidget />
                    </div>
                </CoachNotificationsProvider>
            </CoachProvider>
        </SpaceBranding>
    )
}
