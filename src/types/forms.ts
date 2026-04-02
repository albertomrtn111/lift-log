// Form template types — maps to public.form_templates

export type FormFieldType =
    | 'short_text'
    | 'long_text'
    | 'number'
    | 'scale'
    | 'single_choice'
    | 'multi_choice'
    | 'date'
    | 'photo_upload'

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
    isFixed?: boolean       // locked fields cannot be deleted or moved
    multiple?: boolean      // photo_upload: allow multiple files
    maxItems?: number       // photo_upload: max number of files
}

export interface FormTemplate {
    id: string
    coach_id: string
    title: string
    type: 'checkin' | 'onboarding' | 'general'
    schema: FormField[]
    assigned_client_ids: string[]
    is_active: boolean
    created_at: string
    is_default: boolean
}

export interface CreateFormTemplateInput {
    title: string
    type: 'checkin' | 'onboarding' | 'general'
    schema: FormField[]
    assigned_client_ids?: string[]
}

export interface FormBuilderInitialData {
    title: string
    schema: FormField[]
}

// ---------------------------------------------------------------------------
// Fixed photo upload field — auto-injected at the end of every schema
// ---------------------------------------------------------------------------

export const PROGRESS_PHOTOS_FIELD: FormField = {
    id: 'progress_photos',
    label: 'Fotos de progreso',
    type: 'photo_upload',
    required: false,
    helpText: 'Sube fotos (frontal, lateral y espalda).',
    isFixed: true,
    multiple: true,
    maxItems: 6,
}

/**
 * Ensures the fixed photo_upload field exists at the end of a schema array.
 * - If missing, appends it.
 * - If present but not last, moves it to the end.
 * - Always resets its properties to the canonical definition.
 * Returns a new array (does not mutate).
 */
export function ensurePhotoField(schema: FormField[]): FormField[] {
    const withoutFixed = schema.filter(
        (f) => !(f.id === 'progress_photos' || (f.type === 'photo_upload' && f.isFixed))
    )
    return [...withoutFixed, { ...PROGRESS_PHOTOS_FIELD }]
}
