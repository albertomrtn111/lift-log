// Form template types — maps to public.form_templates

export type FormFieldType =
    | 'short_text'
    | 'long_text'
    | 'number'
    | 'scale'
    | 'single_choice'
    | 'multi_choice'
    | 'date'

export interface FormField {
    id: string             // auto-generated stable ID, e.g. "campo_1"
    label: string          // visible question text (free text)
    type: FormFieldType
    required: boolean
    min?: number | null     // number & scale
    max?: number | null     // number & scale
    step?: number | null    // number & scale
    options?: string[]      // single_choice & multi_choice
    helpText?: string | null
}

export interface FormTemplate {
    id: string
    coach_id: string
    title: string
    type: 'checkin' | 'onboarding' | 'general'
    schema: FormField[]
    is_active: boolean
    created_at: string
    is_default: boolean
}

export interface CreateFormTemplateInput {
    title: string
    type: 'checkin' | 'onboarding' | 'general'
    schema: FormField[]
}
