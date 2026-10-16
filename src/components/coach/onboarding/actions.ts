'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { updateCoachOnboardingState } from '@/lib/onboarding/coach-workspace'
import { deleteSampleAthlete } from '@/lib/onboarding/sample-athlete'

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

export async function deleteSampleAthleteAction(coachId: string, clientId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { coachId: validatedCoachId } = await requireActiveCoachId(coachId)
        await deleteSampleAthlete(validatedCoachId, clientId)
        revalidatePath('/coach', 'layout')
        return { success: true }
    } catch (error) {
        console.error('[deleteSampleAthleteAction]', error)
        return { success: false, error: 'No se pudo borrar a Lucía. Inténtalo de nuevo.' }
    }
}
