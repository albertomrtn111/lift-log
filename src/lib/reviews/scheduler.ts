/**
 * Scheduler de revisiones — sustituye al cron de n8n.
 *
 * Fuente de verdad ÚNICA: client_review_schedules.next_due_date.
 * Si el coach cambia el día de la revisión (p.ej. de sábado a jueves),
 * basta con que next_due_date refleje el nuevo día: el scheduler la
 * disparará ese día y seguirá la cadencia desde ahí. No hay ninguna
 * lógica de "día de la semana" escondida.
 *
 * Idempotente: puede ejecutarse varias veces al día sin duplicar envíos
 * (se salta schedules con last_sent_at de hoy).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getFormUrl } from '@/lib/app-url'
import { sendReviewCreatedNotification } from '@/lib/notifications/client'
import { notifyCoach } from '@/lib/notifications/coach'
import { sendReviewEmailSmtp } from '@/lib/email/mailer'

const DEFAULT_TIMEZONE = 'Europe/Madrid'

export function schedulerTimezone(): string {
    return process.env.REVIEW_SCHEDULER_TIMEZONE || DEFAULT_TIMEZONE
}

/** Fecha (YYYY-MM-DD) actual en la zona horaria del scheduler */
export function todayInTimezone(tz: string = schedulerTimezone()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date())
}

/** Hora (0-23) actual en la zona horaria del scheduler */
export function currentHourInTimezone(tz: string = schedulerTimezone()): number {
    return Number(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: tz,
            hour: '2-digit',
            hour12: false,
        }).format(new Date())
    )
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Avanza la fecha de vencimiento manteniendo la cadencia desde la fecha
 *  debida (no desde hoy), saltando ocurrencias ya pasadas. */
function advanceNextDueDate(dueDate: string, frequencyDays: number, today: string): string {
    const freq = Math.max(1, frequencyDays)
    let next = dueDate
    while (next <= today) {
        next = addDays(next, freq)
    }
    return next
}

interface DueScheduleRow {
    id: string
    client_id: string
    coach_id: string
    review_template_id: string
    frequency_days: number
    next_due_date: string
    last_sent_at: string | null
    review_template: {
        id: string
        name: string
        review_type: string | null
        form_template_id: string | null
        is_active: boolean
    } | null
    client: {
        id: string
        email: string | null
        full_name: string | null
        status: string
        auth_user_id: string | null
    } | null
}

export interface DispatchResultItem {
    scheduleId: string
    clientId: string
    clientName: string | null
    status: 'sent' | 'skipped' | 'error'
    detail: string
    checkinId?: string
}

export interface DispatchSummary {
    date: string
    due: number
    sent: number
    skipped: number
    errors: number
    items: DispatchResultItem[]
}

