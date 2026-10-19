import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient } from '@/lib/push'
import {
    getClientNotificationPreferences,
    isChannelEnabled,
    type ClientNotificationChannel,
} from '@/lib/notifications/preferences'
import { buildStravaActivityImportedNotification } from '@/lib/notifications/strava-activity'

type InboxType = 'general' | 'message' | 'plan_updated' | 'check_in' | 'macro_updated' | 'supplement'

type ClientNotificationPayload = {
    title: string
    body: string
    url: string
    tag: string
    type: InboxType
}

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

/**
 * Punto único de envío al cliente: buzón in-app + push.
 * - No notifica a clientes dados de baja.
 * - Lee las preferencias una sola vez.
 * - `dedupeUnreadWithinHours`: si ya hay un aviso igual sin leer reciente, no repite.
 * Nunca lanza; devuelve si el aviso llegó por al menos un canal.
 */
async function notifyClient(
    clientId: string,
    payload: ClientNotificationPayload,
    channel: ClientNotificationChannel,
    options: { dedupeUnreadWithinHours?: number } = {}
): Promise<ClientNotificationResult> {
    try {
        if (!(await isClientActive(clientId))) {
            return { status: 'skipped', reason: 'client_inactive' }
        }

        const preferences = await getClientNotificationPreferences(clientId)
        if (!isChannelEnabled(preferences, channel)) {
            return { status: 'skipped', reason: 'channel_disabled' }
        }

        if (options.dedupeUnreadWithinHours
            && await hasRecentUnread(clientId, payload, options.dedupeUnreadWithinHours)) {
            return { status: 'skipped', reason: 'duplicate' }
        }

        const inbox = await insertInbox(clientId, payload)

        const push = await sendPushToClient(clientId, {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag: payload.tag,
        })
        if (!push.ok && push.reason && !PUSH_SILENT_REASONS.has(push.reason)) {
            console.warn('[notifications] Push no enviado:', push)
        }

        const pushDelivered = push.deliveredCount ?? 0
        if (!inbox && pushDelivered === 0) {
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

    await notifyClient(clientId, {
        title: 'Nuevo mensaje de tu entrenador',
        body: truncate(trimmed),
        url: '/chat',
        tag: 'new-message',
        type: 'message',
    }, 'messages')
}

export async function sendReviewApprovedNotification(clientId: string) {
    await notifyClient(clientId, {
        title: 'Tu revisión ya está aprobada',
        body: 'Tu entrenador ha revisado y aprobado tu revisión.',
        url: '/summary?tab=revisiones',
        tag: 'review-approved',
        type: 'check_in',
    }, 'reviews')
}

export async function sendReviewFeedbackNotification(clientId: string, feedbackMessage: string) {
    const trimmed = feedbackMessage.trim()
    if (!trimmed) return

    await notifyClient(clientId, {
        title: 'Tu entrenador ha revisado tu revisión',
        body: truncate(trimmed),
        url: '/chat',
        tag: 'review-feedback',
        type: 'check_in',
    }, 'reviews')
}

export async function sendReviewCreatedNotification(
    clientId: string,
    checkinId: string,
    reviewTemplateName?: string,
) {
    await notifyClient(clientId, {
        title: reviewTemplateName
            ? `Nueva revisión: ${reviewTemplateName}`
            : 'Nueva revisión disponible',
        body: 'Tu entrenador ha enviado una revisión para completar. Puedes rellenarla desde la app o desde el email.',
        url: `/summary?tab=revisiones&checkin=${checkinId}`,
        tag: `review-created-${checkinId}`,
        type: 'check_in',
    }, 'reviews')
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
    return notifyClient(clientId, { ...payload, type: 'supplement' }, 'supplements')
}

export async function sendStravaActivityImportedNotification(
    clientId: string,
    activityName: string | null | undefined,
    providerActivityId: string | number
) {
    const payload = buildStravaActivityImportedNotification(activityName, providerActivityId)

    await notifyClient(clientId, {
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
    return notifyClient(clientId, PLAN_UPDATE_COPY[kind], 'plans', {
        dedupeUnreadWithinHours: PLAN_UPDATE_DEDUPE_HOURS,
    })
}
