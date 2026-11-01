import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAppUrl } from '@/lib/app-url'
import { sendCoachDigestEmail, type CoachDigestEmailSection } from '@/lib/email/mailer'
import { notifyCoach, coachClientUrl } from '@/lib/notifications/coach'
import { logDelivery } from '@/lib/notifications/delivery-log'
import {
    buildCoachDigest,
    buildCoachWeeklyDigest,
    daysBetweenKeys,
    trainingProgramEndDate,
} from '@/lib/notifications/coach-digest-content'

/** Ventana de «caduca pronto» para planes y objetivos. */
const EXPIRING_WITHIN_DAYS = 7
/** Revisiones sin responder: a partir de cuántos días se mencionan. */
const UNANSWERED_REVIEW_DAYS = 2
/** Mensajes del atleta sin respuesta: a partir de cuántas horas se mencionan. */
const UNANSWERED_MESSAGE_HOURS = 24

type DigestData = Parameters<typeof buildCoachDigest>[0]

function dayKeyInTimezone(iso: string | Date, tz: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(typeof iso === 'string' ? new Date(iso) : iso)
}

/** Reúne con service role todo lo que el coach tiene pendiente hoy. */
export async function gatherCoachDigestData(coachId: string, today: string, tz: string, now: Date = new Date()): Promise<DigestData> {
    const admin = createAdminClient()

    const { data: clientRows } = await admin
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .eq('is_sample', false)
    const clients = new Map((clientRows ?? []).map(c => [c.id as string, (c.full_name as string | null)?.trim() || 'Atleta']))
    const clientIds = [...clients.keys()]
    const nameOf = (id: string) => clients.get(id) ?? 'Atleta'

    if (clientIds.length === 0) {
        return { reviewsToValidate: [], reviewsUnanswered: [], messagesUnanswered: [], expiring: [], tasksToday: [], reviewsGoingOut: [] }
    }

    const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString()

    const [submitted, pending, messages, programs, macros, diets, goals, tasks, schedules] = await Promise.all([
        admin.from('checkins').select('id, client_id, review_schedule_id, submitted_at')
            .eq('coach_id', coachId).eq('type', 'checkin').eq('status', 'reviewed')
            .gte('submitted_at', monthAgo).in('client_id', clientIds)
            .order('submitted_at', { ascending: false }),
        admin.from('checkins').select('id, client_id, created_at')
            .eq('coach_id', coachId).eq('type', 'checkin').eq('status', 'pending')
            .gte('created_at', monthAgo).in('client_id', clientIds),
        admin.from('messages').select('client_id, sender_role, created_at')
            .eq('coach_id', coachId).gte('created_at', twoWeeksAgo).in('client_id', clientIds)
            .order('created_at', { ascending: false }),
        admin.from('training_programs').select('client_id, name, effective_from, effective_to, total_weeks')
            .eq('coach_id', coachId).eq('status', 'active').in('client_id', clientIds),
        admin.from('macro_plans').select('client_id, effective_from, effective_to, created_at')
            .eq('coach_id', coachId).in('client_id', clientIds).not('effective_to', 'is', null),
        admin.from('diet_plans').select('client_id, name, effective_from, effective_to, status')
            .eq('coach_id', coachId).eq('status', 'active').in('client_id', clientIds).not('effective_to', 'is', null),
        admin.from('athlete_current_goals').select('client_id, title, target_date')
            .eq('coach_id', coachId).in('client_id', clientIds).not('target_date', 'is', null),
        admin.from('coach_tasks').select('title, client_id, task_date')
            .eq('coach_id', coachId).eq('status', 'pending').lte('task_date', today),
        admin.from('client_review_schedules').select('client_id, next_due_date, last_sent_at')
            .eq('coach_id', coachId).eq('is_active', true).in('client_id', clientIds),
    ])

    // Revisiones respondidas que esperan al coach (sin revisión o en borrador).
    // Como en el panel, solo cuenta la última de cada programación (o de cada
    // atleta si no tiene): las anteriores ya no se validan.
    const seenKeys = new Set<string>()
    const submittedRows = ((submitted.data ?? []) as Array<{ id: string; client_id: string; review_schedule_id: string | null }>)
        .filter(row => {
            const key = row.review_schedule_id ? `schedule:${row.review_schedule_id}` : `client:${row.client_id}`
            if (seenKeys.has(key)) return false
            seenKeys.add(key)
            return true
        })
    const reviewsRes = submittedRows.length
        ? await admin.from('reviews').select('checkin_id, status, ai_status').in('checkin_id', submittedRows.map(r => r.id))
        : { data: [] as Array<{ checkin_id: string; status: string; ai_status: string | null }> }
    const reviewByCheckin = new Map(((reviewsRes.data ?? []) as Array<{ checkin_id: string; status: string; ai_status: string | null }>).map(r => [r.checkin_id, r]))
    const reviewsToValidate = submittedRows
        .filter(row => {
            const review = reviewByCheckin.get(row.id)
            return !review || review.status === 'draft'
        })
        .map(row => ({
            clientId: row.client_id,
            name: nameOf(row.client_id),
            aiReady: reviewByCheckin.get(row.id)?.ai_status === 'completed',
        }))

    // Revisiones que el atleta no ha respondido en 2 días o más
    const reviewsUnanswered = ((pending.data ?? []) as Array<{ client_id: string; created_at: string }>)
        .map(row => ({ clientId: row.client_id, name: nameOf(row.client_id), days: daysBetweenKeys(dayKeyInTimezone(row.created_at, tz), today) }))
        .filter(row => row.days >= UNANSWERED_REVIEW_DAYS)

    // Conversaciones cuyo último mensaje es del atleta y lleva más de 24 h
    const lastByClient = new Map<string, { sender_role: string; created_at: string }>()
    for (const message of (messages.data ?? []) as Array<{ client_id: string; sender_role: string; created_at: string }>) {
        if (!lastByClient.has(message.client_id)) lastByClient.set(message.client_id, message)
    }
    const messagesUnanswered = [...lastByClient.entries()]
        .filter(([, last]) => last.sender_role === 'client')
        .map(([clientId, last]) => ({ clientId, name: nameOf(clientId), hours: (now.getTime() - new Date(last.created_at).getTime()) / 3_600_000 }))
        .filter(row => row.hours >= UNANSWERED_MESSAGE_HOURS)
        .sort((a, b) => b.hours - a.hours)

    // Planes y objetivos que terminan en los próximos 7 días (o ya vencidos sin sustituir)
    const expiring: DigestData['expiring'] = []
    const addExpiring = (clientId: string, what: string, endDate: string | null | undefined) => {
        if (!endDate) return
        const daysLeft = daysBetweenKeys(today, endDate.slice(0, 10))
        if (daysLeft > EXPIRING_WITHIN_DAYS || daysLeft < -EXPIRING_WITHIN_DAYS) return
        expiring.push({ clientId, name: nameOf(clientId), what, endDate: endDate.slice(0, 10), daysLeft })
    }
    for (const program of (programs.data ?? []) as Array<{ client_id: string; name: string | null; effective_from: string | null; effective_to: string | null; total_weeks: number | null }>) {
        addExpiring(program.client_id, `Programa «${program.name?.trim() || 'de fuerza'}»`, trainingProgramEndDate(program))
    }
    // Macros y dieta: solo el plan vigente más reciente de cada atleta
    const latestPerClient = <T extends { client_id: string; effective_from: string | null }>(rows: T[]) => {
        const latest = new Map<string, T>()
        for (const row of rows) {
            if ((row.effective_from ?? '') > today) continue
            const current = latest.get(row.client_id)
            if (!current || (row.effective_from ?? '') > (current.effective_from ?? '')) latest.set(row.client_id, row)
        }
        return [...latest.values()]
    }
    for (const plan of latestPerClient((macros.data ?? []) as Array<{ client_id: string; effective_from: string | null; effective_to: string | null }>)) {
        addExpiring(plan.client_id, 'Plan de macros', plan.effective_to)
    }
    for (const plan of latestPerClient((diets.data ?? []) as Array<{ client_id: string; name: string | null; effective_from: string | null; effective_to: string | null }>)) {
        addExpiring(plan.client_id, `Dieta «${plan.name?.trim() || 'actual'}»`, plan.effective_to)
    }
    for (const goal of (goals.data ?? []) as Array<{ client_id: string; title: string | null; target_date: string | null }>) {
        addExpiring(goal.client_id, `Objetivo «${goal.title?.trim() || 'actual'}»`, goal.target_date)
    }

    const tasksToday = ((tasks.data ?? []) as Array<{ title: string; client_id: string | null; task_date: string }>)
        .map(task => ({ title: task.title, clientName: task.client_id ? clients.get(task.client_id) ?? null : null, overdue: task.task_date < today }))

    const reviewsGoingOut = ((schedules.data ?? []) as Array<{ client_id: string; next_due_date: string | null; last_sent_at: string | null }>)
        .filter(s => s.next_due_date === today || (s.last_sent_at && dayKeyInTimezone(s.last_sent_at, tz) === today))
        .map(s => ({ clientId: s.client_id, name: nameOf(s.client_id) }))

    return { reviewsToValidate, reviewsUnanswered, messagesUnanswered, expiring, tasksToday, reviewsGoingOut }
}

