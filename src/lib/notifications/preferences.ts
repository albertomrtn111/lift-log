import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
    DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
    readNotificationPreferencesFromClientPreferences,
    sanitizeNotificationPreferences,
} from '@/lib/notifications/preference-values'

export type ClientNotificationChannel = 'messages' | 'reviews' | 'supplements'

export type ClientNotificationPreferences = {
    messages_enabled: boolean
    reviews_enabled: boolean
    supplements_enabled: boolean
}

export { DEFAULT_CLIENT_NOTIFICATION_PREFERENCES }

function preferenceColumn(channel: ClientNotificationChannel): keyof ClientNotificationPreferences {
    if (channel === 'messages') return 'messages_enabled'
    if (channel === 'reviews') return 'reviews_enabled'
    return 'supplements_enabled'
}

export function isMissingPreferencesTable(error: { code?: string; message?: string } | null | undefined) {
    if (!error) return false
    return error.code === '42P01' || error.code === 'PGRST205' || /client_notification_preferences/i.test(error.message ?? '')
}

async function getClientPreferencesFallback(clientId: string): Promise<ClientNotificationPreferences> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('clients')
        .select('preferences')
        .eq('id', clientId)
        .maybeSingle()

    if (error) {
        console.warn('[notifications] No se pudieron leer preferencias fallback:', error)
        return DEFAULT_CLIENT_NOTIFICATION_PREFERENCES as ClientNotificationPreferences
    }

    return readNotificationPreferencesFromClientPreferences(data?.preferences) as ClientNotificationPreferences
}

export async function getClientNotificationPreferences(
    clientId: string
): Promise<ClientNotificationPreferences> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('client_notification_preferences')
        .select('messages_enabled, reviews_enabled, supplements_enabled')
        .eq('client_id', clientId)
        .maybeSingle()

    if (error) {
        if (isMissingPreferencesTable(error)) {
            return getClientPreferencesFallback(clientId)
        } else {
            console.warn('[notifications] No se pudieron leer preferencias:', error)
        }
        return DEFAULT_CLIENT_NOTIFICATION_PREFERENCES as ClientNotificationPreferences
    }

    return sanitizeNotificationPreferences(data ?? {}) as ClientNotificationPreferences
}

export async function isClientNotificationChannelEnabled(
    clientId: string,
    channel: ClientNotificationChannel
): Promise<boolean> {
    const preferences = await getClientNotificationPreferences(clientId)
    return preferences[preferenceColumn(channel)]
}
