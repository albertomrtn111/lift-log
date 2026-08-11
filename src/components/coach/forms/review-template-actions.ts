'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createClient } from '@/lib/supabase/server'
import {
    createReviewTemplate,
    updateReviewTemplate,
    deleteReviewTemplate,
    getReviewTemplate,
    setReviewTemplateMetrics,
    listReviewTemplateMetrics,
    type ReviewTemplateInput,
} from '@/data/review-templates'
import { buildDuplicatedReviewTemplateInput } from '@/lib/reviews/review-template-copy'
import { ensurePhotoField, type FormField } from '@/types/forms'

export async function listReviewTemplateMetricsAction(
    reviewTemplateId: string
): Promise<string[]> {
    const { coachId } = await requireActiveCoachId()
    await assertReviewTemplateBelongsToCoach(reviewTemplateId, coachId)
    const rows = await listReviewTemplateMetrics(reviewTemplateId)
    return rows.map(r => r.metric_id)
}

interface ActionResult {
    success: boolean
    id?: string
    formTemplateId?: string
    error?: string
    deactivated?: boolean
}

function inferGeneratedReviewCadence(title: string): {
    reviewType: ReviewTemplateInput['review_type']
    frequencyDays: number
} {
    const normalized = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

    if (/\b(quincenal|biweekly)\b/.test(normalized)) {
        return { reviewType: 'biweekly', frequencyDays: 14 }
    }
    if (/\b(semanal|weekly)\b/.test(normalized)) {
        return { reviewType: 'weekly', frequencyDays: 7 }
    }
    if (/\b(mensual|monthly)\b/.test(normalized)) {
        return { reviewType: 'monthly', frequencyDays: 30 }
    }
    return { reviewType: 'custom', frequencyDays: 14 }
}

export async function createGeneratedReviewAction(input: {
    title: string
    schema: FormField[]
}): Promise<ActionResult> {
    const title = input.title.trim()
    if (!title) return { success: false, error: 'El nombre es obligatorio' }

    const schema = ensurePhotoField(input.schema)
    if (!schema.some(field => field.type !== 'photo_upload')) {
        return { success: false, error: 'El formulario debe tener al menos una pregunta' }
    }

    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const { data: formTemplate, error: formError } = await supabase
            .from('form_templates')
            .insert({
                coach_id: coachId,
                title,
                type: 'checkin',
                schema,
                assigned_client_ids: [],
                is_active: true,
            })
            .select('id')
            .single()

        if (formError || !formTemplate) {
            throw formError ?? new Error('No se pudo crear el formulario')
        }

        try {
            const cadence = inferGeneratedReviewCadence(title)
            const reviewTemplate = await createReviewTemplate(coachId, {
                name: title,
                description: 'Creada a partir de un formulario generado con IA.',
                review_type: cadence.reviewType,
                form_template_id: formTemplate.id,
                default_frequency_days: cadence.frequencyDays,
                include_body_metrics: false,
                include_performance_metrics: false,
                include_general_metrics: false,
                include_progress_photos: false,
                photos_required: false,
                photos_max_items: 6,
                is_active: true,
            })

            revalidatePath('/coach/forms')
            revalidatePath('/coach/members')
            return {
                success: true,
                id: reviewTemplate.id,
                formTemplateId: formTemplate.id,
            }
        } catch (reviewError) {
            const { error: rollbackError } = await supabase
                .from('form_templates')
                .delete()
                .eq('id', formTemplate.id)
                .eq('coach_id', coachId)

            if (rollbackError) {
                console.error('[createGeneratedReviewAction] Rollback failed:', rollbackError)
            }
            throw reviewError
        }
    } catch (error) {
        console.error('[createGeneratedReviewAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al crear la revisión generada',
        }
    }
}

async function assertReviewTemplateBelongsToCoach(reviewTemplateId: string, coachId: string): Promise<void> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('review_templates')
        .select('id')
        .eq('id', reviewTemplateId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) {
        throw new Error('No tienes permiso para modificar esta plantilla')
    }
}

async function assertFormTemplateBelongsToCoach(formTemplateId: string | null | undefined, coachId: string): Promise<void> {
    if (!formTemplateId) return

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('form_templates')
        .select('id')
        .eq('id', formTemplateId)
        .eq('coach_id', coachId)
        .eq('type', 'checkin')
        .maybeSingle()

    if (error || !data) {
        throw new Error('El formulario asociado no pertenece a este workspace')
    }
}

