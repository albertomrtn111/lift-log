/**
 * Recordatorios de revisiones sin responder y limpieza diaria del buzón del
 * atleta. Los lanza el cron de revisiones (09:00, hora del planificador)
 * justo después de enviar las revisiones del día.
 *
 * Idempotente: cada recordatorio reserva antes una fila única en
 * notification_deliveries (review-reminder:<checkin>:<etapa>).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getFormUrl } from '@/lib/app-url'
import { schedulerTimezone, todayInTimezone } from '@/lib/reviews/scheduler'
import { getReviewEmailPlan, sendReviewReminderNotification } from '@/lib/notifications/client'
import { claimDelivery, setDeliveryEmailStatus } from '@/lib/notifications/delivery-log'
import { sendReviewReminderEmailSmtp } from '@/lib/email/mailer'
import { buildReviewReminderCopy, planReviewReminder, reviewReminderKey } from '@/lib/reviews/reminder-plan'

/** Revisiones más antiguas que esto ya no se recuerdan. */
const MAX_REMINDER_AGE_DAYS = 21

interface PendingCheckinRow {
    id: string
    client_id: string
    coach_id: string
    created_at: string
    review_schedule_id: string | null
    review_template_id: string | null
}

export interface ReminderSummary {
    candidates: number
    sent: number
    skipped: number
    errors: number
}

/** Lote de claves por consulta: con muchas, la URL de PostgREST se hace demasiado larga. */
const KEY_BATCH = 60

async function selectDeliveriesByKey(admin: ReturnType<typeof createAdminClient>, keys: string[]) {
    const data: Array<{ dedupe_key: string; created_at: string }> = []
    for (let i = 0; i < keys.length; i += KEY_BATCH) {
        const { data: batch, error } = await admin
            .from('notification_deliveries')
            .select('dedupe_key, created_at')
            .in('dedupe_key', keys.slice(i, i + KEY_BATCH))
        if (error) return { data: null, error }
        data.push(...((batch ?? []) as typeof data))
    }
    return { data, error: null }
}

function dayInTimezone(iso: string, tz: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(iso))
}

