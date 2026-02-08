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
}

export interface CardioStructure {
    trainingType?: string
    totalDistance?: string
    totalDuration?: string
    blocks: CardioBlock[]
}

export interface CardioBlock {
    id: string
    type: 'warmup' | 'work' | 'rest' | 'cooldown'
    objective_value: string
    objective_unit: 'km' | 'min' | 'm'
    intensity: string
    notes: string
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
