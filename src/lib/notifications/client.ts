import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient } from '@/lib/push'
import {
    getClientNotificationPreferences,
    isChannelEnabled,
    type ClientNotificationChannel,
} from '@/lib/notifications/preferences'
import { buildStravaActivityImportedNotification } from '@/lib/notifications/strava-activity'
import { completeDelivery, logDelivery, type DeliveryRecord } from '@/lib/notifications/delivery-log'

type InboxType = 'general' | 'message' | 'plan_updated' | 'check_in' | 'macro_updated' | 'supplement'

type ClientNotificationPayload = {
    title: string
    body: string
    url: string
    tag: string
    type: InboxType
}

/** Qué aviso es, para el registro de entregas (no se muestra al atleta). */
export type ClientNotificationKind =
    | 'message'
    | 'review_created'
    | 'review_approved'
    | 'review_feedback'
    | 'review_reminder'
    | 'plan_updated'
    | 'supplement'
    | 'strava_activity'

export type ClientNotificationResult =
    | { status: 'sent'; inbox: boolean; pushDelivered: number }
    | { status: 'skipped'; reason: 'client_inactive' | 'channel_disabled' | 'duplicate' }
    | { status: 'failed'; inbox: false; pushDelivered: 0 }

const PUSH_SILENT_REASONS = new Set(['misconfigured', 'dependency_missing'])

function truncate(text: string, max = 100) {
    return text.length > max ? `${text.substring(0, max - 3)}...` : text
}

async function isClientActive(clientId: string): Promise<boolean> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('clients')
        .select('status')
        .eq('id', clientId)
        .maybeSingle()

    if (error) {
        // Ante la duda, no bloquear el aviso: el fallo de lectura no es del cliente.
        console.warn('[notifications] No se pudo leer el estado del cliente:', error)
        return true
    }
    return data?.status === 'active'
}

async function hasRecentUnread(clientId: string, payload: ClientNotificationPayload, withinHours: number) {
    const admin = createAdminClient()
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()
    const { data, error } = await admin
        .from('client_notifications')
        .select('id')
        .eq('client_id', clientId)
        .eq('type', payload.type)
        .eq('url', payload.url)
        .eq('is_read', false)
        .gte('created_at', since)
        .limit(1)

    if (error) {
        console.warn('[notifications] No se pudo comprobar duplicados:', error)
        return false
    }
    return (data?.length ?? 0) > 0
}

async function insertInbox(clientId: string, payload: ClientNotificationPayload): Promise<boolean> {
    try {
        const admin = createAdminClient()
        const { error } = await admin
            .from('client_notifications')
            .insert({
                client_id: clientId,
                title: payload.title,
                body: payload.body,
                url: payload.url,
                type: payload.type,
            })

        if (error) {
            console.warn('[notifications] No se pudo crear la notificacion in-app:', error)
            return false
        }
        return true
    } catch (error) {
        console.warn('[notifications] Error creando notificacion in-app:', error)
        return false
    }
}

/** Si el aviso anterior del mismo tema fue hace menos de esto, el push no vuelve a sonar. */
const QUIET_REGROUP_MS = 2 * 60 * 1000

/**
 * Agrupa con el aviso sin leer del mismo tipo y destino: lo actualiza y lo
 * sube arriba en vez de crear otro. Devuelve cuándo se creó el anterior, o
 * null si no había ninguno.
 */
async function regroupUnread(clientId: string, payload: ClientNotificationPayload): Promise<{ previousCreatedAt: string } | null> {
    const admin = createAdminClient()
    const { data: existing } = await admin
        .from('client_notifications')
        .select('id, created_at')
        .eq('client_id', clientId)
        .eq('type', payload.type)
        .eq('url', payload.url)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!existing) return null

    const { error } = await admin
        .from('client_notifications')
        .update({ title: payload.title, body: payload.body, created_at: new Date().toISOString() })
        .eq('id', existing.id)
    if (error) {
        console.warn('[notifications] No se pudo agrupar el aviso:', error.message)
        return null
    }
    return { previousCreatedAt: existing.created_at as string }
}

async function countUnread(clientId: string): Promise<number | undefined> {
    const admin = createAdminClient()
    const { count, error } = await admin
        .from('client_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_read', false)
    return error ? undefined : (count ?? undefined)
}

