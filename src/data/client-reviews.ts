'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FormField } from '@/types/forms'
import type { MetricDefinition } from '@/types/metrics'

export type ClientReviewUiStatus = 'pending' | 'submitted' | 'feedback'

export interface ClientReviewItem {
    checkinId: string
    status: ClientReviewUiStatus
    submittedAt: string | null
    createdAt: string
    periodStart: string | null
    periodEnd: string | null
    templateTitle: string
    templateSchema: FormField[]
    rawPayload: Record<string, unknown>
    reviewStatus: 'draft' | 'approved' | 'rejected' | null
    feedbackMessage: string | null
}

export interface ClientReviewFormData {
    checkinId: string
    coachId: string
    clientId: string
    templateTitle: string
    templateType: string
    schema: FormField[]
    metrics: MetricDefinition[]
    initialValues: Record<string, unknown>
}

type ClientContext = {
    id: string
    coach_id: string
}

async function getCurrentClientContext(): Promise<ClientContext | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const admin = createAdminClient()
    const { data: client, error } = await admin
        .from('clients')
        .select('id, coach_id')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'active')
        .maybeSingle()

    if (error) {
        console.error('[client-reviews] Error resolving client:', error)
        return null
    }

    return client as ClientContext | null
}

function getTemplate(row: any): { title: string; type: string; schema: FormField[] } {
    const template = Array.isArray(row.form_templates) ? row.form_templates[0] : row.form_templates

    return {
        title: template?.title ?? 'Revision',
        type: template?.type ?? 'checkin',
        schema: Array.isArray(template?.schema) ? template.schema : [],
    }
}

function getReview(row: any): { status: ClientReviewItem['reviewStatus']; feedback: string | null } {
    const review = Array.isArray(row.reviews) ? row.reviews[0] : row.reviews

    return {
        status: review?.status ?? null,
        feedback: review?.message_to_client ?? null,
    }
}

function getUiStatus(checkinStatus: string | null, feedbackMessage: string | null): ClientReviewUiStatus {
    if (checkinStatus === 'pending') return 'pending'
    if (feedbackMessage?.trim()) return 'feedback'
    return 'submitted'
}

export async function getClientReviewsAction(): Promise<{ success: boolean; reviews: ClientReviewItem[]; error?: string }> {
    const client = await getCurrentClientContext()
    if (!client) return { success: false, reviews: [], error: 'No se pudo cargar tu perfil de cliente.' }

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('checkins')
        .select(`
            id,
            created_at,
            status,
            submitted_at,
            period_start,
            period_end,
            raw_payload,
            form_templates (
                id,
                title,
                type,
                schema
            ),
            reviews (
                status,
                message_to_client
            )
        `)
        .eq('client_id', client.id)
        .eq('type', 'checkin')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[client-reviews] Error loading reviews:', error)
        return { success: false, reviews: [], error: 'No se pudieron cargar tus revisiones.' }
    }

    const reviews = (data ?? []).map((row: any) => {
        const template = getTemplate(row)
        const review = getReview(row)
        const rawPayload = row.raw_payload && typeof row.raw_payload === 'object'
            ? row.raw_payload as Record<string, unknown>
            : {}

        return {
            checkinId: row.id,
            status: getUiStatus(row.status, review.feedback),
            submittedAt: row.status === 'pending' ? null : row.submitted_at,
            createdAt: row.created_at,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            templateTitle: template.title,
            templateSchema: template.schema,
            rawPayload,
            reviewStatus: review.status,
            feedbackMessage: review.feedback,
        }
    }) satisfies ClientReviewItem[]

    return { success: true, reviews }
}

export async function getClientReviewFormAction(checkinId: string): Promise<{
    success: boolean
    form?: ClientReviewFormData
    error?: string
}> {
    const client = await getCurrentClientContext()
    if (!client) return { success: false, error: 'No se pudo cargar tu perfil de cliente.' }

    const admin = createAdminClient()
    const { data: checkin, error } = await admin
        .from('checkins')
        .select(`
            id,
            coach_id,
            client_id,
            status,
            raw_payload,
            form_templates (
                id,
                title,
                type,
                schema
            )
        `)
        .eq('id', checkinId)
        .eq('client_id', client.id)
        .eq('type', 'checkin')
        .neq('status', 'archived')
        .single()

    if (error || !checkin) {
        return { success: false, error: 'No se pudo abrir esta revision.' }
    }

    const template = getTemplate(checkin)
    if (template.schema.length === 0) {
        return { success: false, error: 'La plantilla de esta revision no tiene campos configurados.' }
    }

    const { data: metrics } = await admin
        .from('metric_definitions')
        .select('*')
        .eq('coach_id', checkin.coach_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

    return {
        success: true,
        form: {
            checkinId: checkin.id,
            coachId: checkin.coach_id,
            clientId: checkin.client_id,
            templateTitle: template.title,
            templateType: template.type,
            schema: template.schema,
            metrics: (metrics ?? []) as MetricDefinition[],
            initialValues: checkin.raw_payload && typeof checkin.raw_payload === 'object'
                ? checkin.raw_payload as Record<string, unknown>
                : {},
        },
    }
}
