import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ensurePhotoField, type FormField } from '@/types/forms'

const scale = (label: string, extra: Partial<FormField> = {}): Omit<FormField, 'id'> => ({
    label, type: 'scale', required: true, min: 1, max: 10, step: 1, ...extra,
})

/** Formulario de onboarding general de NexTrain, por secciones */
const ONBOARDING_FIELDS: Omit<FormField, 'id'>[] = [
    { section: 'Sobre ti', label: 'Fecha de nacimiento', type: 'date', required: true },
    { label: 'Altura (cm)', type: 'number', required: true, min: 120, max: 230, step: 1 },
    { label: 'Peso actual (kg)', type: 'number', required: true, min: 30, max: 250, step: 0.1 },
    { label: '¿Cómo es tu día a día?', type: 'single_choice', required: true, options: ['Sentado casi todo el día', 'Algo de movimiento', 'Bastante movimiento', 'Trabajo físico'] },

    { section: 'Tus objetivos', label: '¿Cuál es tu objetivo principal?', type: 'single_choice', required: true, options: ['Perder grasa', 'Ganar músculo', 'Mejorar mi rendimiento', 'Salud y bienestar', 'Preparar una competición'] },
    { label: 'Cuéntame tu objetivo con tus palabras y para cuándo te gustaría conseguirlo', type: 'long_text', required: true },
    { label: '¿Tienes alguna competición o fecha importante a la vista?', type: 'short_text', required: false },

    { section: 'Entrenamiento', label: '¿Cuánto tiempo llevas entrenando?', type: 'single_choice', required: true, options: ['Empiezo ahora', 'Menos de 1 año', 'De 1 a 3 años', 'Más de 3 años'] },
    { label: '¿Qué días y cuánto tiempo puedes entrenar cada semana?', type: 'long_text', required: true },
    { label: '¿Dónde entrenas?', type: 'multi_choice', required: true, options: ['Gimnasio', 'En casa con material', 'En casa sin material', 'Al aire libre'] },
    { label: '¿Practicas algún deporte? (running, ciclismo, pádel…)', type: 'short_text', required: false },

    { section: 'Salud', label: '¿Tienes alguna lesión o molestia, actual o pasada?', type: 'long_text', required: true, helpText: 'Si no tienes ninguna, escribe «ninguna».' },
    { label: 'Medicación o condiciones médicas que deba conocer', type: 'long_text', required: false },
    { label: '¿Cuántas horas duermes de media?', type: 'number', required: true, min: 3, max: 12, step: 0.5 },
    scale('¿Cuánto estrés tienes últimamente? (1 = nada, 10 = muchísimo)'),

    { section: 'Alimentación', label: '¿Cuántas comidas haces al día?', type: 'number', required: true, min: 1, max: 8, step: 1 },
    { label: 'Alergias, intolerancias o alimentos que no comes', type: 'long_text', required: true, helpText: 'Si no tienes ninguna, escribe «ninguna».' },
    { label: '¿Cómo prefieres llevar la dieta?', type: 'single_choice', required: true, options: ['Menú cerrado', 'Opciones para elegir', 'Contar macros', 'No lo sé, que me lo diga mi coach'] },
    { label: '¿Has seguido alguna dieta antes? ¿Qué tal te fue?', type: 'long_text', required: false },
]

/** Formulario de la revisión semanal */
const WEEKLY_REVIEW_FIELDS: Omit<FormField, 'id'>[] = [
    { label: '¿Cómo ha ido la semana?', type: 'long_text', required: true },
    scale('Energía (1 = muy baja, 10 = genial)'),
    scale('Hambre (1 = nada, 10 = muchísima)'),
    scale('Estrés (1 = nada, 10 = muchísimo)'),
    scale('Rendimiento en los entrenamientos'),
    { label: '¿Alguna molestia o lesión?', type: 'short_text', required: false },
    { label: '¿Algo que deba saber para la semana que viene?', type: 'long_text', required: false },
]

