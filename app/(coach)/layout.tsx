import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachAssistantWidget } from '@/components/coach/assistant/CoachAssistantWidget'
import { CoachProvider } from '@/contexts/CoachContext'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'
import { redirect } from 'next/navigation'

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // El onboarding de IA ya no es obligatorio: solo exigimos contestar la bienvenida
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
        const coachId = await getCoachIdForUser(user.id)
        if (coachId) {
            const workspace = await getCoachWorkspaceInfo(coachId)
            if (workspace?.onboarding_state.welcome_pending) {
                redirect('/welcome')
            }
        }
    }

    return (
        <CoachProvider>
            <div className="coach-mobile-shell flex min-h-screen min-w-0 overflow-x-hidden bg-background pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] lg:px-0">
                <CoachSidebar />
                <main className="coach-mobile-main min-w-0 flex-1 overflow-x-hidden pt-[var(--safe-area-top)] max-lg:[&>*>header.sticky]:top-[var(--safe-area-top)] lg:pl-64 lg:pt-0">
                    {children}
                </main>
                <CoachAssistantWidget />
            </div>
        </CoachProvider>
    )
}
