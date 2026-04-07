'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import type {
    AthleteAIProfileOutput,
    AthleteProfileAnswers,
} from '@/types/athlete-profile'
import { getAthleteAIProfile } from '@/data/athlete-ai-profile'

export async function saveAthleteProfileStep(
    clientId: string,
    answers: AthleteProfileAnswers
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .upsert(
            {
                coach_id: coachId,
                client_id: clientId,
                onboarding_status: 'in_progress',
                answers_json: answers,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'coach_id,client_id' }
        )

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function approveAthleteProfile(
    clientId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .update({
            profile_status: 'approved',
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function updateGeneratedAthleteProfileSections(
    clientId: string,
    sections: Pick<
        AthleteAIProfileOutput,
        | 'athlete_summary'
        | 'goals_and_calendar'
        | 'health_and_constraints'
        | 'training_profile'
        | 'nutrition_and_body_context'
        | 'key_points_and_working_rules'
    >
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

    const currentProfile = await getAthleteAIProfile(coachId, clientId)
    if (!currentProfile) return { success: false, error: 'Perfil no encontrado' }

    const nextJson: AthleteAIProfileOutput = {
        athlete_summary: sections.athlete_summary,
        goals_and_calendar: sections.goals_and_calendar,
        health_and_constraints: sections.health_and_constraints,
        training_profile: sections.training_profile,
        nutrition_and_body_context: sections.nutrition_and_body_context,
        key_points_and_working_rules: sections.key_points_and_working_rules,
        system_prompt: currentProfile.generated_system_prompt || currentProfile.generated_profile_json?.system_prompt || '',
    }

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .update({
            generated_athlete_summary: sections.athlete_summary,
            generated_goals_and_calendar: sections.goals_and_calendar,
            generated_health_and_constraints: sections.health_and_constraints,
            generated_training_profile: sections.training_profile,
            generated_nutrition_and_body_context: sections.nutrition_and_body_context,
            generated_key_points_and_working_rules: sections.key_points_and_working_rules,
            generated_profile_json: nextJson,
            updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/clients')
    return { success: true }
}
