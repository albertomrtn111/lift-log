import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachAssistantWidget } from '@/components/coach/assistant/CoachAssistantWidget'
import { CoachProvider } from '@/contexts/CoachContext'
import { CoachNotificationsProvider } from '@/components/coach/notifications/CoachNotificationsProvider'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canManageTeam } from '@/lib/team/team-rules'
import { SpaceBranding, spaceBrandingMetadata } from '@/components/brand/SpaceBranding'
import { getMyWorkspaces } from '@/lib/auth/active-coach'

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
        }
    }

    return (
        <SpaceBranding>
            <CoachProvider>
                <CoachNotificationsProvider>
                    <div className="coach-mobile-shell flex min-h-screen min-w-0 overflow-x-hidden bg-background pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] lg:px-0">
                        <CoachSidebar workspaces={await getMyWorkspaces()} studioEnabled={studioEnabled} />
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