/** Emails de las personas que llevan la cuenta del coach (dueño y miembros activos). */
async function getCoachRecipients(coachId: string): Promise<{ emails: string[]; name: string | null }> {
    const admin = createAdminClient()
    const [{ data: coach }, { data: members }] = await Promise.all([
        admin.from('coaches').select('name, created_by').eq('id', coachId).maybeSingle(),
        admin.from('coach_memberships').select('user_id, role').eq('coach_id', coachId).eq('status', 'active').neq('role', 'client'),
    ])
    const userIds = [...new Set([coach?.created_by, ...(members ?? []).map(m => m.user_id)].filter((id): id is string => Boolean(id)))]
    const emails: string[] = []
    for (const userId of userIds) {
        const { data } = await admin.auth.admin.getUserById(userId)
        if (data?.user?.email) emails.push(data.user.email)
    }
    return { emails: [...new Set(emails)], name: (coach?.name as string | null) ?? null }
}

function dateLabel(today: string, tz: string) {
    const [y, m, d] = today.split('-').map(Number)
    return new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(Date.UTC(y, m - 1, d, 12)))
}

const TAB_URL: Record<string, (clientId?: string) => string> = {
    checkins: clientId => clientId ? coachClientUrl(clientId, 'checkins') : '/coach/dashboard',
    messages: clientId => clientId ? `/coach/messages?client=${clientId}` : '/coach/messages',
    plan: clientId => clientId ? `/coach/clients?client=${clientId}&tab=plan` : '/coach/clients',
    tasks: () => '/coach/calendar',
    calendar: () => '/coach/calendar',
}

