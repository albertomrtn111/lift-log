import { createClient } from '@/lib/supabase/server'
import type {
    AthleteAIProfile,
    AthleteAIProfileOutput,
    AthleteProfileAnswers,
} from '@/types/athlete-profile'
import { ATHLETE_PROFILE_INITIAL_ANSWERS } from '@/types/athlete-profile'

function normalizeAnswers(raw: unknown): AthleteProfileAnswers {
    if (!raw || typeof raw !== 'object') {
        return { ...ATHLETE_PROFILE_INITIAL_ANSWERS }
    }

    const parsed = raw as Partial<AthleteProfileAnswers>

    return {
        ...ATHLETE_PROFILE_INITIAL_ANSWERS,
        ...parsed,
        athleteDisciplines: Array.isArray(parsed.athleteDisciplines) ? parsed.athleteDisciplines : [],
        annualGoals: Array.isArray(parsed.annualGoals)
            ? parsed.annualGoals
                .filter((goal): goal is AthleteProfileAnswers['annualGoals'][number] => !!goal && typeof goal === 'object')
                .map((goal, index) => ({
                    id: typeof goal.id === 'string' && goal.id.length > 0 ? goal.id : `goal-${index}`,
                    title: typeof goal.title === 'string' ? goal.title : '',
                    targetDate: typeof goal.targetDate === 'string' ? goal.targetDate : '',
                    priority: goal.priority === 'principal' ? 'principal' : 'secundario',
                }))
            : [],
    }
}

function normalizeGeneratedProfile(raw: unknown): AthleteAIProfileOutput | null {
    if (!raw || typeof raw !== 'object') return null

    const parsed = raw as Partial<AthleteAIProfileOutput>

    if (
        typeof parsed.athlete_summary !== 'string' ||
        typeof parsed.goals_and_calendar !== 'string' ||
        typeof parsed.health_and_constraints !== 'string' ||
        typeof parsed.training_profile !== 'string' ||
        typeof parsed.nutrition_and_body_context !== 'string' ||
        typeof parsed.key_points_and_working_rules !== 'string' ||
        typeof parsed.system_prompt !== 'string'
    ) {
        return null
    }

    return {
        athlete_summary: parsed.athlete_summary,
        goals_and_calendar: parsed.goals_and_calendar,
        health_and_constraints: parsed.health_and_constraints,
        training_profile: parsed.training_profile,
        nutrition_and_body_context: parsed.nutrition_and_body_context,
        key_points_and_working_rules: parsed.key_points_and_working_rules,
        system_prompt: parsed.system_prompt,
    }
}

function normalizeProfileRow(data: Record<string, unknown>): AthleteAIProfile {
    return {
        ...data,
        answers_json: normalizeAnswers(data.answers_json),
        generated_profile_json: normalizeGeneratedProfile(data.generated_profile_json),
    } as AthleteAIProfile
}

export async function getAthleteAIProfile(
    coachId: string,
    clientId: string
): Promise<AthleteAIProfile | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('athlete_ai_profiles')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .maybeSingle()

    if (error || !data) return null

    return normalizeProfileRow(data as Record<string, unknown>)
}

export async function markAthleteProfileOnboardingComplete(coachId: string, clientId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .update({
            onboarding_status: 'completed',
            onboarding_completed_at: new Date().toISOString(),
            profile_status: 'generating',
            generation_error: null,
            updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    return { success: !error, error: error?.message }
}

export async function saveGeneratedAthleteProfile(
    coachId: string,
    clientId: string,
    output: AthleteAIProfileOutput
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .update({
            profile_status: 'generated',
            generated_athlete_summary: output.athlete_summary,
            generated_goals_and_calendar: output.goals_and_calendar,
            generated_health_and_constraints: output.health_and_constraints,
            generated_training_profile: output.training_profile,
            generated_nutrition_and_body_context: output.nutrition_and_body_context,
            generated_key_points_and_working_rules: output.key_points_and_working_rules,
            generated_system_prompt: output.system_prompt,
            generated_profile_json: output,
            generation_error: null,
            updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    return { success: !error, error: error?.message }
}

export async function saveAthleteGenerationError(
    coachId: string,
    clientId: string,
    errorMessage: string
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('athlete_ai_profiles')
        .update({
            profile_status: 'draft',
            generation_error: errorMessage,
            updated_at: new Date().toISOString(),
        })
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    return { success: !error, error: error?.message }
}