/**
 * Punto único de envío al cliente: buzón in-app + push.
 * - No notifica a clientes dados de baja.
 * - Lee las preferencias una sola vez.
 * - `dedupeUnreadWithinHours`: si ya hay un aviso igual sin leer reciente, no repite.
 * Nunca lanza; devuelve si el aviso llegó por al menos un canal.
 */
async function notifyClient(
    clientId: string,
    kind: ClientNotificationKind,
    payload: ClientNotificationPayload,
    channel: ClientNotificationChannel,
    options: {
        dedupeUnreadWithinHours?: number
        /** Fila ya reservada en el registro (recordatorios): se completa en vez de crear otra. */
        deliveryId?: string | 'untracked'
        /** Agrupa con el aviso sin leer del mismo tipo y destino (mensajes). */
        groupUnread?: boolean
    } = {}
): Promise<ClientNotificationResult> {
    const record = (entry: Omit<DeliveryRecord, 'audience' | 'clientId' | 'kind'>) => {
        const full: DeliveryRecord = { audience: 'client', clientId, kind, ...entry }
        return options.deliveryId ? completeDelivery(options.deliveryId, full) : logDelivery(full)
    }
    const skip = (reason: 'client_inactive' | 'channel_disabled' | 'duplicate'): ClientNotificationResult => {
        void record({ status: 'skipped', skippedReason: reason })
        return { status: 'skipped', reason }
    }

    try {
        if (!(await isClientActive(clientId))) {
            return skip('client_inactive')
        }

        const preferences = await getClientNotificationPreferences(clientId)
        if (!isChannelEnabled(preferences, channel)) {
            return skip('channel_disabled')
        }

        if (options.dedupeUnreadWithinHours
            && await hasRecentUnread(clientId, payload, options.dedupeUnreadWithinHours)) {
            return skip('duplicate')
        }

        const regrouped = options.groupUnread ? await regroupUnread(clientId, payload) : null
        const inbox = regrouped ? true : await insertInbox(clientId, payload)
        const badge = inbox ? await countUnread(clientId) : undefined
        const recentlyAlerted = regrouped
            ? Date.now() - new Date(regrouped.previousCreatedAt).getTime() < QUIET_REGROUP_MS
            : false

        const push = await sendPushToClient(clientId, {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
            badge,
            renotify: !recentlyAlerted,
        })
        if (!push.ok && push.reason && !PUSH_SILENT_REASONS.has(push.reason)) {
            console.warn('[notifications] Push no enviado:', push)
        }

        const pushDelivered = push.deliveredCount ?? 0
        const failed = !inbox && pushDelivered === 0
        await record({ status: failed ? 'failed' : 'sent', inbox, push })

        if (failed) {
            return { status: 'failed', inbox: false, pushDelivered: 0 }
        }
        return { status: 'sent', inbox, pushDelivered }
    } catch (error) {
        console.warn('[notifications] Error inesperado notificando al cliente:', error)
        return { status: 'failed', inbox: false, pushDelivered: 0 }
    }
}

export async function sendCoachMessageNotification(clientId: string, message: string) {
    const trimmed = message.trim()
    if (!trimmed) return

    // Mensajes sin leer del coach: un solo aviso que se actualiza («3 mensajes»).
    const admin = createAdminClient()
    const { count } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('sender_role', 'coach')
        .is('read_at', null)
    const unread = count ?? 1

    await notifyClient(clientId, 'message', {
        title: unread > 1 ? `Tu entrenador te ha enviado ${unread} mensajes` : 'Nuevo mensaje de tu entrenador',
        body: truncate(trimmed),
        url: '/chat',
        tag: 'new-message',
        type: 'message',
    }, 'messages', { groupUnread: true })
}

/** Enlace a una revisión concreta en la app del atleta. */
export function athleteReviewUrl(checkinId?: string | null) {
    return checkinId ? `/summary?tab=revisiones&checkin=${checkinId}` : '/summary?tab=revisiones'
}

export async function sendReviewApprovedNotification(clientId: string, checkinId?: string | null) {
    await notifyClient(clientId, 'review_approved', {
        title: 'Tu revisión ya está aprobada',
        body: 'Tu entrenador ha revisado y aprobado tu revisión.',
        url: athleteReviewUrl(checkinId),
        tag: 'review-approved',
        type: 'check_in',
    }, 'reviews')
}

