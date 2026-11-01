import 'server-only'

/**
 * Avisos programados que no son del coach: los lanza el cron de cada 15
 * minutos (app/api/cron/coach-reminders) junto a los del coach.
 *  - Soltar los push retenidos por horas de silencio, en un solo aviso.
 *  - Recordatorio diario de RPE de Strava (20:00 en la hora del atleta).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient, sendPushToCoach } from '@/lib/push'
import { claimDelivery } from '@/lib/notifications/delivery-log'
import { sendStravaFeedbackReminder } from '@/lib/notifications/client'
import { buildHeldSummaryCopy, isValidTimezone, zonedClock } from '@/lib/notifications/quiet-hours'

const DEFAULT_TIMEZONE = 'Europe/Madrid'
/** Hora local del recordatorio de RPE de Strava. */
const STRAVA_REMINDER_MINUTES = 20 * 60

type HeldRow = {
    id: string
    audience: 'client' | 'coach'
    client_id: string | null
    coach_id: string | null
    kind: string
}

/** Envía un push por persona con lo retenido en sus horas de silencio. */
export async function releaseHeldPushes(now: Date = new Date()): Promise<{ released: number; pushes: number }> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('notification_deliveries')
        .select('id, audience, client_id, coach_id, kind')
        .not('held_until', 'is', null)
        .is('released_at', null)
        .lte('held_until', now.toISOString())
        .limit(1000)
    if (error) throw new Error(`Avisos retenidos: ${error.message}`)

    const rows = (data ?? []) as HeldRow[]
    if (rows.length === 0) return { released: 0, pushes: 0 }

    const groups = new Map<string, HeldRow[]>()
    for (const row of rows) {
        const key = row.audience === 'coach' ? `coach:${row.coach_id}` : `client:${row.client_id}`
        groups.set(key, [...(groups.get(key) ?? []), row])
    }

    let pushes = 0
    for (const group of groups.values()) {
        const first = group[0]
        try {
            // Si ya lo ha leído todo en la app, no hace falta avisar.
            const unread = first.audience === 'coach'
                ? await admin.from('coach_notifications').select('id', { count: 'exact', head: true }).eq('coach_id', first.coach_id!).eq('is_read', false)
                : await admin.from('client_notifications').select('id', { count: 'exact', head: true }).eq('client_id', first.client_id!).eq('is_read', false)
            const unreadCount = unread.count ?? 0

            if (unreadCount > 0) {
                const copy = buildHeldSummaryCopy(group.map(row => row.kind), first.audience)
                const payload = { ...copy, tag: 'held-summary', badge: unreadCount }
                if (first.audience === 'coach') {
                    await sendPushToCoach(first.coach_id!, { ...payload, url: '/coach/dashboard' })
                } else {
                    await sendPushToClient(first.client_id!, { ...payload, url: '/' })
                }
                pushes += 1
            }
        } catch (err) {
            console.warn('[notifications/held] No se pudo soltar el aviso agrupado:', err)
        }
    }

    const { error: updateError } = await admin
        .from('notification_deliveries')
        .update({ released_at: now.toISOString() })
        .in('id', rows.map(row => row.id))
    if (updateError) throw new Error(`Marcar avisos soltados: ${updateError.message}`)

    return { released: rows.length, pushes }
}

/** A las 20:00 de cada atleta con Strava: push si tiene actividades sin RPE. */
export async function sendStravaFeedbackReminders(now: Date = new Date(), force = false): Promise<{ checked: number; sent: number }> {
    const admin = createAdminClient()
    const { data: integrations, error } = await admin
        .from('athlete_integrations')
        .select('client_id')
        .eq('provider', 'strava')
        .eq('status', 'connected')
    if (error) throw new Error(`Integraciones de Strava: ${error.message}`)

    const clientIds = [...new Set((integrations ?? []).map(row => row.client_id as string))]
    if (clientIds.length === 0) return { checked: 0, sent: 0 }

    const { data: tzRows } = await admin
        .from('client_notification_preferences')
        .select('client_id, timezone')
        .in('client_id', clientIds)
    const tzByClient = new Map((tzRows ?? []).map(row => [row.client_id as string, row.timezone as string | null]))

    let sent = 0
    for (const clientId of clientIds) {
        const stored = tzByClient.get(clientId)
        const tz = isValidTimezone(stored) ? stored! : DEFAULT_TIMEZONE
        const clock = zonedClock(now, tz)
        const inWindow = clock.minutes >= STRAVA_REMINDER_MINUTES && clock.minutes < STRAVA_REMINDER_MINUTES + 15
        if (!force && !inWindow) continue

        try {
            const deliveryId = await claimDelivery({
                audience: 'client',
                clientId,
                kind: 'strava_activity',
                dedupeKey: `strava-rpe:${clientId}:${clock.dateKey}`,
            })
            if (!deliveryId) continue
            if (await sendStravaFeedbackReminder(clientId, deliveryId)) sent += 1
        } catch (err) {
            console.warn('[notifications/strava] Recordatorio de RPE no enviado:', err)
        }
    }
    return { checked: clientIds.length, sent }
}
