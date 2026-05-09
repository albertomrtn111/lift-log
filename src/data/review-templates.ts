import { createClient } from '@/lib/supabase/server'
import type { MetricDefinition } from '@/types/metrics'

// ============================================================================
// TYPES
// ============================================================================

export type ReviewType = 'weekly' | 'biweekly' | 'monthly' | 'manual' | 'onboarding' | 'custom'

export interface ReviewTemplate {
    id: string
    coach_id: string
    name: string
    description: string | null
    review_type: ReviewType
    form_template_id: string | null
    default_frequency_days: number

    include_body_metrics: boolean
    include_performance_metrics: boolean
    include_general_metrics: boolean

    include_progress_photos: boolean
    photos_required: boolean
    photos_max_items: number

    is_active: boolean
    created_at: string
    updated_at: string
}

export interface ReviewTemplateMetric {
    id: string
    review_template_id: string
    metric_id: string
    required: boolean
    created_at: string
}

export interface ReviewTemplateInput {
    name: string
    description?: string | null
    review_type?: ReviewType
    form_template_id?: string | null
    default_frequency_days?: number
    include_body_metrics?: boolean
    include_performance_metrics?: boolean
    include_general_metrics?: boolean
    include_progress_photos?: boolean
    photos_required?: boolean
    photos_max_items?: number
    is_active?: boolean
}

// ============================================================================
// QUERIES
// ============================================================================

export async function listReviewTemplates(coachId: string): Promise<ReviewTemplate[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('review_templates')
        .select('*')
        .eq('coach_id', coachId)
        .order('is_active', { ascending: false })
        .order('name', { ascending: true })

    if (error) {
        console.error('[listReviewTemplates]', error)
        return []
    }
    return (data ?? []) as ReviewTemplate[]
}

export async function getReviewTemplate(id: string): Promise<ReviewTemplate | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('review_templates')
        .select('*')
        .eq('id', id)
        .maybeSingle()

    if (error) {
        console.error('[getReviewTemplate]', error)
        return null
    }
    return (data as ReviewTemplate) ?? null
}

export async function listReviewTemplateMetrics(reviewTemplateId: string): Promise<ReviewTemplateMetric[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('review_template_metrics')
        .select('*')
        .eq('review_template_id', reviewTemplateId)

    if (error) {
        console.error('[listReviewTemplateMetrics]', error)
        return []
    }
    return (data ?? []) as ReviewTemplateMetric[]
}

// ============================================================================
// MUTATIONS
// ============================================================================

export async function createReviewTemplate(
    coachId: string,
    input: ReviewTemplateInput
): Promise<ReviewTemplate> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('review_templates')
        .insert({
            coach_id: coachId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            review_type: input.review_type ?? 'custom',
            form_template_id: input.form_template_id ?? null,
            default_frequency_days: input.default_frequency_days ?? 14,
            include_body_metrics: input.include_body_metrics ?? false,
            include_performance_metrics: input.include_performance_metrics ?? false,
            include_general_metrics: input.include_general_metrics ?? false,
            include_progress_photos: input.include_progress_photos ?? false,
            photos_required: input.photos_required ?? false,
            photos_max_items: input.photos_max_items ?? 6,
            is_active: input.is_active ?? true,
        })
        .select('*')
        .single()

    if (error) throw error
    return data as ReviewTemplate
}