export async function sendReviewFeedbackNotification(
    clientId: string,
    feedbackMessage: string,
    checkinId?: string | null,
) {
    const trimmed = feedbackMessage.trim()
    if (!trimmed) return

    await notifyClient(clientId, 'review_feedback', {
        title: 'Tu entrenador ha revisado tu revisión',
        body: truncate(trimmed),
        url: athleteReviewUrl(checkinId),
        tag: 'review-feedback',
        type: 'check_in',
    }, 'reviews')
}

export async function sendReviewCreatedNotification(
    clientId: string,
    checkinId: string,
    reviewTemplateName?: string,
) {
    await notifyClient(clientId, 'review_created', {
        title: reviewTemplateName
            ? `Nueva revisión: ${reviewTemplateName}`
            : 'Nueva revisión disponible',
        body: 'Tu entrenador ha enviado una revisión para completar. Puedes rellenarla desde la app o desde el email.',
        url: athleteReviewUrl(checkinId),
        tag: `review-created-${checkinId}`,
        type: 'check_in',
    }, 'reviews')
}

/** Recordatorio de revisión sin responder (lo envía el cron diario). */
export async function sendReviewReminderNotification(
    clientId: string,
    checkinId: string,
    copy: { title: string; body: string },
    deliveryId?: string | 'untracked',
): Promise<ClientNotificationResult> {
    return notifyClient(clientId, 'review_reminder', {
        title: copy.title,
        body: copy.body,
        url: athleteReviewUrl(checkinId),
        tag: `review-reminder-${checkinId}`,
        type: 'check_in',
    }, 'reviews', { deliveryId })
}

/**
 * Marca como leídos los avisos de una revisión que ya no piden nada
 * (el atleta la ha enviado). Nunca lanza.
 */
export async function markReviewNotificationsRead(clientId: string, checkinId: string) {
    try {
        const admin = createAdminClient()
        const { error } = await admin
            .from('client_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('client_id', clientId)
            .eq('type', 'check_in')
            .eq('is_read', false)
            .like('url', `%checkin=${checkinId}%`)
        if (error) console.warn('[notifications] No se pudieron cerrar los avisos de la revisión:', error.message)
    } catch (error) {
        console.warn('[notifications] Error cerrando avisos de la revisión:', error)
    }
}

export async function sendSupplementReminderNotification(
    clientId: string,
    payload: {
        title: string
        body: string
        url: string
        tag: string
    }
): Promise<ClientNotificationResult> {
    return notifyClient(clientId, 'supplement', { ...payload, type: 'supplement' }, 'supplements')
}

export async function sendStravaActivityImportedNotification(
    clientId: string,
    activityName: string | null | undefined,
    providerActivityId: string | number
) {
    const payload = buildStravaActivityImportedNotification(activityName, providerActivityId)

    await notifyClient(clientId, 'strava_activity', {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        type: 'general',
    }, 'activities')
}

export type PlanUpdateKind = 'training' | 'diet' | 'macros'

const PLAN_UPDATE_COPY: Record<PlanUpdateKind, ClientNotificationPayload> = {
    training: {
        title: 'Tu entrenamiento se ha actualizado',
        body: 'Tu entrenador ha hecho cambios en tu plan de entrenamiento.',
        url: '/routine',
        tag: 'plan-updated-training',
        type: 'plan_updated',
    },
    diet: {
        title: 'Tu dieta se ha actualizado',
        body: 'Tu entrenador ha hecho cambios en tu plan de alimentación.',
        url: '/diet',
        tag: 'plan-updated-diet',
        type: 'plan_updated',
    },
    macros: {
        title: 'Tus macros se han actualizado',
        body: 'Tu entrenador ha ajustado tus objetivos de macros.',
        url: '/diet',
        tag: 'plan-updated-macros',
        type: 'macro_updated',
    },
}

/** Ediciones seguidas del coach no generan un aviso por cada guardado. */
const PLAN_UPDATE_DEDUPE_HOURS = 12

export async function sendPlanUpdatedNotification(clientId: string, kind: PlanUpdateKind) {
    return notifyClient(clientId, 'plan_updated', PLAN_UPDATE_COPY[kind], 'plans', {
        dedupeUnreadWithinHours: PLAN_UPDATE_DEDUPE_HOURS,
    })
}