export async function dispatchDueReviews(): Promise<DispatchSummary> {
    const admin = createAdminClient()
    const tz = schedulerTimezone()
    const today = todayInTimezone(tz)

    const { data, error } = await admin
        .from('client_review_schedules')
        .select(`
            id, client_id, coach_id, review_template_id, frequency_days,
            next_due_date, last_sent_at,
            review_template:review_templates ( id, name, review_type, form_template_id, is_active ),
            client:clients ( id, email, full_name, status, auth_user_id )
        `)
        .eq('is_active', true)
        .lte('next_due_date', today)

    if (error) {
        throw new Error(`Error consultando schedules: ${error.message}`)
    }

    const schedules = (data ?? []) as unknown as DueScheduleRow[]
    const items: DispatchResultItem[] = []
    const sentByCoach = new Map<string, string[]>()

    for (const schedule of schedules) {
        const clientName = schedule.client?.full_name ?? null
        const base = {
            scheduleId: schedule.id,
            clientId: schedule.client_id,
            clientName,
        }

        try {
            // --- Filtros de elegibilidad -----------------------------------
            if (!schedule.client) {
                items.push({ ...base, status: 'skipped', detail: 'Cliente no encontrado' })
                continue
            }
            if (schedule.client.status !== 'active') {
                items.push({ ...base, status: 'skipped', detail: `Cliente ${schedule.client.status}` })
                continue
            }
            if (!schedule.review_template || !schedule.review_template.is_active) {
                items.push({ ...base, status: 'skipped', detail: 'Plantilla inactiva o inexistente' })
                continue
            }
            // Idempotencia: si ya se envió hoy, no repetir
            if (schedule.last_sent_at) {
                const lastSentDay = new Intl.DateTimeFormat('en-CA', {
                    timeZone: tz,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }).format(new Date(schedule.last_sent_at))
                if (lastSentDay === today) {
                    items.push({ ...base, status: 'skipped', detail: 'Ya enviada hoy' })
                    continue
                }
            }

            // --- Archivar pendientes anteriores de este schedule ------------
            await admin
                .from('checkins')
                .update({ status: 'archived' })
                .eq('coach_id', schedule.coach_id)
                .eq('client_id', schedule.client_id)
                .eq('type', 'checkin')
                .eq('status', 'pending')
                .eq('review_schedule_id', schedule.id)

            // --- Crear el check-in ------------------------------------------
            const periodEnd = schedule.next_due_date
            const periodStart = addDays(periodEnd, -Math.max(1, schedule.frequency_days))

            const { data: newCheckin, error: insertErr } = await admin
                .from('checkins')
                .insert({
                    coach_id: schedule.coach_id,
                    client_id: schedule.client_id,
                    type: 'checkin',
                    status: 'pending',
                    period_start: periodStart,
                    period_end: periodEnd,
                    form_template_id: schedule.review_template.form_template_id,
                    review_template_id: schedule.review_template_id,
                    review_schedule_id: schedule.id,
                    source: 'scheduler',
                    raw_payload: {},
                })
                .select('id')
                .single()

            if (insertErr || !newCheckin) {
                items.push({
                    ...base,
                    status: 'error',
                    detail: `Insert checkin: ${insertErr?.message ?? 'desconocido'}`,
                })
                continue
            }

            const checkinId = newCheckin.id as string

            // --- Avanzar el schedule (cadencia desde la fecha debida) -------
            const nextDue = advanceNextDueDate(
                schedule.next_due_date,
                schedule.frequency_days,
                today
            )
            const { error: updateErr } = await admin
                .from('client_review_schedules')
                .update({
                    last_sent_at: new Date().toISOString(),
                    next_due_date: nextDue,
                })
                .eq('id', schedule.id)

            if (updateErr) {
                // No abortamos: el checkin ya existe. Lo registramos como error visible.
                console.error('[scheduler] Error avanzando schedule', schedule.id, updateErr.message)
            }

            // --- Notificación push + inbox (non-blocking) -------------------
            try {
                await sendReviewCreatedNotification(
                    schedule.client_id,
                    checkinId,
                    schedule.review_template.name
                )
            } catch (err) {
                console.warn('[scheduler] Push/Inbox falló (non-blocking):', err)
            }

            // --- Email (non-blocking) ---------------------------------------
            let emailDetail = 'sin email (cliente sin dirección)'
            if (schedule.client.email) {
                const emailResult = await sendReviewEmailSmtp({
                    to: schedule.client.email,
                    clientName: schedule.client.full_name ?? undefined,
                    formUrl: getFormUrl(checkinId),
                    reviewTemplateName: schedule.review_template.name,
                    periodEnd,
                    coachId: schedule.coach_id,
                })
                emailDetail = emailResult.ok ? 'email enviado' : `email falló: ${emailResult.error}`
            }

            items.push({
                ...base,
                status: 'sent',
                detail: `Checkin creado (${periodStart} → ${periodEnd}), próxima ${nextDue}, ${emailDetail}`,
                checkinId,
            })

            const coachList = sentByCoach.get(schedule.coach_id) ?? []
            coachList.push(clientName ?? 'Atleta')
            sentByCoach.set(schedule.coach_id, coachList)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            items.push({ ...base, status: 'error', detail: message })
        }
    }

    // Aviso push al coach: sus revisiones de hoy acaban de salir (non-blocking)
    for (const [coachId, names] of sentByCoach) {
        const shown = names.slice(0, 3)
        const rest = names.length - shown.length
        const body = rest > 0 ? `${shown.join(', ')} y ${rest} más` : shown.join(', ')
        try {
            await notifyCoach(coachId, 'reviews', {
                title: `${names.length} revisión${names.length !== 1 ? 'es' : ''} enviada${names.length !== 1 ? 's' : ''} hoy`,
                body,
                url: '/coach/calendar',
                tag: `coach-reviews-sent-${today}`,
            })
        } catch (err) {
            console.warn('[scheduler] Push al coach falló (non-blocking):', err)
        }
    }

    return {
        date: today,
        due: schedules.length,
        sent: items.filter((i) => i.status === 'sent').length,
        skipped: items.filter((i) => i.status === 'skipped').length,
        errors: items.filter((i) => i.status === 'error').length,
        items,
    }
}
