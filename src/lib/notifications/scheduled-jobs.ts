import 'server-only'

/**
 * Avisos programados que no son del coach: los lanza el cron de cada 15
 * minutos (app/api/cron/coach-reminders) junto a los del coach.
 *  - Soltar los push retenidos por horas de silencio, en un solo aviso.
 *  - Recordatorio diario de RPE de Strava (20:00 en la hora del atleta).
 *  - Avisos de cambios de plan hechos por la IA (cola notification_outbox).
 *  - Entreno del día (a la hora del atleta, si lo activó) y resumen de la
 *    semana en el buzón (lunes, 07:00).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToClient, sendPushToCoach } from '@/lib/push'
import { claimDelivery } from '@/lib/notifications/delivery-log'
import {
    sendPlanUpdatedNotification,
    sendStravaFeedbackReminder,
    sendWeekSummaryNotification,
    sendWorkoutTodayNotification,
    type PlanUpdateKind,
} from '@/lib/notifications/client'
import { buildHeldSummaryCopy, isValidTimezone, minutesOfDay, zonedClock } from '@/lib/notifications/quiet-hours'
import { PLAN_COLUMNS, PLAN_TABLES, isPlanVisibleToClient, type PlanRow } from '@/lib/notifications/plan-visibility'
import {
    addDays,
    buildTodayWorkoutCopy,
    buildWeekSummaryCopy,
    isoWeekday,
    mondayOf,
    strengthSessionsOn,
} from '@/lib/notifications/athlete-plan-copy'

const DEFAULT_TIMEZONE = 'Europe/Madrid'
/** Hora local del recordatorio de RPE de Strava. */
const STRAVA_REMINDER_MINUTES = 20 * 60

type HeldRow = {
    id: string
    audience: 'client' | 'coach'
    client_id: string | null
    coach_id: string | null
    kind: string
    created_at: string
}

/** Lote de ids por actualización: con cientos, la URL de PostgREST se hace demasiado larga. */
const ID_BATCH = 100

async function markReleased(admin: ReturnType<typeof createAdminClient>, ids: string[], at: string) {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
        const { error } = await admin
            .from('notification_deliveries')
            .update({ released_at: at })
            .in('id', ids.slice(i, i + ID_BATCH))
            .is('released_at', null)
        if (error) throw new Error(error.message)
    }
}

/**
 * Envía un push por persona con lo retenido en sus horas de silencio. Cada
 * grupo se marca como enviado antes de mandarlo: si algo falla, como mucho se
 * pierde ese push, pero nunca se repite cada 15 minutos.
 */
export async function releaseHeldPushes(now: Date = new Date()): Promise<{ released: number; pushes: number }> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('notification_deliveries')
        .select('id, audience, client_id, coach_id, kind, created_at')
        .not('held_until', 'is', null)
        .is('released_at', null)
        .lte('held_until', now.toISOString())
        .order('created_at', { ascending: true })
        .limit(1000)
    if (error) throw new Error(`Avisos retenidos: ${error.message}`)

    const rows = (data ?? []) as HeldRow[]
    if (rows.length === 0) return { released: 0, pushes: 0 }

    const groups = new Map<string, HeldRow[]>()
    for (const row of rows) {
        const key = row.audience === 'coach' ? `coach:${row.coach_id}` : `client:${row.client_id}`
        groups.set(key, [...(groups.get(key) ?? []), row])
    }

    let released = 0
    let pushes = 0
    for (const group of groups.values()) {
        const first = group[0]
        try {
            await markReleased(admin, group.map(row => row.id), now.toISOString())
            released += group.length

            // Solo cuenta lo retenido que sigue sin leer (lo de antes no es de esta noche).
            const since = new Date(new Date(first.created_at).getTime() - 5_000).toISOString()
            const unread = first.audience === 'coach'
                ? await admin.from('coach_notifications').select('id', { count: 'exact', head: true })
                    .eq('coach_id', first.coach_id!).eq('is_read', false).gte('updated_at', since)
                : await admin.from('client_notifications').select('id', { count: 'exact', head: true })
                    .eq('client_id', first.client_id!).eq('is_read', false).gte('created_at', since)
            if ((unread.count ?? 0) === 0) continue

            const copy = buildHeldSummaryCopy(group.map(row => row.kind), first.audience)
            // Sin número para el icono: este recuento es solo de lo retenido, no el total.
            const payload = { ...copy, tag: 'held-summary' }
            if (first.audience === 'coach') {
                await sendPushToCoach(first.coach_id!, { ...payload, url: '/coach/dashboard' })
            } else {
                await sendPushToClient(first.client_id!, { ...payload, url: '/' })
            }
            pushes += 1
        } catch (err) {
            console.warn('[notifications/held] No se pudo soltar el aviso agrupado:', err)
        }
    }

    return { released, pushes }
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

