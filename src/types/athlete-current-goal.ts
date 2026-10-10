export const ATHLETE_GOAL_TYPES = [
    { value: 'recomposition', label: 'Recomposición corporal' },
    { value: 'definition', label: 'Definición' },
    { value: 'muscle_gain', label: 'Volumen / ganancia muscular' },
    { value: 'endurance', label: 'Resistencia' },
    { value: 'competition', label: 'Prueba o competición' },
    { value: 'health', label: 'Salud y hábitos' },
    { value: 'other', label: 'Otro objetivo' },
] as const

export type AthleteGoalType = typeof ATHLETE_GOAL_TYPES[number]['value']

export interface AthleteCurrentGoal {
    id: string
    coach_id: string
    client_id: string
    goal_type: AthleteGoalType
    title: string
    start_date: string
    target_date: string
    notes: string | null
    created_at: string
    updated_at: string
}

export type AthleteCurrentGoalInput = Pick<
    AthleteCurrentGoal,
    'goal_type' | 'title' | 'start_date' | 'target_date' | 'notes'
>
