import { createClient } from '@/lib/supabase/server'
import { computeNextDueDate } from '@/lib/review-schedule-utils'
import type { ReviewTemplate } from './review-templates'

// ============================================================================
// TYPES
// ============================================================================

export interface ClientReviewSchedule {
    id: string
    client_id: string
    coach_id: string
    review_template_id: string
    frequency_days: number
    next_due_date: string | null
    is_active: boolean
    last_sent_at: string | null
    created_at: string
    updated_at: string
}

export interface ClientReviewScheduleWithTemplate extends ClientReviewSchedule {
    review_template: ReviewTemplate | null
}

export interface ClientReviewScheduleInput {
    client_id: string
    review_template_id: string
    frequency_days?: number
    next_due_date?: string | null
    is_active?: boolean
}

// ============================================================================
// QUERIES
// ============================================================================

export async function listSchedulesForClient(
    clientId: string
): Promise<ClientReviewScheduleWithTemplate[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('client_review_schedules')
        .select(`
            *,
            review_template:review_templates(*)
        `)
        .eq('client_id', clientId)
        .order('is_active', { ascending: false })
        .order('next_due_date', { ascending: true, nullsFirst: false })

    if (error) {
        console.error('[listSchedulesForClient]', error)
        return []
    }
    return (data ?? []) as ClientReviewScheduleWithTemplate[]
}

export async function listActiveSchedulesForClient(
    clientId: string
): Promise<ClientReviewScheduleWithTemplate[]> {
    const all = await listSchedulesForClient(clientId)
    return all.filter(s => s.is_active)
}

export async function getSchedule(id: string): Promise<ClientReviewScheduleWithTemplate | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('client_review_schedules')
        .select(`*, review_template:review_templates(*)`)
        .eq('id', id)
        .maybeSingle()

    if (error) {
        console.error('[getSchedule]', error)
        return null
    }
    return (data as ClientReviewScheduleWithTemplate) ?? null
}

// ============================================================================
// MUTATIONS
// ============================================================================

export async function createSchedule(
    coachId: string,
    input: ClientReviewScheduleInput
): Promise<ClientReviewSchedule> {
    const supabase = await createClient()

    // Si no se especifica frequency_days, usar el default de la plantilla
    let frequency = input.frequency_days
    if (frequency === undefined) {
        const { data: tpl } = await supabase
            .from('review_templates')
            .select('default_frequency_days')
            .eq('id', input.review_template_id)
            .maybeSingle()
        frequency = tpl?.default_frequency_days ?? 14
    }

    const { data, error } = await supabase
        .from('client_review_schedules')
        .insert({
            coach_id: coachId,
            client_id: input.client_id,
            review_template_id: input.review_template_id,
            frequency_days: frequency,
            next_due_date: input.next_due_date ?? null,
            is_active: input.is_active ?? true,
        })
        .select('*')
        .single()

    if (error) throw error
    return data as ClientReviewSchedule
}

export async function updateSchedule(
    id: string,
    patch: Partial<Pick<ClientReviewSchedule,
        'frequency_days' | 'next_due_date' | 'is_active' | 'last_sent_at'
    >>
): Promise<void> {
    const supabase = await createClient()
    const update: Record<string, unknown> = {}

    if (patch.frequency_days !== undefined) update.frequency_days = patch.frequency_days
    if (patch.next_due_date !== undefined) update.next_due_date = patch.next_due_date
    if (patch.is_active !== undefined) update.is_active = patch.is_active
    if (patch.last_sent_at !== undefined) update.last_sent_at = patch.last_sent_at

    const { error } = await supabase
        .from('client_review_schedules')
        .update(update)
        .eq('id', id)

    if (error) throw error
}

export async function deleteSchedule(id: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase
        .from('client_review_schedules')
        .delete()
        .eq('id', id)

    if (error) throw error
}

// ============================================================================
// HELPERS
// ============================================================================

export { computeNextDueDate }

/**
 * Devuelve los schedules vencidos o próximos a vencer (next_due_date <= hoy + windowDays).
 * Útil para el dashboard del coach.
 */
export async function listDueSchedulesForCoach(
    coachId: string,
    windowDays = 0
): Promise<ClientReviewScheduleWithTemplate[]> {
    const supabase = await createClient()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + windowDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const { data, error } = await supabase
        .from('client_review_schedules')
        .select(`*, review_template:review_templates(*)`)
        .eq('coach_id', coachId)
        .eq('is_active', true)
        .lte('next_due_date', cutoffStr)
        .order('next_due_date', { ascending: true })

    if (error) {
        console.error('[listDueSchedulesForCoach]', error)
        return []
    }
    return (data ?? []) as ClientReviewScheduleWithTemplate[]
}
