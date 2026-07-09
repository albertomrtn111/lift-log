import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { schedulerTimezone, todayInTimezone } from '@/lib/reviews/scheduler'
import {
    getCoachNotificationPreferences,
    type CoachNotificationChannel,
} from '@/lib/notifications/coach'
import { sendPushToCoach } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Recordatorios push para el coach — disparado por pg_cron cada 15 minutos.
 *
 * Envía, según las preferencias de cada coach (coach_notification_preferences):
 *  - Tareas de HOY a la hora `same_day_time` (por defecto 09:00).
 *  - Tareas de MAÑANA a la hora `day_before_time` (por defecto 20:00).
 *  - Revisiones que saltan MAÑANA a la hora `day_before_time`.
 *  (Las revisiones del mismo día se notifican desde el scheduler al enviarse.)
 *
 * Dedupe: coach_reminder_log con unique(coach_id, kind, remind_date).
 * Seguridad: Authorization: Bearer <CRON_SECRET>. Fail-closed.
 * Ejecución manual (ignora la ventana horaria): ?force=1
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

function minutesNowInTimezone(tz: string): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date())
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
    return hour * 60 + minute
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

function addDaysToDateStr(dateStr: string, days: number): string {
    const date = new Date(`${dateStr}T12:00:00`)
    date.setDate(date.getDate() + days)
    return date.toISOString().slice(0, 10)
}

function formatNames(names: string[], max = 3): string {
    const shown = names.slice(0, max)
    const rest = names.length - shown.length
    return rest > 0 ? `${shown.join(', ')} y ${rest} más` : shown.join(', ')
}

type ReminderKind = 'tasks_same_day' | 'tasks_day_before' | 'reviews_day_before'

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
    const tz = schedulerTimezone()
    const today = todayInTimezone(tz)
    const tomorrow = addDaysToDateStr(today, 1)
    const nowMinutes = minutesNowInTimezone(tz)

    // Solo coaches con algún dispositivo suscrito
    const { data: subRows, error: subErr } = await admin
        .from('coach_push_subscriptions')
        .select('coach_id')

    if (subErr) {
        return NextResponse.json({ ok: false, error: subErr.message }, { status: 500 })
    }

    const coachIds = [...new Set((subRows ?? []).map(r => r.coach_id as string))]
    const sent: { coachId: string; kind: string }[] = []

    for (const coachId of coachIds) {
        try {
            const prefs = await getCoachNotificationPreferences(coachId)

            const jobs: { kind: ReminderKind; channel: CoachNotificationChannel; when: string; run: () => Promise<{ title: string; body: string; url: string } | null> }[] = [
                {
                    kind: 'tasks_same_day',
                    channel: 'tasks',
                    when: prefs.same_day_time,
                    run: async () => {
                        const { data } = await admin
                            .from('coach_tasks')
                            .select('title')
                            .eq('coach_id', coachId)
                            .eq('status', 'pending')
                            .eq('task_date', today)
                        if (!data || data.length === 0) return null
                        return {
                            title: `Tienes ${data.length} tarea${data.length !== 1 ? 's' : ''} para hoy`,
                            body: formatNames(data.map(t => t.title as string)),
                            url: '/coach/calendar',
                        }
                    },
                },
                {
                    kind: 'tasks_day_before',
                    channel: 'tasks',
                    when: prefs.day_before_time,
                    run: async () => {
                        const { data } = await admin
                            .from('coach_tasks')
                            .select('title')
                            .eq('coach_id', coachId)
                            .eq('status', 'pending')
                            .eq('task_date', tomorrow)
                        if (!data || data.length === 0) return null
                        return {
                            title: `Mañana: ${data.length} tarea${data.length !== 1 ? 's' : ''} pendiente${data.length !== 1 ? 's' : ''}`,
                            body: formatNames(data.map(t => t.title as string)),
                            url: '/coach/calendar',
                        }
                    },
                },
                {
                    kind: 'reviews_day_before',
                    channel: 'reviews',
                    when: prefs.day_before_time,
                    run: async () => {
                        const { data } = await admin
                            .from('client_review_schedules')
                            .select('id, client:clients!inner(full_name, status)')
                            .eq('coach_id', coachId)
                            .eq('is_active', true)
                            .eq('next_due_date', tomorrow)
                        const rows = (data ?? []).filter((r: any) => r.client?.status === 'active')
                        if (rows.length === 0) return null
                        return {
                            title: `Mañana saltan ${rows.length} revisión${rows.length !== 1 ? 'es' : ''}`,
                            body: formatNames(rows.map((r: any) => r.client?.full_name ?? 'Atleta')),
                            url: '/coach/calendar',
                        }
                    },
                },
            ]

            for (const job of jobs) {
                const channelEnabled = job.channel === 'tasks' ? prefs.tasks_enabled : prefs.reviews_enabled
                if (!channelEnabled) continue
                if (!force && !inWindow(nowMinutes, job.when)) continue

                const remindDate = job.kind === 'tasks_same_day' ? today : tomorrow
                const payload = await job.run()
                if (!payload) continue

                // Reclamar antes de enviar: evita duplicados entre ejecuciones
                const claimed = await claimReminder(admin, coachId, job.kind, remindDate)
                if (!claimed) continue

                await sendPushToCoach(coachId, {
                    ...payload,
                    tag: `coach-${job.kind}-${remindDate}`,
                })
                sent.push({ coachId, kind: job.kind })
            }
        } catch (error) {
            console.error('[cron/coach-reminders] Error con coach', coachId, error)
        }
    }

    return NextResponse.json({ ok: true, coaches: coachIds.length, sent })
}

export async function POST(request: NextRequest) {
    return handle(request)
}

export async function GET(request: NextRequest) {
    return handle(request)
}
