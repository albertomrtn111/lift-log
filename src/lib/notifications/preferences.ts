import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
    DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
    readNotificationPreferencesFromClientPreferences,
    sanitizeNotificationPreferences,
} from '@/lib/notifications/preference-values'

export type ClientNotificationChannel = 'messages' | 'reviews' | 'supplements' | 'activities' | 'plans'

export type ClientNotificationPreferences = {
    messages_enabled: boolean
    reviews_enabled: boolean
    supplements_enabled: boolean
    activities_enabled: boolean
    plans_enabled: boolean
}

export const NOTIFICATION_PREFERENCE_COLUMNS =
    'messages_enabled, reviews_enabled, supplements_enabled, activities_enabled, plans_enabled'

export { DEFAULT_CLIENT_NOTIFICATION_PREFERENCES }

const CHANNEL_COLUMNS: Record<ClientNotificationChannel, keyof ClientNotificationPreferences> = {
    messages: 'messages_enabled',
    reviews: 'reviews_enabled',
    supplements: 'supplements_enabled',
    activities: 'activities_enabled',
    plans: 'plans_enabled',
}

export function isChannelEnabled(
    preferences: ClientNotificationPreferences,
    channel: ClientNotificationChannel
): boolean {
    return preferences[CHANNEL_COLUMNS[channel]]
}

const LEGACY_PREFERENCE_COLUMNS = 'messages_enabled, reviews_enabled, supplements_enabled'
const NEW_PREFERENCE_KEYS = ['activities_enabled', 'plans_enabled'] as const

type DbError = { code?: string; message?: string } | null | undefined

/** Columna inexistente: la migración de activities/plans aún no se ha aplicado. */
export function isMissingPreferenceColumn(error: DbError) {
    return error?.code === '42703' || error?.code === 'PGRST204'
}

/** La tabla no existe: se usa el JSON `clients.preferences` como respaldo. */
export function isMissingPreferencesTable(error: DbError) {
    if (!error || isMissingPreferenceColumn(error)) return false
    return error.code === '42P01' || error.code === 'PGRST205' || /client_notification_preferences/i.test(error.message ?? '')
}

type AdminClient = ReturnType<typeof createAdminClient>
type PreferencesRowResult = { data: Partial<ClientNotificationPreferences> | null; error: DbError }

function asRowResult(result: { data: unknown; error: DbError }): PreferencesRowResult {
    return { data: result.data as Partial<ClientNotificationPreferences> | null, error: result.error }
}

/** Lee la fila de preferencias; si faltan las columnas nuevas, lee las antiguas. */
export async function selectPreferencesRow(admin: AdminClient, clientId: string): Promise<PreferencesRowResult> {
    const read = async (columns: string) => asRowResult(await admin
        .from('client_notification_preferences')
        .select(columns)
        .eq('client_id', clientId)
        .maybeSingle())

    const result = await read(NOTIFICATION_PREFERENCE_COLUMNS)
    if (!isMissingPreferenceColumn(result.error)) return result
    return read(LEGACY_PREFERENCE_COLUMNS)
}

/**
 * Inserta/actualiza la fila de preferencias. Si faltan las columnas nuevas,
 * guarda solo las antiguas (los valores nuevos quedan en su default).
 */
export async function upsertPreferencesRow(
    admin: AdminClient,
    clientId: string,
    preferences: ClientNotificationPreferences
): Promise<PreferencesRowResult> {
    const write = async (row: Record<string, unknown>, columns: string) => asRowResult(await admin
        .from('client_notification_preferences')
        .upsert({ client_id: clientId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
        .select(columns)
        .single())

    const result = await write(preferences, NOTIFICATION_PREFERENCE_COLUMNS)
    if (!isMissingPreferenceColumn(result.error)) return result

    const legacy: Record<string, unknown> = { ...preferences }
    for (const key of NEW_PREFERENCE_KEYS) delete legacy[key]
    return write(legacy, LEGACY_PREFERENCE_COLUMNS)
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
    const { data, error } = await selectPreferencesRow(admin, clientId)

    if (error) {
        if (isMissingPreferencesTable(error)) {
            return getClientPreferencesFallback(clientId)
        }
        console.warn('[notifications] No se pudieron leer preferencias:', error)
        return DEFAULT_CLIENT_NOTIFICATION_PREFERENCES as ClientNotificationPreferences
    }

    return sanitizeNotificationPreferences(data ?? {}) as ClientNotificationPreferences
}

export async function isClientNotificationChannelEnabled(
    clientId: string,
    channel: ClientNotificationChannel
): Promise<boolean> {
    const preferences = await getClientNotificationPreferences(clientId)
    return isChannelEnabled(preferences, channel)
}