function withIds(fields: Omit<FormField, 'id'>[]): FormField[] {
    return ensurePhotoField(fields.map((field, index) => ({ id: `campo_${index + 1}`, ...field })))
}

export const DEFAULT_ONBOARDING_TITLE = 'Onboarding general'
export const DEFAULT_WEEKLY_REVIEW_NAME = 'Revisión semanal'

export interface InviteTemplateOption {
    id: string
    title: string
}

export interface InviteTemplateOptions {
    onboarding: InviteTemplateOption[]
    reviews: (InviteTemplateOption & { frequencyDays: number })[]
    defaultOnboardingId: string | null
    defaultReviewId: string | null
}

/**
 * Plantillas para el bloque "Lo que recibirá". Si el coach no tiene ninguna
 * activa de un tipo, crea la general de NexTrain para que la invitación
 * venga ya rellenada.
 */
export async function ensureInviteTemplates(coachId: string): Promise<InviteTemplateOptions> {
    const admin = createAdminClient()

    let { data: onboarding } = await admin
        .from('form_templates')
        .select('id, title, created_at')
        .eq('coach_id', coachId)
        .eq('type', 'onboarding')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

    if (!onboarding?.length) {
        const { data, error } = await admin
            .from('form_templates')
            .insert({
                coach_id: coachId,
                title: DEFAULT_ONBOARDING_TITLE,
                type: 'onboarding',
                schema: withIds(ONBOARDING_FIELDS),
                assigned_client_ids: [],
                is_active: true,
            })
            .select('id, title, created_at')
        if (error) throw new Error(`form_templates: ${error.message}`)
        onboarding = data
    }

    let { data: reviews } = await admin
        .from('review_templates')
        .select('id, name, default_frequency_days, review_type, created_at')
        .eq('coach_id', coachId)
        .eq('is_active', true)
        .neq('review_type', 'onboarding')
        .order('created_at', { ascending: true })

    if (!reviews?.length) {
        const { data: form, error: formError } = await admin
            .from('form_templates')
            .insert({
                coach_id: coachId,
                title: DEFAULT_WEEKLY_REVIEW_NAME,
                type: 'checkin',
                schema: withIds(WEEKLY_REVIEW_FIELDS),
                assigned_client_ids: [],
                is_active: true,
            })
            .select('id')
            .single()
        if (formError || !form) throw new Error(`form_templates: ${formError?.message}`)

        const { data, error } = await admin
            .from('review_templates')
            .insert({
                coach_id: coachId,
                name: DEFAULT_WEEKLY_REVIEW_NAME,
                description: 'Revisión general de NexTrain: peso, sensaciones de la semana y fotos opcionales.',
                review_type: 'weekly',
                form_template_id: form.id,
                default_frequency_days: 7,
                include_body_metrics: true,
                include_performance_metrics: false,
                include_general_metrics: true,
                include_progress_photos: true,
                photos_required: false,
                photos_max_items: 6,
                is_active: true,
            })
            .select('id, name, default_frequency_days, review_type, created_at')
        if (error) throw new Error(`review_templates: ${error.message}`)
        reviews = data
    }

    const onboardingOptions = (onboarding ?? []).map(template => ({ id: template.id as string, title: template.title as string }))
    const reviewOptions = (reviews ?? []).map(template => ({
        id: template.id as string,
        title: template.name as string,
        frequencyDays: (template.default_frequency_days as number | null) ?? 7,
    }))

    // Preferimos la semanal y la general si existen
    const weekly = reviewOptions.find(option => option.frequencyDays === 7) ?? reviewOptions[0] ?? null
    const general = onboardingOptions.find(option => option.title === DEFAULT_ONBOARDING_TITLE) ?? onboardingOptions[0] ?? null

    return {
        onboarding: onboardingOptions,
        reviews: reviewOptions,
        defaultOnboardingId: general?.id ?? null,
        defaultReviewId: weekly?.id ?? null,
    }
}
