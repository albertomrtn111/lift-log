import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { schedulerTimezone } from '@/lib/reviews/scheduler'
import { getCoachNotificationPreferences, notifyCoach } from '@/lib/notifications/coach'
import { sendCoachDailyDigest, sendCoachWeeklyDigest } from '@/lib/notifications/coach-digest'
import { formatNameList } from '@/lib/notifications/coach-copy'
import {
    processNotificationOutbox,
    releaseHeldPushes,
    sendStravaFeedbackReminders,
    sendWeekSummaries,
    sendWorkoutReminders,
} from '@/lib/notifications/scheduled-jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Avisos programados del coach — disparado por pg_cron cada 15 minutos.
 *
 * Según las preferencias de cada coach (coach_notification_preferences) y en
 * su zona horaria (coaches.timezone, por defecto la del planificador):
 *  - Resumen diario por email + campana a la hora `digest_time` (08:30).
 *  - Tareas de HOY a la hora `same_day_time` (09:00): campana + push.
 *  - Tareas de MAÑANA a la hora `day_before_time` (20:00): campana + push.
 *  (Las revisiones que salen hoy van en el resumen; las respondidas avisan al momento.)
 *
 * Y, para todos (lib/notifications/scheduled-jobs):
 *  - Suelta en un solo push lo retenido durante las horas de silencio.
 *  - Recordatorio de RPE de Strava a las 20:00 de cada atleta.
 *  - Avisos de cambios de plan hechos por la IA (cola del MCP).
 *  - Entreno del día y resumen de la semana del atleta.
 *  - Resumen semanal del coach, los lunes a la hora del resumen diario.
 *
 * Dedupe: coach_reminder_log con unique(coach_id, kind, remind_date).
 * Seguridad: Authorization: Bearer <CRON_SECRET>. Fail-closed.
 * Ejecución manual (ignora la ventana horaria de los avisos del coach, no la
 * de los del atleta): ?force=1
 */

function getSecret(): string | null {
    return process.env.COACH_REMINDER_SECRET
        || process.env.REVIEW_SCHEDULER_SECRET
        || process.env.CRON_SECRET
        || null
}

function isAuthorized(request: NextRequest): boolean {
    const secret = getSecret()
    if (!secret) return false
    return request.headers.get('authorization') === `Bearer ${secret}`
}

function nowInTimezone(tz: string): { today: string; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date())
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
    return {
        today: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
    }
}

function isValidTimezone(tz: string | null | undefined): tz is string {
    if (!tz) return false
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz })
        return true
    } catch {
        return false
    }
}

function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
}

/** La ventana coincide si la hora configurada cae en los últimos 15 minutos. */
function inWindow(nowMinutes: number, targetTime: string): boolean {
    const target = parseTimeToMinutes(targetTime)
    return nowMinutes >= target && nowMinutes < target + 15
}

function isMonday(dateStr: string): boolean {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1
}

function addDaysToDateStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

type ReminderKind = 'tasks_same_day' | 'tasks_day_before' | 'daily_digest' | 'weekly_digest'

async function claimReminder(
    admin: ReturnType<typeof createAdminClient>,
    coachId: string,
    kind: ReminderKind,
    remindDate: string
): Promise<boolean> {
    // Insert con unique constraint = lock de idempotencia entre ejecuciones
    const { error } = await admin
        .from('coach_reminder_log')
        .insert({ coach_id: coachId, kind, remind_date: remindDate })

    if (error) {
        if (error.code !== '23505') {
            console.error('[cron/coach-reminders] Error en log:', error.message)
        }
        return false
    }
    return true
}

