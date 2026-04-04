import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachAIProfile {
    id: string
    coach_id: string
    onboarding_status: 'not_started' | 'in_progress' | 'completed'
    onboarding_completed_at: string | null
    profile_status: 'draft' | 'generating' | 'generated' | 'approved'
    approved_at: string | null

    // Step 1
    specialty: string[]
    client_types: string[]
    athlete_level: string[]

    // Step 2
    training_philosophy: string | null
    training_priorities: string[]
    progression_style: string | null
    training_avoid: string | null
    exercise_preferences: string | null

    // Step 3
    nutrition_approach: string | null
    macro_or_options: string | null
    nutrition_adjustment_priority: string | null
    nutrition_no_progress_action: string | null
    nutrition_rules: string | null

    // Step 4
    checkin_priorities: string | null
    adjustment_signals: string | null
    metrics_vs_feelings: string | null
    review_structure_preference: string | null
    alert_types: string | null

    // Step 5
    communication_tone: string | null
    response_style: string[]
    free_notes: string | null
    final_description: string | null

    // Generated (Level 2)
    generated_profile_summary: string | null
    generated_methodology: {
        training: string
        nutrition: string
        reviews: string
    } | null
    generated_communication_style: string | null
    generated_master_rules: {
        always_do: string[]
        never_do: string[]
        decision_criteria: string[]
    } | null
    generated_system_prompt: string | null
    generated_profile_json: Record<string, unknown> | null
    generation_error: string | null

    created_at: string
    updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries — server-only, use admin client (bypass RLS for internal reads)
// Safe to call from: server components, API routes, server actions, layouts.
// Do NOT import from client components.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read coach AI profile by coachId.
 * Used by AI features to personalize their output.
 * Returns null if no profile exists.
 */
export async function getCoachAIProfile(coachId: string): Promise<CoachAIProfile | null> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('coach_ai_profiles')
        .select('*')
        .eq('coach_id', coachId)
        .single()

    if (error || !data) return null
    return data as CoachAIProfile
}

/**
 * Check if the coach needs to go through AI onboarding.
 * Returns true if they should be redirected to /coach/ai-onboarding.
 */
export async function coachNeedsAIOnboarding(coachId: string): Promise<boolean> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('coach_ai_profiles')
        .select('profile_status')
        .eq('coach_id', coachId)
        .single()

    if (!data) return true
    return data.profile_status !== 'approved'
}

/**
 * Mark onboarding as completed and set profile_status to generating.
 * Called from the API route before the AI call.
 */
export async function markOnboardingComplete(coachId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('coach_ai_profiles')
        .update({
            onboarding_status: 'completed',
            onboarding_completed_at: new Date().toISOString(),
            profile_status: 'generating',
        })
        .eq('coach_id', coachId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

/**
 * Save the AI-generated profile fields after generation.
 * Called from the API route after Gemini responds.
 */
export async function saveGeneratedProfile(
    coachId: string,
    generated: {
        generated_profile_summary: string
        generated_methodology: CoachAIProfile['generated_methodology']
        generated_communication_style: string
        generated_master_rules: CoachAIProfile['generated_master_rules']
        generated_system_prompt: string
        generated_profile_json: Record<string, unknown>
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('coach_ai_profiles')
        .update({
            ...generated,
            profile_status: 'generated',
            generation_error: null,
        })
        .eq('coach_id', coachId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

/**
 * Save a generation error and revert profile_status to draft.
 */
export async function saveGenerationError(coachId: string, errorMessage: string): Promise<void> {
    const supabase = createAdminClient()
    await supabase
        .from('coach_ai_profiles')
        .update({ profile_status: 'draft', generation_error: errorMessage })
        .eq('coach_id', coachId)
}
