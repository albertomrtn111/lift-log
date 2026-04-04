import 'server-only'

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
        title: '¡Tu revisión ha sido revisada! ✅',
        body: 'Tu entrenador ha revisado y aprobado tu check-in. Entra para ver los comentarios.',
        url: '/summary',
        tag: 'review-approved',
    })
}

export async function sendReviewFeedbackNotification(clientId: string, feedbackMessage: string) {
    const trimmed = feedbackMessage.trim()
    if (!trimmed) return

    await sendClientNotification(clientId, {
        title: '📋 Tu entrenador ha revisado tu check-in',
        body: trimmed.length > 100 ? `${trimmed.substring(0, 97)}...` : trimmed,
        url: '/chat',
        tag: 'review-feedback',
    })
}
