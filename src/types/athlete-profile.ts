export type AthleteOnboardingStatus = 'not_started' | 'in_progress' | 'completed'
export type AthleteProfileStatus = 'draft' | 'generating' | 'generated' | 'approved'
export type AthleteAnnualGoalPriority = 'principal' | 'secundario'

export interface AthleteAnnualGoal {
    id: string
    title: string
    targetDate: string
    priority: AthleteAnnualGoalPriority
}

export interface AthleteProfileAnswers {
    athleteDisciplines: string[]
    athleteLevel: string
    experienceContext: string
    currentSituation: string
    weeklyContext: string
    primaryAnnualGoal: string
    secondaryAnnualGoals: string
    annualGoals: AthleteAnnualGoal[]
    injuryHistory: string
    currentIssues: string
    restrictions: string
    monitoringPoints: string
    strengths: string
    weaknesses: string
    adherenceProfile: string
    weeklyAvailability: string
    loadTolerance: string
    trainingHistory: string
    bodyCompositionGoal: string
    nutritionContext: string
    recoveryContext: string
    coachNotes: string
}

export interface AthleteAIProfileOutput {
    athlete_summary: string
    goals_and_calendar: string
    health_and_constraints: string
    training_profile: string
    nutrition_and_body_context: string
    key_points_and_working_rules: string
    system_prompt: string
}

export interface AthleteAIProfile {
    id: string
    coach_id: string
    client_id: string
    onboarding_status: AthleteOnboardingStatus
    profile_status: AthleteProfileStatus
    answers_json: AthleteProfileAnswers
    generated_athlete_summary: string | null
    generated_goals_and_calendar: string | null
    generated_health_and_constraints: string | null
    generated_training_profile: string | null
    generated_nutrition_and_body_context: string | null
    generated_key_points_and_working_rules: string | null
    generated_system_prompt: string | null
    generated_profile_json: AthleteAIProfileOutput | null
    generation_error: string | null
    onboarding_completed_at: string | null
    approved_at: string | null
    created_at: string
    updated_at: string
}

export const ATHLETE_PROFILE_INITIAL_ANSWERS: AthleteProfileAnswers = {
    athleteDisciplines: [],
    athleteLevel: '',
    experienceContext: '',
    currentSituation: '',
    weeklyContext: '',
    primaryAnnualGoal: '',
    secondaryAnnualGoals: '',
    annualGoals: [],
    injuryHistory: '',
    currentIssues: '',
    restrictions: '',
    monitoringPoints: '',
    strengths: '',
    weaknesses: '',
    adherenceProfile: '',
    weeklyAvailability: '',
    loadTolerance: '',
    trainingHistory: '',
    bodyCompositionGoal: '',
    nutritionContext: '',
    recoveryContext: '',
    coachNotes: '',
}
