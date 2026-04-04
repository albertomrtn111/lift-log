import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfile } from '@/data/coach-ai-profile'
import { redirect } from 'next/navigation'
import { CoachAIOnboarding } from '@/components/coach/ai-onboarding/CoachAIOnboarding'

export default async function CoachAIOnboardingPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) redirect('/no-access')

    // If already approved, redirect to dashboard — no reason to be here
    const profile = await getCoachAIProfile(coachId)
    if (profile?.profile_status === 'approved') {
        redirect('/coach/dashboard')
    }

    return <CoachAIOnboarding />
}