export async function updateReviewTemplate(
    id: string,
    patch: Partial<ReviewTemplateInput>
): Promise<void> {
    const supabase = await createClient()
    const update: Record<string, unknown> = {}

    if (patch.name !== undefined) update.name = patch.name.trim()
    if (patch.description !== undefined) update.description = patch.description?.trim() || null
    if (patch.review_type !== undefined) update.review_type = patch.review_type
    if (patch.form_template_id !== undefined) update.form_template_id = patch.form_template_id
    if (patch.default_frequency_days !== undefined) update.default_frequency_days = patch.default_frequency_days
    if (patch.include_body_metrics !== undefined) update.include_body_metrics = patch.include_body_metrics
    if (patch.include_performance_metrics !== undefined) update.include_performance_metrics = patch.include_performance_metrics
    if (patch.include_general_metrics !== undefined) update.include_general_metrics = patch.include_general_metrics
    if (patch.include_progress_photos !== undefined) update.include_progress_photos = patch.include_progress_photos
    if (patch.photos_required !== undefined) update.photos_required = patch.photos_required
    if (patch.photos_max_items !== undefined) update.photos_max_items = patch.photos_max_items
    if (patch.is_active !== undefined) update.is_active = patch.is_active

    const { error } = await supabase
        .from('review_templates')
        .update(update)
        .eq('id', id)

    if (error) throw error
}

export async function deleteReviewTemplate(id: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase
        .from('review_templates')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export async function setReviewTemplateMetrics(
    reviewTemplateId: string,
    metricIds: string[],
    requiredIds: string[] = []
): Promise<void> {
    const supabase = await createClient()
    const requiredSet = new Set(requiredIds)

    if (metricIds.length === 0) {
        const { error } = await supabase
            .from('review_template_metrics')
            .delete()
            .eq('review_template_id', reviewTemplateId)
        if (error) throw error
        return
    }

    const rows = metricIds.map(metric_id => ({
        review_template_id: reviewTemplateId,
        metric_id,
        required: requiredSet.has(metric_id),
    }))

    // Primero hacemos upsert de la nueva selección. Así, si falla la inserción,
    // la configuración anterior no queda borrada a medias.
    const { error: upsertError } = await supabase
        .from('review_template_metrics')
        .upsert(rows, { onConflict: 'review_template_id,metric_id' })
    if (upsertError) throw upsertError

    const metricList = metricIds.map(id => `"${id}"`).join(',')
    const { error: pruneError } = await supabase
        .from('review_template_metrics')
        .delete()
        .eq('review_template_id', reviewTemplateId)
        .not('metric_id', 'in', `(${metricList})`)

    if (pruneError) throw pruneError
}

// ============================================================================
// BUSINESS LOGIC: resolución de métricas para una plantilla
// ============================================================================

/**
 * Devuelve las métricas que debe pedir una revisión basada en su plantilla.
 *
 * Lógica:
 *  1. Si la plantilla tiene filas en review_template_metrics → usar esa selección exacta (Nivel 2).
 *  2. Si no → incluir métricas activas según los flags include_*_metrics (Nivel 1).
 *
 * Solo devuelve métricas activas (is_active=true) en ambos casos.
 */
export async function resolveMetricsForReviewTemplate(
    template: ReviewTemplate
): Promise<MetricDefinition[]> {
    const supabase = await createClient()

    // Cargar todas las métricas activas del coach
    const { data: allMetrics, error: metricsErr } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('coach_id', template.coach_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

    if (metricsErr) {
        console.error('[resolveMetricsForReviewTemplate] metrics', metricsErr)
        return []
    }

    const metrics = (allMetrics ?? []) as MetricDefinition[]

    // Nivel 2: selección avanzada
    const { data: explicit, error: explicitErr } = await supabase
        .from('review_template_metrics')
        .select('metric_id')
        .eq('review_template_id', template.id)

    if (explicitErr) {
        console.error('[resolveMetricsForReviewTemplate] explicit', explicitErr)
    }

    if (explicit && explicit.length > 0) {
        const allowed = new Set(explicit.map(r => r.metric_id))
        return metrics.filter(m => allowed.has(m.id))
    }

    // Nivel 1: por grupos
    return metrics.filter(m => {
        if (m.category === 'body' && template.include_body_metrics) return true
        if (m.category === 'performance' && template.include_performance_metrics) return true
        if (m.category === 'general' && template.include_general_metrics) return true
        return false
    })
}
