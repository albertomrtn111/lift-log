'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { updateCoachOnboardingState } from '@/lib/onboarding/coach-workspace'

export async function dismissOnboardingChecklistAction(coachId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { coachId: validatedCoachId } = await requireActiveCoachId(coachId)
        await updateCoachOnboardingState(validatedCoachId, { checklist_dismissed_at: new Date().toISOString() })
        revalidatePath('/coach/dashboard')
        return { success: true }
    } catch (error) {
        console.error('[dismissOnboardingChecklistAction]', error)
        return { success: false, error: 'No se pudo ocultar. Inténtalo de nuevo.' }
    }
}
