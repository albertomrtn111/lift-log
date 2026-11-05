import { redirect } from 'next/navigation'
import { SalaOnboardingWizard } from '@/components/coach/onboarding/SalaOnboardingWizard'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { getCoachWorkspaceInfo } from '@/lib/onboarding/coach-workspace'

export default async function SalaOnboardingPage() {
    const coachId = await getActiveCoachId()
    const workspace = coachId ? await getCoachWorkspaceInfo(coachId) : null
    if (!workspace?.onboarding_state.studio_pending) redirect('/coach/dashboard')

    return <SalaOnboardingWizard />
}
