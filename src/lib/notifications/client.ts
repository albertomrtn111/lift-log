import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient, type PushPayload } from '@/lib/push'
import {
    getClientNotificationPreferences,
    isChannelEnabled,
    type ClientNotificationChannel,
} from '@/lib/notifications/preferences'
import { buildStravaActivityImportedNotification } from '@/lib/notifications/strava-activity'
import { completeDelivery, logDelivery, setDeliveryEmailStatusByKey, type DeliveryRecord } from '@/lib/notifications/delivery-log'
import { getClientDeliverySettings } from '@/lib/notifications/delivery-settings'
import { quietHoursEnd } from '@/lib/notifications/quiet-hours'

/** Zona horaria si el atleta aún no ha abierto la app con la versión que la guarda. */
const DEFAULT_TIMEZONE = 'Europe/Madrid'

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

/** Canales cuyo aviso sale del coach: apagarlos quita el push, pero el buzón lo guarda. */
const COACH_DRIVEN_CHANNELS = new Set<ClientNotificationChannel>(['messages', 'reviews', 'plans'])
/** Avisos que respetan su hora aunque sea de silencio (la eligió el coach a propósito). */
const QUIET_HOURS_EXEMPT = new Set<ClientNotificationKind>(['supplement'])

/**
 * Punto único de envío al cliente: buzón in-app + push.
 * - No notifica a clientes dados de baja.
 * - Lee las preferencias una sola vez. Si el atleta apagó un canal del coach
 *   (mensajes, revisiones, planes), el aviso queda en el buzón sin push; si
 *   apagó un recordatorio automático (suplementos, actividades), no sale nada.
 * - En horas de silencio el aviso queda en el buzón y el push se retiene hasta
 *   que terminen (lo envía, agrupado, el cron de cada 15 minutos).
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
        /** Clave del registro para encontrar luego esta entrega (p. ej. la revisión nueva). */
        deliveryKey?: string
        /** Agrupa con el aviso sin leer del mismo tipo y destino (mensajes). */
        groupUnread?: boolean
        /** false = solo buzón, sin push. */
        push?: boolean
        /** Botones del push (Android) y lo que piden al servidor. */
        pushActions?: Pick<PushPayload, 'actions' | 'actionRequest'>
    } = {}
): Promise<ClientNotificationResult> {
    const record = (entry: Omit<DeliveryRecord, 'audience' | 'clientId' | 'kind'>) => {
        const full: DeliveryRecord = { audience: 'client', clientId, kind, dedupeKey: options.deliveryKey ?? null, ...entry }
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

        const [preferences, delivery] = await Promise.all([
            getClientNotificationPreferences(clientId),
            getClientDeliverySettings(clientId),
        ])
        const channelEnabled = isChannelEnabled(preferences, channel)
        if (!channelEnabled && !COACH_DRIVEN_CHANNELS.has(channel)) {
            return skip('channel_disabled')
        }

        if (options.dedupeUnreadWithinHours
            && await hasRecentUnread(clientId, payload, options.dedupeUnreadWithinHours)) {
            return skip('duplicate')
        }

        const regrouped = options.groupUnread ? await regroupUnread(clientId, payload) : null
        const inbox = regrouped ? true : await insertInbox(clientId, payload)

        // Sin push: canal apagado por el atleta o aviso solo de buzón.
        if (!channelEnabled || options.push === false) {
            await record({
                status: inbox ? 'sent' : 'failed',
                skippedReason: channelEnabled ? 'inbox_only' : 'push_disabled',
                inbox,
            })
            return inbox ? { status: 'sent', inbox, pushDelivered: 0 } : { status: 'failed', inbox: false, pushDelivered: 0 }
        }

        // Horas de silencio: el push espera a que terminen.
        const heldUntil = QUIET_HOURS_EXEMPT.has(kind)
            ? null
            : quietHoursEnd({
                now: new Date(),
                tz: delivery.timezone ?? DEFAULT_TIMEZONE,
                enabled: delivery.quiet_hours_enabled,
                start: delivery.quiet_start,
                end: delivery.quiet_end,
            })
        if (heldUntil && inbox) {
            await record({ status: 'sent', skippedReason: 'quiet_hours', inbox, heldUntil: heldUntil.toISOString() })
            return { status: 'sent', inbox, pushDelivered: 0 }
        }

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
            ...options.pushActions,
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

/** Clave del registro de la revisión nueva: guarda si salió por email o no. */
export function reviewCreatedKey(checkinId: string) {
    return `review-created:${checkinId}`
}

/** El atleta no ha desactivado «Revisiones por email». */
export async function canEmailReviews(clientId: string): Promise<boolean> {
    const delivery = await getClientDeliverySettings(clientId)
    return delivery.reviews_email_enabled
}

/**
 * Email de la revisión nueva, decidido con lo que pasó de verdad con el push:
 * si llegó a algún dispositivo, el email espera al primer recordatorio (que
 * lo envía si aquí quedó «skipped»); si no llegó, sale ya. Nunca lanza.
 */
export async function decideReviewCreatedEmail(input: {
    clientId: string
    checkinId: string
    pushDelivered: number
    send: () => Promise<{ ok: boolean }>
}): Promise<'sent' | 'failed' | 'deferred' | 'disabled'> {
    try {
        if (!(await canEmailReviews(input.clientId))) return 'disabled'
        if (input.pushDelivered > 0) {
            await setDeliveryEmailStatusByKey(reviewCreatedKey(input.checkinId), 'skipped')
            return 'deferred'
        }
        const result = await input.send()
        await setDeliveryEmailStatusByKey(reviewCreatedKey(input.checkinId), result.ok ? 'sent' : 'failed')
        return result.ok ? 'sent' : 'failed'
    } catch (error) {
        console.warn('[notifications] Email de revisión nueva no enviado:', error)
        return 'failed'
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
): Promise<ClientNotificationResult> {
    return notifyClient(clientId, 'review_created', {
        title: reviewTemplateName
            ? `Nueva revisión: ${reviewTemplateName}`
            : 'Nueva revisión disponible',
        body: 'Tu entrenador ha enviado una revisión para completar. Puedes rellenarla desde la app o desde el email.',
        url: athleteReviewUrl(checkinId),
        tag: `review-created-${checkinId}`,
        type: 'check_in',
    }, 'reviews', { deliveryKey: reviewCreatedKey(checkinId) })
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

/**
 * Recordatorio de suplementación. Un solo aviso por día en el buzón, que se
 * actualiza con cada toma; en Android, el push lleva un botón «Hecho» que
 * registra la toma sin abrir la app.
 */
export async function sendSupplementReminderNotification(
    clientId: string,
    payload: {
        title: string
        body: string
        url: string
        tag: string
    },
    slot?: { date: string; time: string }
): Promise<ClientNotificationResult> {
    return notifyClient(clientId, 'supplement', { ...payload, type: 'supplement' }, 'supplements', {
        groupUnread: true,
        pushActions: slot
            ? {
                actions: [{ action: 'done', title: 'Hecho' }],
                actionRequest: { url: '/api/supplements/logs/slot', body: { date: slot.date, time: slot.time } },
            }
            : undefined,
    })
}

/** Cuántas actividades de Strava recientes esperan su RPE/notas. */
async function countStravaPendingFeedback(clientId: string): Promise<number> {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 19)
    const { count } = await admin
        .from('strava_activities')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('feedback_status', 'pending')
        .eq('is_deleted', false)
        .gte('start_date_local', since)
    return count ?? 0
}

/**
 * Actividad importada de Strava: solo buzón (el atleta la acaba de ver en
 * Strava) y agrupada en un aviso. El push llega una vez al día si falta el
 * RPE (sendStravaFeedbackReminder).
 */
export async function sendStravaActivityImportedNotification(
    clientId: string,
    activityName: string | null | undefined,
    providerActivityId: string | number
) {
    const payload = buildStravaActivityImportedNotification(activityName, providerActivityId)
    const pending = await countStravaPendingFeedback(clientId)

    await notifyClient(clientId, 'strava_activity', {
        title: pending > 1 ? `${pending} actividades importadas` : payload.title,
        body: pending > 1 ? 'Añade el esfuerzo (RPE) y tus notas desde Progreso.' : payload.body,
        url: payload.url,
        tag: 'strava-activities',
        type: 'general',
    }, 'activities', { groupUnread: true, push: false })
}

/**
 * Push diario si hay actividades sin RPE. Devuelve si había algo que recordar.
 */
export async function sendStravaFeedbackReminder(clientId: string, deliveryId: string | 'untracked'): Promise<boolean> {
    const pending = await countStravaPendingFeedback(clientId)
    if (pending === 0) {
        await completeDelivery(deliveryId, { audience: 'client', clientId, kind: 'strava_activity', status: 'skipped', skippedReason: 'nothing_pending' })
        return false
    }
    await notifyClient(clientId, 'strava_activity', {
        title: pending === 1 ? 'Tienes una actividad sin RPE' : `Tienes ${pending} actividades sin RPE`,
        body: 'Indica cómo te has sentido: tu entrenador lo usa para ajustar tus cargas.',
        url: '/progress',
        tag: 'strava-activities',
        type: 'general',
    }, 'activities', { groupUnread: true, deliveryId })
    return true
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
