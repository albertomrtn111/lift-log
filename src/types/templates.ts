// Training Templates Types
// Based on public.training_templates table

export interface TrainingTemplate {
    id: string
    coach_id: string
    name: string
    description: string | null
    tags: string[] | null
    type: 'strength' | 'cardio' // Added type field
    structure: TemplateStructure
    is_public: boolean
    created_at: string
    updated_at: string
}

// Structure of a training template (days for strength, blocks for cardio)
export type TemplateStructure = StrengthStructure | CardioStructure

export interface StrengthStructure {
    days: TemplateDay[]
    weeks?: number // Defaulting to 4 usually
}

export interface CardioStructure {
    trainingType?: 'rodaje' | 'series' | 'tempo' | 'hybrid' | 'progressive' | 'fartlek' | string
    blocks: CardioBlock[]
}

export type CardioBlockType = 'continuous' | 'intervals' | 'station'

export interface CardioBlock {
    id: string
    type: CardioBlockType
    notes?: string

    // Para 'continuous' (Rodaje, Calentamiento)
    duration?: number // minutos
    distance?: number // km
    intensity?: string // Deprecated in favor of targetPace/targetHR
    targetPace?: string // Ej: "4:15/km", "Suave"
    targetHR?: string   // Ej: "140-150 ppm", "Z2", "< 160"

    // Para 'intervals' (Series: 3x1000m)
    sets?: number // Número de repeticiones
    workDistance?: number // km
    workDuration?: number // minutos
    workIntensity?: string // Deprecated
    workTargetPace?: string
    workTargetHR?: string
    restDuration?: number // minutos
    restDistance?: number // km (recuperación activa)
    restType?: 'active' | 'passive'

    // Deprecated fields kept for type safety during migration if needed, but intended to be removed/unused
    objective_value?: never
    objective_unit?: never
}

export interface TemplateDay {
    id: string
    name: string
    order: number
    exercises: TemplateExercise[]
}

// Keeping TemplateColumn for backward compatibility if needed
export interface TemplateColumn {
    id: string
    name: string
    order: number
    type?: string
}

export interface TemplateExercise {
    id: string
    exercise_name: string
    order: number
    sets: number
    reps: string
    rest_seconds: number
    notes: string | null
}

// Form input types
export interface CreateTemplateInput {
    name: string
    description?: string
    tags?: string[]
    type: 'strength' | 'cardio' // Added type field
}

export interface UpdateTemplateInput {
    name?: string
    description?: string
    tags?: string[]
    type?: 'strength' | 'cardio'
    structure?: TemplateStructure
}