async function getScheduleCountForReviewTemplate(reviewTemplateId: string, coachId: string): Promise<number> {
    const supabase = await createClient()
    const { count, error } = await supabase
        .from('client_review_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('review_template_id', reviewTemplateId)
        .eq('coach_id', coachId)

    if (error) throw error
    return count ?? 0
}

async function assertMetricIdsBelongToCoach(metricIds: string[], coachId: string): Promise<void> {
    if (metricIds.length === 0) return

    const uniqueMetricIds = Array.from(new Set(metricIds))
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('metric_definitions')
        .select('id')
        .eq('coach_id', coachId)
        .in('id', uniqueMetricIds)

    if (error) throw error
    if ((data ?? []).length !== uniqueMetricIds.length) {
        throw new Error('Hay métricas seleccionadas que no pertenecen a este workspace')
    }
}

function validateInput(input: ReviewTemplateInput): string | null {
    if (!input.name || input.name.trim().length === 0) {
        return 'El nombre es obligatorio'
    }
    if (input.default_frequency_days !== undefined) {
        if (!Number.isInteger(input.default_frequency_days)) {
            return 'La frecuencia debe ser un número entero'
        }
        if (input.default_frequency_days < 1 || input.default_frequency_days > 365) {
            return 'La frecuencia debe estar entre 1 y 365 días'
        }
    }
    if (input.photos_max_items !== undefined) {
        if (input.photos_max_items < 1 || input.photos_max_items > 20) {
            return 'El máximo de fotos debe estar entre 1 y 20'
        }
    }
    return null
}

export async function createReviewTemplateAction(
    input: ReviewTemplateInput,
    metricIds: string[] = []
): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        const validationError = validateInput(input)
        if (validationError) return { success: false, error: validationError }
        await assertFormTemplateBelongsToCoach(input.form_template_id, coachId)
        await assertMetricIdsBelongToCoach(metricIds, coachId)

        const created = await createReviewTemplate(coachId, input)

        if (metricIds.length > 0) {
            await setReviewTemplateMetrics(created.id, metricIds)
        }

        revalidatePath('/coach/forms')
        return { success: true, id: created.id }
    } catch (error) {
        console.error('[createReviewTemplateAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al crear la plantilla',
        }
    }
}

export async function updateReviewTemplateAction(
    id: string,
    patch: Partial<ReviewTemplateInput>,
    metricIds?: string[]
): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertReviewTemplateBelongsToCoach(id, coachId)
        const validationError = validateInput({ name: 'placeholder', ...patch })
        if (validationError) {
            return { success: false, error: validationError }
        }
        if (patch.form_template_id !== undefined) {
            await assertFormTemplateBelongsToCoach(patch.form_template_id, coachId)
        }
        if (metricIds !== undefined) {
            await assertMetricIdsBelongToCoach(metricIds, coachId)
        }

        await updateReviewTemplate(id, patch)

        if (metricIds !== undefined) {
            await setReviewTemplateMetrics(id, metricIds)
        }

        // Las revisiones pendientes resuelven métricas y fotos en vivo desde la
        // plantilla, pero las preguntas vienen del form_template_id guardado en el
        // checkin. Si el coach cambia el formulario, sincronizamos los pendientes
        // para que el atleta no vea preguntas viejas con métricas nuevas.
        if (patch.form_template_id !== undefined) {
            const supabase = await createClient()
            await supabase
                .from('checkins')
                .update({ form_template_id: patch.form_template_id })
                .eq('review_template_id', id)
                .eq('status', 'pending')
                .is('submitted_at', null)
        }

        revalidatePath('/coach/forms')
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        revalidatePath('/coach/calendar')
        return { success: true, id }
    } catch (error) {
        console.error('[updateReviewTemplateAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al actualizar la plantilla',
        }
    }
}

export async function duplicateReviewTemplateAction(id: string): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertReviewTemplateBelongsToCoach(id, coachId)

        const source = await getReviewTemplate(id)
        if (!source) {
            return { success: false, error: 'No se ha encontrado la plantilla' }
        }

        await assertFormTemplateBelongsToCoach(source.form_template_id, coachId)
        const metricIds = (await listReviewTemplateMetrics(id)).map((metric) => metric.metric_id)
        await assertMetricIdsBelongToCoach(metricIds, coachId)

        const created = await createReviewTemplate(
            coachId,
            buildDuplicatedReviewTemplateInput(source) as ReviewTemplateInput
        )

        if (metricIds.length > 0) {
            await setReviewTemplateMetrics(created.id, metricIds)
        }

        revalidatePath('/coach/forms')
        return { success: true, id: created.id }
    } catch (error) {
        console.error('[duplicateReviewTemplateAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al duplicar la plantilla',
        }
    }
}

export async function deleteReviewTemplateAction(id: string): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertReviewTemplateBelongsToCoach(id, coachId)
        const scheduleCount = await getScheduleCountForReviewTemplate(id, coachId)
        if (scheduleCount > 0) {
            await updateReviewTemplate(id, { is_active: false })
            revalidatePath('/coach/forms')
            revalidatePath('/coach/members')
            revalidatePath('/coach/clients')
            return { success: true, id, deactivated: true }
        }

        await deleteReviewTemplate(id)
        revalidatePath('/coach/forms')
        return { success: true }
    } catch (error) {
        console.error('[deleteReviewTemplateAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al eliminar la plantilla',
        }
    }
}

export async function toggleReviewTemplateActiveAction(
    id: string,
    isActive: boolean
): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertReviewTemplateBelongsToCoach(id, coachId)
        await updateReviewTemplate(id, { is_active: isActive })
        revalidatePath('/coach/forms')
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        revalidatePath('/coach/calendar')
        return { success: true }
    } catch (error) {
        console.error('[toggleReviewTemplateActiveAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al cambiar el estado',
        }
    }
}
