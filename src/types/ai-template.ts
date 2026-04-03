export interface AIStrengthTemplateRow {
    dia: string
    ejercicio: string
    series: number
    reps: string
    rir: string
    rest: number
    notas: string
}

export interface AIStrengthTemplate {
    type: 'strength'
    name: string
    description: string
    tags: string[]
    rows: AIStrengthTemplateRow[]
}

export interface AICardioTemplate {
    type: 'cardio'
    name: string
    description: string
    tags: string[]
    trainingType: 'rodaje' | 'series' | 'tempo' | 'hybrid' | 'progressive' | 'fartlek'
    details: string
    clientNotes: string
}

export type AIGeneratedTemplate = AIStrengthTemplate | AICardioTemplate
