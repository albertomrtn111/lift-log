import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient } from '@/lib/push'

async function sendClientNotification(
    clientId: string,
    payload: {
        title: string
        body: string
        url: string
        tag: string
    }
) {
    const result = await sendPushToClient(clientId, payload)

    if (!result.ok && result.reason && result.reason !== 'misconfigured' && result.reason !== 'dependency_missing') {
        console.warn('[notifications] Push no enviado:', result)
    }
}

export async function sendCoachMessageNotification(clientId: string, message: string) {
    const trimmed = message.trim()
    if (!trimmed) return

    await sendClientNotification(clientId, {
        title: 'Tu entrenador',
        body: trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed,
        url: '/chat',
        tag: 'new-message',
    })
}

export async function sendReviewApprovedNotification(clientId: string) {
    await sendClientNotification(clientId, {
        title: '¡Tu revisión ya tiene feedback! ✅',
        body: 'Tu entrenador ha revisado y aprobado tu revisión. Entra para ver los comentarios.',
        url: '/summary',
        tag: 'review-approved',
    })
}

export async function sendReviewFeedbackNotification(clientId: string, feedbackMessage: string) {
    const trimmed = feedbackMessage.trim()
    if (!trimmed) return

    await sendClientNotification(clientId, {
        title: '📋 Tu entrenador ha revisado tu revisión',
        body: trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed,
        url: '/chat',
        tag: 'review-feedback',
    })
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

    try {
        const admin = createAdminClient()
        const { error } = await admin
            .from('client_notifications')
            .insert({
                client_id: clientId,
                title,
                body,
                url,
                type: 'check_in',
            })

        if (error) {
            console.warn('[notifications] No se pudo crear la notificacion in-app:', error)
        }
    } catch (error) {
        console.warn('[notifications] Error creando notificacion in-app:', error)
    }

    await sendClientNotification(clientId, {
        title,
        body,
        url,
        tag: `review-created-${checkinId}`,
    })
}
