'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireActiveCoachId, type CoachAuthResult } from '@/lib/auth/require-coach'
import { revalidatePath } from 'next/cache'
import type { CoachAIProfile } from '@/data/coach-ai-profile'

/**
 * Upsert step data during onboarding.
 * Merges partial updates — never overwrites the whole row.
 * Called from CoachAIOnboarding (client component).
 */
export async function saveOnboardingStep(
    stepData: Partial<Omit<CoachAIProfile, 'id' | 'coach_id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> {
    let supabase: CoachAuthResult['supabase'], coachId: string
    try {
        ;({ supabase, coachId } = await requireActiveCoachId())
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Sin acceso de coach' }
    }

    const { error } = await supabase
        .from('coach_ai_profiles')
        .upsert(
            {
                coach_id: coachId,
                onboarding_status: 'in_progress',
                ...stepData,
            },
            { onConflict: 'coach_id' }
        )

    if (error) return { success: false, error: error.message }
    return { success: true }
}

/**
 * Approve the generated profile.
 * After this the coach passes the onboarding gate and enters the app normally.
 * Called from CoachAIOnboarding (client component).
 */
export async function approveCoachAIProfile(): Promise<{ success: boolean; error?: string }> {
    let supabase: CoachAuthResult['supabase'], coachId: string
    try {
        ;({ supabase, coachId } = await requireActiveCoachId())
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Sin acceso de coach' }
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
        .from('coach_ai_profiles')
        .update({
            profile_status: 'approved',
            approved_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/dashboard')
    return { success: true }
}
