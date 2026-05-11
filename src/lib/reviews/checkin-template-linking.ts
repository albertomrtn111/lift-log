import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

type CheckinLinkInput = {
    id: string
    coach_id: string
    client_id: string
    form_template_id: string | null
    review_template_id: string | null
    review_schedule_id: string | null
    period_start?: string | null
    period_end?: string | null
}

export type LinkedCheckinTemplate = {
    id: string
    coach_id: string
    name: string
    description: string | null
    review_type: string
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

type ScheduleCandidate = {
    id: string
    frequency_days: number
    next_due_date: string | null
    is_active: boolean
    review_template_id: string
    review_template: LinkedCheckinTemplate | null
}

function toLocalDateString(date: Date) {
    return date.toISOString().slice(0, 10)
}

function getPeriodStart(periodEnd: string | null, frequencyDays: number) {
    if (!periodEnd) return null
    const date = new Date(`${periodEnd}T12:00:00`)
    date.setDate(date.getDate() - frequencyDays)
    return toLocalDateString(date)
}

/**
 * n8n legacy cron can still create checkins from form_templates.assigned_client_ids,
 * without review_template_id/review_schedule_id. When that happens, link the checkin
 * back to the unique active schedule using the same form_template_id.
 */
export async function ensureCheckinReviewTemplateLink<T extends CheckinLinkInput>(
    supabase: SupabaseClient,
    checkin: T
): Promise<T & {
    review_template_id: string | null
    review_schedule_id: string | null
    period_start: string | null
    period_end: string | null
    linked_review_template: LinkedCheckinTemplate | null
}> {
    if (checkin.review_template_id) {
        return {
            ...checkin,
            period_start: checkin.period_start ?? null,
            period_end: checkin.period_end ?? null,
            linked_review_template: null,
        }
    }

    if (!checkin.form_template_id) {
        return {
            ...checkin,
            period_start: checkin.period_start ?? null,
            period_end: checkin.period_end ?? null,
            linked_review_template: null,
        }
    }

    const { data, error } = await supabase
        .from('client_review_schedules')
        .select(`
            id,
            frequency_days,
            next_due_date,
            is_active,
            review_template_id,
            review_template:review_templates (
                id,
                coach_id,
                name,
                description,
                review_type,
                form_template_id,
                default_frequency_days,
                include_body_metrics,
                include_performance_metrics,
                include_general_metrics,
                include_progress_photos,
                photos_required,
                photos_max_items,
                is_active,
                created_at,
                updated_at
            )
        `)
        .eq('client_id', checkin.client_id)
        .eq('coach_id', checkin.coach_id)
        .eq('is_active', true)

    if (error) {
        console.warn('[ensureCheckinReviewTemplateLink] schedules:', error)
        return {
            ...checkin,
            period_start: checkin.period_start ?? null,
            period_end: checkin.period_end ?? null,
            linked_review_template: null,
        }
    }

    const matches = ((data ?? []) as unknown as ScheduleCandidate[])
        .filter((schedule) =>
            schedule.review_template?.is_active &&
            schedule.review_template.form_template_id === checkin.form_template_id
        )

    if (matches.length !== 1) {
        if (matches.length > 1) {
            console.warn('[ensureCheckinReviewTemplateLink] Ambiguous schedule match for checkin', checkin.id)
        }
        return {
            ...checkin,
            period_start: checkin.period_start ?? null,
            period_end: checkin.period_end ?? null,
            linked_review_template: null,
        }
    }

    const schedule = matches[0]
    const periodEnd = checkin.period_end ?? schedule.next_due_date
    const periodStart = checkin.period_start ?? getPeriodStart(periodEnd, schedule.frequency_days)

    const { error: updateError } = await supabase
        .from('checkins')
        .update({
            review_template_id: schedule.review_template_id,
            review_schedule_id: schedule.id,
            period_start: periodStart,
            period_end: periodEnd,
        })
        .eq('id', checkin.id)
        .is('review_template_id', null)

    if (updateError) {
        console.warn('[ensureCheckinReviewTemplateLink] update:', updateError)
        return {
            ...checkin,
            period_start: checkin.period_start ?? null,
            period_end: checkin.period_end ?? null,
            linked_review_template: null,
        }
    }

    return {
        ...checkin,
        review_template_id: schedule.review_template_id,
        review_schedule_id: schedule.id,
        period_start: periodStart,
        period_end: periodEnd,
        linked_review_template: schedule.review_template,
    }
}
