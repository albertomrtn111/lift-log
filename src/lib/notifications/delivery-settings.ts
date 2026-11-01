import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
    DEFAULT_CLIENT_DELIVERY_SETTINGS,
    sanitizeClientDeliverySettings,
} from '@/lib/notifications/quiet-hours'

export type ClientDeliverySettings = {
    reviews_email_enabled: boolean
    quiet_hours_enabled: boolean
    quiet_start: string
    quiet_end: string
    timezone: string | null
}

const COLUMNS = 'reviews_email_enabled, quiet_hours_enabled, quiet_start, quiet_end, timezone'

/** Ajustes de entrega del atleta. Ante cualquier fallo, los valores por defecto. */
export async function getClientDeliverySettings(clientId: string): Promise<ClientDeliverySettings> {
    try {
        const admin = createAdminClient()
        const { data, error } = await admin
            .from('client_notification_preferences')
            .select(COLUMNS)
            .eq('client_id', clientId)
            .maybeSingle()
        if (error || !data) return { ...DEFAULT_CLIENT_DELIVERY_SETTINGS }
        return sanitizeClientDeliverySettings(data as Record<string, unknown>)
    } catch {
        return { ...DEFAULT_CLIENT_DELIVERY_SETTINGS }
    }
}

/** Guarda una parte de los ajustes de entrega (crea la fila si no existe). */
export async function updateClientDeliverySettings(
    clientId: string,
    patch: Partial<ClientDeliverySettings>
): Promise<{ settings?: ClientDeliverySettings; error?: string }> {
    const current = await getClientDeliverySettings(clientId)
    const next = sanitizeClientDeliverySettings({ ...current, ...patch })
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('client_notification_preferences')
        .upsert({ client_id: clientId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
        .select(COLUMNS)
        .single()
    if (error) return { error: error.message }
    return { settings: sanitizeClientDeliverySettings(data as Record<string, unknown>) }
}