async function handle(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const force = new URL(request.url).searchParams.get('force') === '1'
    const admin = createAdminClient()

    const { data: coaches, error: coachesError } = await admin
        .from('coaches')
        .select('id, timezone')

    if (coachesError) {
        return NextResponse.json({ ok: false, error: coachesError.message }, { status: 500 })
    }

    const sent: { coachId: string; kind: string; result?: string }[] = []

    for (const coach of coaches ?? []) {
        const coachId = coach.id as string
        try {
            const tz = isValidTimezone(coach.timezone as string | null) ? coach.timezone as string : schedulerTimezone()
            const { today, minutes } = nowInTimezone(tz)
            const tomorrow = addDaysToDateStr(today, 1)
            const prefs = await getCoachNotificationPreferences(coachId)

            const tasksFor = async (date: string) => {
                const { data } = await admin
                    .from('coach_tasks')
                    .select('title')
                    .eq('coach_id', coachId)
                    .eq('status', 'pending')
                    .eq('task_date', date)
                return (data ?? []).map(t => t.title as string)
            }

            const jobs: { kind: ReminderKind; enabled: boolean; when: string; remindDate: string; run: () => Promise<string | null> }[] = [
                {
                    kind: 'daily_digest',
                    enabled: prefs.digest_enabled,
                    when: prefs.digest_time,
                    remindDate: today,
                    run: () => sendCoachDailyDigest(coachId, today, tz),
                },
                {
                    kind: 'weekly_digest',
                    enabled: prefs.weekly_digest_enabled && isMonday(today),
                    when: prefs.digest_time,
                    remindDate: today,
                    run: () => sendCoachWeeklyDigest(coachId, today, tz),
                },
                {
                    kind: 'tasks_same_day',
                    enabled: prefs.tasks_enabled,
                    when: prefs.same_day_time,
                    remindDate: today,
                    run: async () => {
                        const titles = await tasksFor(today)
                        if (titles.length === 0) return null
                        await notifyCoach(coachId, 'tasks', {
                            title: `Tienes ${titles.length} tarea${titles.length !== 1 ? 's' : ''} para hoy`,
                            body: formatNameList(titles),
                            url: '/coach/calendar',
                            tag: `coach-tasks_same_day-${today}`,
                        }, { kind: 'tasks_same_day', groupKey: `tasks:${today}` })
                        return 'sent'
                    },
                },
                {
                    kind: 'tasks_day_before',
                    enabled: prefs.tasks_enabled,
                    when: prefs.day_before_time,
                    remindDate: tomorrow,
                    run: async () => {
                        const titles = await tasksFor(tomorrow)
                        if (titles.length === 0) return null
                        await notifyCoach(coachId, 'tasks', {
                            title: `Mañana: ${titles.length} tarea${titles.length !== 1 ? 's' : ''} pendiente${titles.length !== 1 ? 's' : ''}`,
                            body: formatNameList(titles),
                            url: '/coach/calendar',
                            tag: `coach-tasks_day_before-${tomorrow}`,
                        }, { kind: 'tasks_day_before', groupKey: `tasks:${tomorrow}` })
                        return 'sent'
                    },
                },
            ]

            for (const job of jobs) {
                if (!job.enabled) continue
                if (!force && !inWindow(minutes, job.when)) continue

                // Reclamar antes de enviar: evita duplicados entre ejecuciones
                const claimed = await claimReminder(admin, coachId, job.kind, job.remindDate)
                if (!claimed) continue

                const result = await job.run()
                if (result) sent.push({ coachId, kind: job.kind, result })
            }
        } catch (error) {
            console.error('[cron/coach-reminders] Error con coach', coachId, error)
        }
    }

    const jobs: Record<string, unknown> = {}
    try {
        jobs.heldPushes = await releaseHeldPushes()
    } catch (error) {
        jobs.heldPushes = { error: error instanceof Error ? error.message : String(error) }
    }
    try {
        jobs.stravaFeedback = await sendStravaFeedbackReminders()
    } catch (error) {
        jobs.stravaFeedback = { error: error instanceof Error ? error.message : String(error) }
    }
    for (const [key, job] of [
        ['planChangesFromAI', () => processNotificationOutbox()],
        ['workoutToday', () => sendWorkoutReminders()],
        ['weekSummary', () => sendWeekSummaries()],
    ] as const) {
        try {
            jobs[key] = await job()
        } catch (error) {
            jobs[key] = { error: error instanceof Error ? error.message : String(error) }
        }
    }

    return NextResponse.json({ ok: true, coaches: coaches?.length ?? 0, sent, ...jobs })
}

export async function POST(request: NextRequest) {
    return handle(request)
}

export async function GET(request: NextRequest) {
    return handle(request)
}
