import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfile } from '@/data/coach-ai-profile'
import { redirect } from 'next/navigation'
import { CoachAIOnboarding } from '@/components/coach/ai-onboarding/CoachAIOnboarding'

interface CoachAIOnboardingPageProps {
    searchParams: Promise<{ reconfigure?: string }>
}

export default async function CoachAIOnboardingPage({ searchParams }: CoachAIOnboardingPageProps) {
    const params = await searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) redirect('/no-access')

    const isReconfigure = params.reconfigure === '1'

    const profile = await getCoachAIProfile(coachId)

    // If already approved, only allow access when explicitly reconfiguring
    if (profile?.profile_status === 'approved' && !isReconfigure) {
        redirect('/coach/dashboard')
    }

    return <CoachAIOnboarding initialProfile={profile} />
}
