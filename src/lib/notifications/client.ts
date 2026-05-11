import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient } from '@/lib/push'
import { isClientNotificationChannelEnabled, type ClientNotificationChannel } from '@/lib/notifications/preferences'

async function sendClientNotification(
    clientId: string,
    payload: {
        title: string
        body: string
        url: string
        tag: string
    },
    channel: ClientNotificationChannel
) {
    const enabled = await isClientNotificationChannelEnabled(clientId, channel)
    if (!enabled) return

    const result = await sendPushToClient(clientId, payload)

    if (!result.ok && result.reason && result.reason !== 'misconfigured' && result.reason !== 'dependency_missing') {
        console.warn('[notifications] Push no enviado:', result)
    }
}

async function createClientInboxNotification(
    clientId: string,
    payload: {
        title: string
        body: string
        url: string
        type: 'message' | 'check_in' | 'supplement'
    },
    channel: ClientNotificationChannel
) {
    const enabled = await isClientNotificationChannelEnabled(clientId, channel)
    if (!enabled) return false

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

export async function sendCoachMessageNotification(clientId: string, message: string) {
    const trimmed = message.trim()
    if (!trimmed) return

    const body = trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed
    await createClientInboxNotification(clientId, {
        title: 'Nuevo mensaje de tu entrenador',
        body,
        url: '/chat',
        type: 'message',
    }, 'messages')

    await sendClientNotification(clientId, {
        title: 'Tu entrenador',
        body,
        url: '/chat',
        tag: 'new-message',
    }, 'messages')
}

export async function sendReviewApprovedNotification(clientId: string) {
    const title = 'Tu revisión ya está aprobada'
    const body = 'Tu entrenador ha revisado y aprobado tu revisión.'
    await createClientInboxNotification(clientId, {
        title,
        body,
        url: '/summary?tab=revisiones',
        type: 'check_in',
    }, 'reviews')

    await sendClientNotification(clientId, {
        title,
        body,
        url: '/summary?tab=revisiones',
        tag: 'review-approved',
    }, 'reviews')
}

export async function sendReviewFeedbackNotification(clientId: string, feedbackMessage: string) {
    const trimmed = feedbackMessage.trim()
    if (!trimmed) return

    const body = trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed
    await createClientInboxNotification(clientId, {
        title: 'Tu entrenador ha revisado tu revisión',
        body,
        url: '/chat',
        type: 'check_in',
    }, 'reviews')

    await sendClientNotification(clientId, {
        title: 'Tu entrenador ha revisado tu revisión',
        body,
        url: '/chat',
        tag: 'review-feedback',
    }, 'reviews')
}

export async function sendReviewCreatedNotification(
    clientId: string,
    checkinId: string,
    reviewTemplateName?: string,
) {
    const url = `/summary?tab=revisiones&checkin=${checkinId}`
    const title = reviewTemplateName
        ? `Nueva revisión: ${reviewTemplateName}`
        : 'Nueva revisión disponible'
    const body = 'Tu entrenador ha enviado una revisión para completar. Puedes rellenarla desde la app o desde el email.'

    await createClientInboxNotification(clientId, {
        title,
        body,
        url,
        type: 'check_in',
    }, 'reviews')

    await sendClientNotification(clientId, {
        title,
        body,
        url,
        tag: `review-created-${checkinId}`,
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
) {
    await createClientInboxNotification(clientId, {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        type: 'supplement',
    }, 'supplements')

    await sendClientNotification(clientId, payload, 'supplements')
}