/**
 * Envía el resumen diario: email (si hay destinatarios y SMTP) y una entrada
 * en la campana sin push. Si no hay nada pendiente, no envía nada.
 */
export async function sendCoachDailyDigest(coachId: string, today: string, tz: string): Promise<'sent' | 'empty' | 'failed'> {
    const data = await gatherCoachDigestData(coachId, today, tz)
    const digest = buildCoachDigest(data)
    if (digest.total === 0) return 'empty'

    const appUrl = getAppUrl()
    const sections: CoachDigestEmailSection[] = digest.sections.map(section => ({
        title: section.title,
        items: section.items.map(item => ({
            label: item.label,
            detail: item.detail,
            url: `${appUrl}${TAB_URL[section.tab](item.clientId)}`,
        })),
    }))

    const label = dateLabel(today, tz)
    const { emails, name } = await getCoachRecipients(coachId)
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
    for (const to of emails) {
        const result = await sendCoachDigestEmail({
            to,
            coachName: name,
            dateLabel: label,
            headline: digest.headline,
            sections,
            dashboardUrl: `${appUrl}/coach/dashboard`,
            settingsUrl: `${appUrl}/coach/settings?tab=notificaciones`,
        })
        emailStatus = result.ok ? 'sent' : emailStatus === 'sent' ? 'sent' : 'failed'
    }

    await notifyCoach(coachId, 'system', {
        title: 'Tu resumen de hoy',
        body: digest.headline,
        url: '/coach/dashboard',
        tag: `coach-digest-${today}`,
    }, { kind: 'daily_digest', groupKey: `digest:${today}`, push: false })

    await logDelivery({ audience: 'coach', coachId, kind: 'daily_digest_email', status: emailStatus === 'failed' ? 'failed' : 'sent', emailStatus })
    return emailStatus === 'failed' ? 'failed' : 'sent'
}

/**
 * Resumen semanal (lunes, a la hora del resumen diario): cómo fue la semana
 * pasada y qué viene. Email + entrada en la campana, sin push.
 */