// ---------------------------------------------------------------------------
// Cola de cambios de plan hechos por la IA (servidor MCP)
// ---------------------------------------------------------------------------

/**
 * Avisa al atleta de los cambios de plan que el MCP dejó en
 * notification_outbox, como si se hubieran hecho en el portal: solo si el
 * plan es el que ve el atleta y como mucho uno cada 12 h por tipo.
 */
const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function processNotificationOutbox(): Promise<{ processed: number; notified: number }> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('notification_outbox')
        .select('id, client_id, kind, plan_id, created_at')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(200)
    if (error) throw new Error(`Cola de avisos: ${error.message}`)

    const rows = (data ?? []) as Array<{ id: string; client_id: string; kind: PlanUpdateKind; plan_id: string | null; created_at: string }>
    if (rows.length === 0) return { processed: 0, notified: 0 }

    // Un cambio de hace más de un día ya no es noticia (p. ej. si la web estuvo sin desplegar).
    const staleBefore = Date.now() - OUTBOX_MAX_AGE_MS
    const done = new Set<string>()
    let notified = 0
    for (const row of rows) {
        const key = `${row.client_id}|${row.kind}`
        if (done.has(key) || new Date(row.created_at).getTime() < staleBefore) continue
        try {
            if (row.plan_id) {
                const { data: plan } = await admin
                    .from(PLAN_TABLES[row.kind])
                    .select(PLAN_COLUMNS[row.kind])
                    .eq('id', row.plan_id)
                    .maybeSingle()
                const planRow = plan as PlanRow | null
                if (!planRow || planRow.client_id !== row.client_id || !isPlanVisibleToClient(row.kind, planRow)) continue
            }
            const result = await sendPlanUpdatedNotification(row.client_id, row.kind)
            done.add(key)
            if (result.status === 'sent') notified += 1
        } catch (err) {
            console.warn('[notifications/outbox] Aviso no enviado:', err)
        }
    }

    const { error: updateError } = await admin
        .from('notification_outbox')
        .update({ processed_at: new Date().toISOString() })
        .in('id', rows.map(row => row.id))
    if (updateError) throw new Error(`Marcar cola procesada: ${updateError.message}`)

    return { processed: rows.length, notified }
}

// ---------------------------------------------------------------------------
// Entreno del día y resumen de la semana del atleta
// ---------------------------------------------------------------------------

/** Hora local del resumen de la semana (lunes). */
const WEEK_SUMMARY_MINUTES = 7 * 60

type AthleteSchedulePrefs = {
    client_id: string
    timezone: string | null
    workout_reminder_enabled: boolean
    workout_reminder_time: string | null
    week_summary_enabled: boolean
}

/** Programa activo, sesiones movidas y cardio de un atleta entre dos fechas. */
async function loadAthletePlan(clientId: string, from: string, to: string) {
    const admin = createAdminClient()
    const [programs, scheduled, cardio] = await Promise.all([
        admin.from('training_programs')
            .select('id, effective_from, weeks, training_days ( id, name, default_weekday )')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5),
        admin.from('scheduled_strength_sessions')
            .select('day_id, scheduled_date, is_completed')
            .eq('client_id', clientId)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to),
        admin.from('cardio_sessions')
            .select('name, training_type, target_duration_min, target_distance_km, scheduled_date, is_completed')
            .eq('client_id', clientId)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to),
    ])
    const program = ((programs.data ?? []) as any[]).find(p => p.training_days?.some((d: any) => d.default_weekday != null)) ?? null
    return {
        program,
        scheduled: (scheduled.data ?? []) as Array<{ day_id: string; scheduled_date: string; is_completed: boolean | null }>,
        cardio: (cardio.data ?? []) as Array<{ name: string | null; training_type: string | null; target_duration_min: number | null; target_distance_km: number | null; scheduled_date: string; is_completed: boolean | null }>,
    }
}

