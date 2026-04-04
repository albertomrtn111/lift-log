'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

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
