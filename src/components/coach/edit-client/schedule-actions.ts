'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createClient } from '@/lib/supabase/server'
import {
    createSchedule,
    updateSchedule,
    deleteSchedule,
    listSchedulesForClient,
    type ClientReviewScheduleInput,
    type ClientReviewScheduleWithTemplate,
} from '@/data/review-schedules'

interface ActionResult {
    success: boolean
    id?: string
    error?: string
}

async function assertClientBelongsToCoach(clientId: string, coachId: string): Promise<void> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) {
        throw new Error('No tienes permiso para gestionar revisiones de este atleta')
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
        throw new Error('La plantilla de revisión no pertenece a este workspace')
    }
}

async function assertScheduleBelongsToCoach(scheduleId: string, coachId: string): Promise<void> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('client_review_schedules')
        .select('id')
        .eq('id', scheduleId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) {
        throw new Error('No tienes permiso para modificar esta revisión')
    }
}

export async function listSchedulesForClientAction(
    clientId: string
): Promise<ClientReviewScheduleWithTemplate[]> {
    const { coachId } = await requireActiveCoachId()
    await assertClientBelongsToCoach(clientId, coachId)
    return listSchedulesForClient(clientId)
}

export async function createScheduleAction(
    input: ClientReviewScheduleInput
): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        if (!input.client_id || !input.review_template_id) {
            return { success: false, error: 'Cliente y plantilla son obligatorios' }
        }
        await assertClientBelongsToCoach(input.client_id, coachId)
        await assertReviewTemplateBelongsToCoach(input.review_template_id, coachId)
        if (input.frequency_days !== undefined) {
            if (input.frequency_days < 1 || input.frequency_days > 365) {
                return { success: false, error: 'La frecuencia debe estar entre 1 y 365 días' }
            }
        }

        const created = await createSchedule(coachId, input)
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        return { success: true, id: created.id }
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error al crear la revisión'
        // Mensaje específico para el unique constraint
        if (msg.includes('client_review_schedules_client_id_review_template_id_key')) {
            return { success: false, error: 'Este atleta ya tiene asignada esa plantilla de revisión' }
        }
        console.error('[createScheduleAction]', error)
        return { success: false, error: msg }
    }
}

export async function updateScheduleAction(
    id: string,
    patch: { frequency_days?: number; next_due_date?: string | null; is_active?: boolean }
): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertScheduleBelongsToCoach(id, coachId)
        if (patch.frequency_days !== undefined) {
            if (patch.frequency_days < 1 || patch.frequency_days > 365) {
                return { success: false, error: 'La frecuencia debe estar entre 1 y 365 días' }
            }
        }
        await updateSchedule(id, patch)
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        return { success: true, id }
    } catch (error) {
        console.error('[updateScheduleAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al actualizar la revisión',
        }
    }
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        await assertScheduleBelongsToCoach(id, coachId)
        await deleteSchedule(id)
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        return { success: true }
    } catch (error) {
        console.error('[deleteScheduleAction]', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al eliminar la revisión',
        }
    }
}
