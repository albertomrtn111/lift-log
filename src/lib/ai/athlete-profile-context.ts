import 'server-only'

import { getAthleteAIProfile } from '@/data/athlete-ai-profile'
import type { AthleteAIProfile, AthleteAIProfileOutput, AthleteProfileAnswers } from '@/types/athlete-profile'

type AthleteProfileContextInput = Pick<
    AthleteAIProfile,
    'profile_status' | 'answers_json' | 'generated_profile_json'
>

type RawAthleteProfileRow = {
    profile_status?: string | null
    answers_json?: Partial<AthleteProfileAnswers> | null
    generated_profile_json?: Partial<AthleteAIProfileOutput> | null
}

function asGeneratedProfile(raw: RawAthleteProfileRow['generated_profile_json']): Partial<AthleteAIProfileOutput> | null {
    return raw && typeof raw === 'object' ? raw : null
}

function asAnswers(raw: RawAthleteProfileRow['answers_json']): Partial<AthleteProfileAnswers> {
    return raw && typeof raw === 'object' ? raw : {}
}

export function formatAthleteProfileContext(
    profile: AthleteProfileContextInput | RawAthleteProfileRow | null,
    fallback = 'Sin perfil del atleta generado. Usa solo el contexto disponible y las instrucciones del entrenador.'
) {
    if (!profile) return fallback

    const generated = asGeneratedProfile(profile.generated_profile_json)
    const answers = asAnswers(profile.answers_json)
    const lines = [
        `Estado del perfil: ${profile.profile_status || 'desconocido'}`,
        generated?.athlete_summary ? `Resumen del atleta: ${generated.athlete_summary}` : '',
        generated?.goals_and_calendar ? `Objetivos y calendario: ${generated.goals_and_calendar}` : '',
        generated?.health_and_constraints ? `Salud y limitaciones: ${generated.health_and_constraints}` : '',
        generated?.training_profile ? `Perfil de entrenamiento: ${generated.training_profile}` : '',
        generated?.nutrition_and_body_context ? `Nutrición y composición: ${generated.nutrition_and_body_context}` : '',
        generated?.key_points_and_working_rules ? `Reglas de trabajo: ${generated.key_points_and_working_rules}` : '',
        answers.athleteDisciplines?.length ? `Disciplinas: ${answers.athleteDisciplines.join(', ')}` : '',
        answers.athleteLevel ? `Nivel: ${answers.athleteLevel}` : '',
        answers.currentSituation ? `Situación actual: ${answers.currentSituation}` : '',
        answers.primaryAnnualGoal ? `Objetivo principal: ${answers.primaryAnnualGoal}` : '',
    ].filter(Boolean)

    return lines.length > 1 ? lines.join('\n') : fallback
}

export async function getAthleteProfileContextForCoach(coachId: string | null, clientId: string) {
    if (!coachId) return formatAthleteProfileContext(null)
    const profile = await getAthleteAIProfile(coachId, clientId)
    return formatAthleteProfileContext(profile)
}