export async function sendCoachWeeklyDigest(coachId: string, today: string, tz: string, now: Date = new Date()): Promise<'sent' | 'failed'> {
    const admin = createAdminClient()
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString()
    const inAWeek = addDaysKey(today, 7)

    const { data: clientRows } = await admin
        .from('clients')
        .select('id, full_name, created_at')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .eq('is_sample', false)
    const clients = (clientRows ?? []) as Array<{ id: string; full_name: string | null; created_at: string }>
    const clientIds = clients.map(c => c.id)

    const [sent, answered, messages, schedules, recentAnswers, pendingOld] = await Promise.all([
        admin.from('checkins').select('id', { count: 'exact', head: true })
            .eq('coach_id', coachId).eq('type', 'checkin').gte('created_at', weekAgo),
        admin.from('checkins').select('id')
            .eq('coach_id', coachId).eq('type', 'checkin').gte('submitted_at', weekAgo),
        admin.from('messages').select('sender_role')
            .eq('coach_id', coachId).gte('created_at', weekAgo),
        clientIds.length
            ? admin.from('client_review_schedules').select('id', { count: 'exact', head: true })
                .eq('coach_id', coachId).eq('is_active', true).in('client_id', clientIds)
                .gte('next_due_date', today).lt('next_due_date', inAWeek)
            : Promise.resolve({ count: 0 }),
        admin.from('checkins').select('client_id')
            .eq('coach_id', coachId).eq('type', 'checkin').gte('submitted_at', twoWeeksAgo),
        admin.from('checkins').select('client_id')
            .eq('coach_id', coachId).eq('type', 'checkin').in('status', ['pending', 'archived']).gte('created_at', twoWeeksAgo),
    ])

    const answeredIds = ((answered.data ?? []) as Array<{ id: string }>).map(r => r.id)
    const approved = answeredIds.length
        ? await admin.from('reviews').select('id', { count: 'exact', head: true }).in('checkin_id', answeredIds).eq('status', 'approved')
        : { count: 0 }
    const messageRows = (messages.data ?? []) as Array<{ sender_role: string }>

    // Atletas a los que se envió revisión en 14 días y no han respondido ninguna
    const answeredRecently = new Set(((recentAnswers.data ?? []) as Array<{ client_id: string }>).map(r => r.client_id))
    const askedRecently = new Set(((pendingOld.data ?? []) as Array<{ client_id: string }>).map(r => r.client_id))
    const silentAthletes = clients
        .filter(c => askedRecently.has(c.id) && !answeredRecently.has(c.id))
        .map(c => ({ clientId: c.id, name: c.full_name?.trim() || 'Atleta' }))

    const daily = await gatherCoachDigestData(coachId, today, tz, now)
    const weekly = buildCoachWeeklyDigest({
        reviewsSent: sent.count ?? 0,
        reviewsAnswered: answeredIds.length,
        reviewsApproved: approved.count ?? 0,
        athleteMessages: messageRows.filter(m => m.sender_role === 'client').length,
        coachMessages: messageRows.filter(m => m.sender_role === 'coach').length,
        silentAthletes,
        reviewsThisWeek: schedules.count ?? 0,
        expiringThisWeek: daily.expiring.filter(e => e.daysLeft >= 0).length,
    })

    const appUrl = getAppUrl()
    const sections: CoachDigestEmailSection[] = weekly.sections.map(section => ({
        title: section.title,
        items: section.items.map(item => ({
            label: item.label,
            detail: item.detail,
            url: `${appUrl}${TAB_URL[section.tab]('clientId' in item ? item.clientId : undefined)}`,
        })),
    }))

    const label = dateLabel(today, tz)
    const { emails, name } = await getCoachRecipients(coachId)
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
    for (const to of emails) {
        const result = await sendCoachDigestEmail({
            to,
            coachName: name,
            dateLabel: label,
            headline: weekly.headline,
            sections,
            dashboardUrl: `${appUrl}/coach/dashboard`,
            settingsUrl: `${appUrl}/coach/settings?tab=notificaciones`,
            weekly: true,
        })
        emailStatus = result.ok ? 'sent' : emailStatus === 'sent' ? 'sent' : 'failed'
    }

    await notifyCoach(coachId, 'system', {
        title: 'Tu resumen de la semana',
        body: weekly.headline,
        url: '/coach/analytics',
        tag: `coach-weekly-${today}`,
    }, { kind: 'weekly_digest', groupKey: `weekly:${today}`, push: false })

    await logDelivery({ audience: 'coach', coachId, kind: 'weekly_digest_email', status: emailStatus === 'failed' ? 'failed' : 'sent', emailStatus })
    return emailStatus === 'failed' ? 'failed' : 'sent'
}

function addDaysKey(key: string, days: number) {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