async function loadAthleteSchedulePrefs(filter: 'workout' | 'week'): Promise<AthleteSchedulePrefs[]> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('client_notification_preferences')
        .select('client_id, timezone, workout_reminder_enabled, workout_reminder_time, week_summary_enabled, client:clients!inner(status, is_sample)')
        .eq(filter === 'workout' ? 'workout_reminder_enabled' : 'week_summary_enabled', true)
    if (error) throw new Error(`Preferencias de atletas: ${error.message}`)
    return ((data ?? []) as any[])
        .filter(row => row.client?.status === 'active' && !row.client?.is_sample)
        .map(row => row as AthleteSchedulePrefs)
}

/** Push con el entreno de hoy a la hora que eligió cada atleta. */
export async function sendWorkoutReminders(now: Date = new Date(), force = false): Promise<{ checked: number; sent: number }> {
    const prefs = await loadAthleteSchedulePrefs('workout')
    let sent = 0
    for (const pref of prefs) {
        const tz = isValidTimezone(pref.timezone) ? pref.timezone! : DEFAULT_TIMEZONE
        const clock = zonedClock(now, tz)
        const target = minutesOfDay(pref.workout_reminder_time) ?? 8 * 60
        if (!force && !(clock.minutes >= target && clock.minutes < target + 15)) continue

        try {
            const plan = await loadAthletePlan(pref.client_id, mondayOf(clock.dateKey), addDays(mondayOf(clock.dateKey), 6))
            const copy = buildTodayWorkoutCopy({
                strength: strengthSessionsOn({ program: plan.program, scheduled: plan.scheduled, dateKey: clock.dateKey }),
                cardio: plan.cardio.filter(c => c.scheduled_date === clock.dateKey && !c.is_completed),
            })
            if (!copy) continue

            const deliveryId = await claimDelivery({
                audience: 'client',
                clientId: pref.client_id,
                kind: 'workout_today',
                dedupeKey: `workout-today:${pref.client_id}:${clock.dateKey}`,
            })
            if (!deliveryId) continue
            const result = await sendWorkoutTodayNotification(pref.client_id, copy, deliveryId)
            if (result.status === 'sent') sent += 1
        } catch (err) {
            console.warn('[notifications/workout] Entreno del día no enviado:', err)
        }
    }
    return { checked: prefs.length, sent }
}

/** Lunes a las 07:00 de cada atleta: su semana en el buzón (sin push). */
export async function sendWeekSummaries(now: Date = new Date(), force = false): Promise<{ checked: number; sent: number }> {
    const prefs = await loadAthleteSchedulePrefs('week')
    let sent = 0
    for (const pref of prefs) {
        const tz = isValidTimezone(pref.timezone) ? pref.timezone! : DEFAULT_TIMEZONE
        const clock = zonedClock(now, tz)
        const isMondayMorning = isoWeekday(clock.dateKey) === 1
            && clock.minutes >= WEEK_SUMMARY_MINUTES && clock.minutes < WEEK_SUMMARY_MINUTES + 15
        if (!force && !isMondayMorning) continue

        try {
            const weekStart = mondayOf(clock.dateKey)
            const weekEnd = addDays(weekStart, 6)
            const plan = await loadAthletePlan(pref.client_id, weekStart, weekEnd)
            let strengthCount = 0
            for (let offset = 0; offset < 7; offset += 1) {
                strengthCount += strengthSessionsOn({ program: plan.program, scheduled: plan.scheduled, dateKey: addDays(weekStart, offset) }).length
            }
            const copy = buildWeekSummaryCopy({ strengthCount, cardioCount: plan.cardio.filter(c => !c.is_completed).length })
            if (!copy) continue

            const deliveryId = await claimDelivery({
                audience: 'client',
                clientId: pref.client_id,
                kind: 'week_summary',
                dedupeKey: `week-summary:${pref.client_id}:${weekStart}`,
            })
            if (!deliveryId) continue
            const result = await sendWeekSummaryNotification(pref.client_id, copy, deliveryId)
            if (result.status === 'sent') sent += 1
        } catch (err) {
            console.warn('[notifications/week] Resumen de la semana no enviado:', err)
        }
    }
    return { checked: prefs.length, sent }
}