export async function sendPendingReviewReminders(now: Date = new Date()): Promise<ReminderSummary> {
    const admin = createAdminClient()
    const tz = schedulerTimezone()
    const today = todayInTimezone(tz)
    const oldest = new Date(now.getTime() - MAX_REMINDER_AGE_DAYS * 86_400_000).toISOString()
    const summary: ReminderSummary = { candidates: 0, sent: 0, skipped: 0, errors: 0 }

    const { data: pendingData, error: pendingError } = await admin
        .from('checkins')
        .select('id, client_id, coach_id, created_at, review_schedule_id, review_template_id')
        .eq('type', 'checkin')
        .eq('status', 'pending')
        .gte('created_at', oldest)
    if (pendingError) throw new Error(`Revisiones pendientes: ${pendingError.message}`)

    const pending = (pendingData ?? []) as PendingCheckinRow[]
    if (pending.length === 0) return summary

    const clientIds = [...new Set(pending.map(row => row.client_id))]
    const scheduleIds = [...new Set(pending.map(row => row.review_schedule_id).filter((id): id is string => Boolean(id)))]
    const templateIds = [...new Set(pending.map(row => row.review_template_id).filter((id): id is string => Boolean(id)))]
    const keys = pending.flatMap(row => [reviewReminderKey(row.id, 1), reviewReminderKey(row.id, 2)])

    const [clientsRes, schedulesRes, templatesRes, sentRes] = await Promise.all([
        admin.from('clients').select('id, status, email, full_name, is_sample').in('id', clientIds),
        scheduleIds.length
            ? admin.from('client_review_schedules').select('id, next_due_date, is_active').in('id', scheduleIds)
            : Promise.resolve({ data: [], error: null }),
        templateIds.length
            ? admin.from('review_templates').select('id, name').in('id', templateIds)
            : Promise.resolve({ data: [], error: null }),
        selectDeliveriesByKey(admin, keys),
    ])
    if (clientsRes.error) throw new Error(`Clientes: ${clientsRes.error.message}`)
    // Sin registro de entregas no hay candado: mejor no recordar que repetir.
    if (sentRes.error) throw new Error(`Registro de entregas: ${sentRes.error.message}`)

    const clients = new Map((clientsRes.data ?? []).map(c => [c.id as string, c]))
    const schedules = new Map(((schedulesRes.data ?? []) as Array<{ id: string; next_due_date: string | null; is_active: boolean }>).map(s => [s.id, s]))
    const templates = new Map(((templatesRes.data ?? []) as Array<{ id: string; name: string | null }>).map(t => [t.id, t.name]))
    const sentByKey = new Map(((sentRes.data ?? []) as Array<{ dedupe_key: string; created_at: string }>).map(r => [r.dedupe_key, r.created_at]))

    for (const checkin of pending) {
        const client = clients.get(checkin.client_id)
        if (!client || client.status !== 'active' || client.is_sample) continue

        const first = sentByKey.get(reviewReminderKey(checkin.id, 1))
        const second = sentByKey.get(reviewReminderKey(checkin.id, 2))
        const lastSent = second ?? first ?? null
        const schedule = checkin.review_schedule_id ? schedules.get(checkin.review_schedule_id) : undefined

        const plan = planReviewReminder({
            createdAt: checkin.created_at,
            now,
            today,
            archiveDate: schedule?.is_active ? schedule.next_due_date : null,
            stageSent: second ? 2 : first ? 1 : 0,
            lastSentDay: lastSent ? dayInTimezone(lastSent, tz) : null,
        })
        if (!plan) continue
        summary.candidates += 1

        try {
            const deliveryId = await claimDelivery({
                audience: 'client',
                clientId: checkin.client_id,
                coachId: checkin.coach_id,
                kind: 'review_reminder',
                dedupeKey: reviewReminderKey(checkin.id, plan.stage),
            })
            if (!deliveryId) {
                summary.skipped += 1
                continue
            }

            const templateName = checkin.review_template_id ? templates.get(checkin.review_template_id) ?? null : null
            const result = await sendReviewReminderNotification(
                checkin.client_id,
                checkin.id,
                buildReviewReminderCopy({ ...plan, templateName }),
                deliveryId,
            )

            if (result.status !== 'sent') {
                summary.skipped += 1
                continue
            }
            summary.sent += 1

            // Email: siempre con el último recordatorio; con el primero, solo si
            // la revisión nueva no fue por email (le llegó por push).
            const emailPlan = client.email ? await getReviewEmailPlan(checkin.client_id) : null
            const sendEmail = Boolean(emailPlan?.canEmail && (plan.final || emailPlan.hasReviewPush))
            if (sendEmail && client.email) {
                const email = await sendReviewReminderEmailSmtp({
                    to: client.email,
                    clientName: client.full_name ?? undefined,
                    formUrl: getFormUrl(checkin.id),
                    reviewTemplateName: templateName ?? undefined,
                    archivesTomorrow: plan.archivesTomorrow,
                    coachId: checkin.coach_id,
                })
                await setDeliveryEmailStatus(deliveryId, email.ok ? 'sent' : 'failed')
            }
        } catch (error) {
            summary.errors += 1
            console.error('[reviews/reminders] Error con la revisión', checkin.id, error)
        }
    }

    return summary
}

/** Avisos automáticos que pierden sentido a las 48 h (suplementos, actividades de Strava). */
const EXPIRE_AUTOMATIC_HOURS = 48
/** Cualquier aviso sin leer con más de 30 días deja de contar como pendiente. */
const EXPIRE_ANY_DAYS = 30

export interface InboxCleanupSummary {
    supplements: number
    activities: number
    old: number
}

/** Marca como leídos los avisos que ya no piden nada, para que el globo cuente solo lo pendiente. */
export async function expireStaleClientNotifications(now: Date = new Date()): Promise<InboxCleanupSummary> {
    const admin = createAdminClient()
    const readAt = now.toISOString()
    const automaticCutoff = new Date(now.getTime() - EXPIRE_AUTOMATIC_HOURS * 3_600_000).toISOString()
    const anyCutoff = new Date(now.getTime() - EXPIRE_ANY_DAYS * 86_400_000).toISOString()

    const supplements = await admin
        .from('client_notifications')
        .update({ is_read: true, read_at: readAt })
        .eq('is_read', false)
        .eq('type', 'supplement')
        .lt('created_at', automaticCutoff)
        .select('id')
    if (supplements.error) throw new Error(`Suplementos: ${supplements.error.message}`)

    // Las actividades de Strava son los avisos «general» que llevan a /progress.
    const activities = await admin
        .from('client_notifications')
        .update({ is_read: true, read_at: readAt })
        .eq('is_read', false)
        .eq('type', 'general')
        .eq('url', '/progress')
        .lt('created_at', automaticCutoff)
        .select('id')
    if (activities.error) throw new Error(`Actividades: ${activities.error.message}`)

    const old = await admin
        .from('client_notifications')
        .update({ is_read: true, read_at: readAt })
        .eq('is_read', false)
        .lt('created_at', anyCutoff)
        .select('id')
    if (old.error) throw new Error(`Avisos antiguos: ${old.error.message}`)

    return {
        supplements: supplements.data?.length ?? 0,
        activities: activities.data?.length ?? 0,
        old: old.data?.length ?? 0,
    }
}
