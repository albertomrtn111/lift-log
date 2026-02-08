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

// Structure of a training template (days, columns, exercises)
export interface TemplateStructure {
    days: TemplateDay[]
}

export interface TemplateDay {
    id: string
    name: string
    order: number
    columns: TemplateColumn[]
}

export interface TemplateColumn {
    id: string
    name: string
    order: number
    exercises: TemplateExercise[]
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
