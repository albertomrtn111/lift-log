import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachAssistantWidget } from '@/components/coach/assistant/CoachAssistantWidget'
import { CoachProvider } from '@/contexts/CoachContext'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'
import { getCoachAccess } from '@/lib/subscription/coach-subscription'
import { TrialBanner } from '@/components/coach/subscription/TrialBanner'
import { redirect } from 'next/navigation'

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // El onboarding de IA ya no es obligatorio: solo exigimos contestar la bienvenida
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let access: Awaited<ReturnType<typeof getCoachAccess>> | null = null
    if (user) {
        const coachId = await getCoachIdForUser(user.id)
        if (coachId) {
            const [workspace, coachAccess] = await Promise.all([getCoachWorkspaceInfo(coachId), getCoachAccess(coachId)])
            if (workspace?.onboarding_state.welcome_pending) {
                redirect('/welcome')
            }
            access = coachAccess
        }
    }

    // Prueba terminada o suscripción inactiva: el middleware solo deja abrir
    // /coach/subscription, que se muestra sin el menú del panel
    if (access && !access.access.allowed) {
        return <main className="min-h-screen bg-background pt-[var(--safe-area-top)]">{children}</main>
    }

    const showTrialBanner = access?.access.state === 'trial' && !access.subscription?.stripe_subscription_id

    return (
        <CoachProvider>
            <div className="coach-mobile-shell flex min-h-screen min-w-0 overflow-x-hidden bg-background pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] lg:px-0">
                <CoachSidebar />
                <main className="coach-mobile-main min-w-0 flex-1 overflow-x-hidden pt-[var(--safe-area-top)] max-lg:[&>*>header.sticky]:top-[var(--safe-area-top)] lg:pl-64 lg:pt-0">
                    {showTrialBanner && <TrialBanner daysLeft={access?.access.trialDaysLeft ?? 0} />}
                    {children}
                </main>
                <CoachAssistantWidget />
            </div>
        </CoachProvider>
    )
}
