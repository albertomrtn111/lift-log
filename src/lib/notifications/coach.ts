import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToCoach, type PushPayload } from '@/lib/push'

export type CoachNotificationChannel = 'tasks' | 'reviews' | 'messages'

export interface CoachNotificationPreferences {
    tasks_enabled: boolean
    reviews_enabled: boolean
    messages_enabled: boolean
    /** HH:MM — hora local del recordatorio del día anterior */
    day_before_time: string
    /** HH:MM — hora local del recordatorio del mismo día */
    same_day_time: string
}

export const DEFAULT_COACH_NOTIFICATION_PREFERENCES: CoachNotificationPreferences = {
    tasks_enabled: true,
    reviews_enabled: true,
    messages_enabled: true,
    day_before_time: '20:00',
    same_day_time: '09:00',
}

/** Normaliza un time de Postgres ('20:00:00') a 'HH:MM'. */
export function normalizeTime(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const match = value.match(/^(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : fallback
}

export async function getCoachNotificationPreferences(
    coachId: string
): Promise<CoachNotificationPreferences> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coach_notification_preferences')
        .select('tasks_enabled, reviews_enabled, messages_enabled, day_before_time, same_day_time')
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) {
        return DEFAULT_COACH_NOTIFICATION_PREFERENCES
    }

    return {
        tasks_enabled: data.tasks_enabled ?? true,
        reviews_enabled: data.reviews_enabled ?? true,
        messages_enabled: data.messages_enabled ?? true,
        day_before_time: normalizeTime(data.day_before_time, '20:00'),
        same_day_time: normalizeTime(data.same_day_time, '09:00'),
    }
}

/**
 * Envía un push al coach si tiene activado ese canal.
 * Nunca lanza: pensado para llamarse en caliente desde acciones y crons.
 */
export async function notifyCoach(
    coachId: string,
    channel: CoachNotificationChannel,
    payload: PushPayload
): Promise<boolean> {
    try {
        const prefs = await getCoachNotificationPreferences(coachId)
        const enabled =
            channel === 'tasks' ? prefs.tasks_enabled
                : channel === 'reviews' ? prefs.reviews_enabled
                : prefs.messages_enabled

        if (!enabled) return false

        const result = await sendPushToCoach(coachId, payload)
        if (!result.ok && result.reason && result.reason !== 'misconfigured' && result.reason !== 'dependency_missing') {
            console.warn('[notifications/coach] Push no enviado:', result)
        }
        return result.ok
    } catch (error) {
        console.warn('[notifications/coach] Error enviando push (non-blocking):', error)
        return false
    }
}
