import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachAssistantWidget } from '@/components/coach/assistant/CoachAssistantWidget'
import { CoachProvider } from '@/contexts/CoachContext'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { coachNeedsAIOnboarding } from '@/data/coach-ai-profile'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // Check if coach needs AI onboarding — skip if already on the onboarding page
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') ?? headersList.get('x-invoke-path') ?? ''
    const isOnboardingPage = pathname.includes('/ai-onboarding')

    if (!isOnboardingPage) {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const coachId = await getCoachIdForUser(user.id)
            if (coachId) {
                const needsOnboarding = await coachNeedsAIOnboarding(coachId)
                if (needsOnboarding) {
                    redirect('/coach/ai-onboarding')
                }
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
