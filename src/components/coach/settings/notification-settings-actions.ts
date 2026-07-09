'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import {
    getCoachNotificationPreferences,
    type CoachNotificationPreferences,
} from '@/lib/notifications/coach'

interface PreferencesResult {
    success: boolean
    preferences?: CoachNotificationPreferences
    error?: string
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export async function getCoachNotificationPreferencesAction(): Promise<PreferencesResult> {
    try {
        const { coachId } = await requireActiveCoachId()
        const preferences = await getCoachNotificationPreferences(coachId)
        return { success: true, preferences }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudieron cargar las preferencias',
        }
    }
}

export async function updateCoachNotificationPreferencesAction(
    input: CoachNotificationPreferences
): Promise<PreferencesResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()

        if (!TIME_REGEX.test(input.day_before_time) || !TIME_REGEX.test(input.same_day_time)) {
            return { success: false, error: 'Las horas deben tener formato HH:MM' }
        }

        const { error } = await supabase
            .from('coach_notification_preferences')
            .upsert({
                coach_id: coachId,
                tasks_enabled: Boolean(input.tasks_enabled),
                reviews_enabled: Boolean(input.reviews_enabled),
                messages_enabled: Boolean(input.messages_enabled),
                day_before_time: input.day_before_time,
                same_day_time: input.same_day_time,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'coach_id' })

        if (error) {
            return { success: false, error: error.message }
        }

        const preferences = await getCoachNotificationPreferences(coachId)
        return { success: true, preferences }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudieron guardar las preferencias',
        }
    }
}
