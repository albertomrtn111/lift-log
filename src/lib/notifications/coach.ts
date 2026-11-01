import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToCoach, type PushPayload, type PushSendResult } from '@/lib/push'
import { logDelivery } from '@/lib/notifications/delivery-log'
import { isValidTimezone, quietHoursEnd } from '@/lib/notifications/quiet-hours'
import {
    buildAthleteJoinedCopy,
    buildCheckinReceivedCopy,
    buildCoachMessageCopy,
    buildOnboardingCompletedCopy,
} from '@/lib/notifications/coach-copy'

export type CoachNotificationChannel = 'tasks' | 'reviews' | 'messages'
/** Pestañas de la campana: los canales con push y «Sistema» (solo campana). */
export type CoachNotificationCategory = CoachNotificationChannel | 'system'

export interface CoachNotificationPreferences {
    tasks_enabled: boolean
    reviews_enabled: boolean
    messages_enabled: boolean
    /** HH:MM — hora local del recordatorio del día anterior */
    day_before_time: string
    /** HH:MM — hora local del recordatorio del mismo día */
    same_day_time: string
    /** Resumen diario por email */
    digest_enabled: boolean
    /** HH:MM — hora local del resumen diario (y del semanal, los lunes) */
    digest_time: string
    /** Resumen semanal por email los lunes */
    weekly_digest_enabled: boolean
    /** Horas de silencio: el push espera a que terminen (desactivadas por defecto) */
    quiet_hours_enabled: boolean
    quiet_start: string
    quiet_end: string
}

export const DEFAULT_COACH_NOTIFICATION_PREFERENCES: CoachNotificationPreferences = {
    tasks_enabled: true,
    reviews_enabled: true,
    messages_enabled: true,
    day_before_time: '20:00',
    same_day_time: '09:00',
    digest_enabled: true,
    digest_time: '08:30',
    weekly_digest_enabled: true,
    quiet_hours_enabled: false,
    quiet_start: '22:00',
    quiet_end: '08:00',
}

/** Normaliza un time de Postgres ('20:00:00') a 'HH:MM'. */
export function normalizeTime(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const match = value.match(/^(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : fallback
}

export async function getCoachNotificationPreferences(
    coachId: string
): Promise<CoachNotificationPreferences> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coach_notification_preferences')
        .select('*')
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) {
        return DEFAULT_COACH_NOTIFICATION_PREFERENCES
    }

    return {
        tasks_enabled: data.tasks_enabled ?? true,
        reviews_enabled: data.reviews_enabled ?? true,
        messages_enabled: data.messages_enabled ?? true,
        day_before_time: normalizeTime(data.day_before_time, '20:00'),
        same_day_time: normalizeTime(data.same_day_time, '09:00'),
        digest_enabled: data.digest_enabled ?? true,
        digest_time: normalizeTime(data.digest_time, '08:30'),
        weekly_digest_enabled: data.weekly_digest_enabled ?? true,
        quiet_hours_enabled: data.quiet_hours_enabled ?? false,
        quiet_start: normalizeTime(data.quiet_start, '22:00'),
        quiet_end: normalizeTime(data.quiet_end, '08:00'),
    }
}

/** Zona horaria del coach (coaches.timezone) o la de Madrid. */
async function getCoachTimezone(coachId: string): Promise<string> {
    const admin = createAdminClient()
    const { data } = await admin.from('coaches').select('timezone').eq('id', coachId).maybeSingle()
    const tz = data?.timezone as string | null | undefined
    return isValidTimezone(tz) ? tz! : 'Europe/Madrid'
}

/** Si el aviso anterior del mismo tema fue hace menos de esto, el push no vuelve a sonar. */
const QUIET_REGROUP_MS = 2 * 60 * 1000

type InboxResult = { id: string; previousUpdatedAt: string | null } | null

/**
 * Guarda el aviso en la campana. Con `groupKey`, si ya hay uno sin leer del
 * mismo tema lo actualiza en vez de crear otro. Nunca lanza.
 */
async function upsertCoachInbox(input: {
    coachId: string
    clientId?: string | null
    category: CoachNotificationCategory
    kind: string
    payload: PushPayload
    groupKey?: string | null
}): Promise<InboxResult> {
    try {
        const admin = createAdminClient()
        const now = new Date().toISOString()
        const content = {
            kind: input.kind,
            title: input.payload.title,
            body: input.payload.body,
            url: input.payload.url ?? null,
            updated_at: now,
        }

        const updateOpenGroup = async () => {
            if (!input.groupKey) return null
            const { data: existing } = await admin
                .from('coach_notifications')
                .select('id, updated_at')
                .eq('coach_id', input.coachId)
                .eq('group_key', input.groupKey)
                .eq('is_read', false)
                .maybeSingle()
            if (!existing) return null
            const { error } = await admin.from('coach_notifications').update(content).eq('id', existing.id)
            if (error) throw error
            return { id: existing.id as string, previousUpdatedAt: existing.updated_at as string }
        }

        const grouped = await updateOpenGroup()
        if (grouped) return grouped

        const { data, error } = await admin
            .from('coach_notifications')
            .insert({
                ...content,
                coach_id: input.coachId,
                client_id: input.clientId ?? null,
                category: input.category,
                group_key: input.groupKey ?? null,
            })
            .select('id')
            .single()

        if (error) {
            // Otro aviso del mismo tema se ha guardado a la vez: se agrupa con él.
            if (error.code === '23505') return await updateOpenGroup()
            // Migración de la campana sin aplicar: el push sigue saliendo.
            if (error.code !== '42P01' && error.code !== 'PGRST205') {
                console.warn('[notifications/coach] No se pudo guardar en la campana:', error.message)
            }
            return null
        }
        return { id: data.id as string, previousUpdatedAt: null }
    } catch (error) {
        console.warn('[notifications/coach] Error guardando en la campana:', error)
        return null
    }
}

async function countUnreadCoachNotifications(coachId: string): Promise<number | undefined> {
    const admin = createAdminClient()
    const { count, error } = await admin
        .from('coach_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_read', false)
    return error ? undefined : (count ?? undefined)
}

export interface NotifyCoachOptions {
    /** Qué aviso es, para el registro de entregas. Por defecto, la categoría. */
    kind?: string
    clientId?: string | null
    /** Agrupa con el aviso sin leer del mismo tema. */
    groupKey?: string | null
    /** false = solo campana. «system» nunca lleva push salvo que se pida. */
    push?: boolean
}

/**
 * Avisa al coach: siempre en la campana y, si tiene activado ese canal, por
 * push. Lo deja en el registro de entregas. Nunca lanza: pensado para
 * llamarse en caliente desde acciones y crons.
 */
export async function notifyCoach(
    coachId: string,
    category: CoachNotificationCategory,
    payload: PushPayload,
    options: NotifyCoachOptions = {}
): Promise<boolean> {
    const kind = options.kind ?? category
    try {
        const inbox = await upsertCoachInbox({
            coachId,
            clientId: options.clientId,
            category,
            kind,
            payload,
            groupKey: options.groupKey,
        })

        const prefs = await getCoachNotificationPreferences(coachId)
        const channelEnabled =
            category === 'tasks' ? prefs.tasks_enabled
                : category === 'reviews' ? prefs.reviews_enabled
                : category === 'messages' ? prefs.messages_enabled
                : false
        const wantsPush = options.push ?? (category !== 'system')

        if (!wantsPush || (category !== 'system' && !channelEnabled)) {
            await logDelivery({
                audience: 'coach',
                coachId,
                kind,
                status: inbox ? 'sent' : 'skipped',
                skippedReason: wantsPush ? 'channel_disabled' : 'inbox_only',
                inbox: Boolean(inbox),
            })
            return Boolean(inbox)
        }

        // Horas de silencio del coach: queda en la campana y el push sale al terminar.
        const heldUntil = prefs.quiet_hours_enabled && inbox
            ? quietHoursEnd({
                now: new Date(),
                tz: await getCoachTimezone(coachId),
                enabled: true,
                start: prefs.quiet_start,
                end: prefs.quiet_end,
            })
            : null
        if (heldUntil) {
            await logDelivery({
                audience: 'coach',
                coachId,
                kind,
                status: 'sent',
                skippedReason: 'quiet_hours',
                inbox: true,
                heldUntil: heldUntil.toISOString(),
            })
            return true
        }

        const recentlyAlerted = inbox?.previousUpdatedAt
            ? Date.now() - new Date(inbox.previousUpdatedAt).getTime() < QUIET_REGROUP_MS
            : false

        const result: PushSendResult = await sendPushToCoach(coachId, {
            ...payload,
            badge: await countUnreadCoachNotifications(coachId),
            renotify: !recentlyAlerted,
        })
        if (!result.ok && result.reason && result.reason !== 'misconfigured' && result.reason !== 'dependency_missing') {
            console.warn('[notifications/coach] Push no enviado:', result)
        }
        await logDelivery({
            audience: 'coach',
            coachId,
            kind,
            status: (result.deliveredCount ?? 0) > 0 || inbox ? 'sent' : 'failed',
            inbox: Boolean(inbox),
            push: result,
        })
        return result.ok || Boolean(inbox)
    } catch (error) {
        console.warn('[notifications/coach] Error avisando al coach (non-blocking):', error)
        return false
    }
}

/** Enlace a la ficha de un atleta en el portal del coach, en una pestaña concreta. */
export function coachClientUrl(clientId: string, tab?: 'checkins' | 'onboarding') {
    return tab ? `/coach/clients?client=${clientId}&tab=${tab}` : `/coach/clients?client=${clientId}`
}

/** Ventana en la que varias revisiones respondidas se agrupan en un solo aviso. */
const CHECKIN_GROUP_MINUTES = 30

/**
 * Aviso al coach: un atleta ha respondido su revisión. En la campana queda
 * uno por revisión; el push agrupa las de los últimos 30 minutos y sustituye
 * al anterior (mismo tag). Nunca lanza.
 */
export async function notifyCoachCheckinSubmitted(input: {
    coachId: string
    clientId: string
    checkinId: string
    aiReady: boolean
}): Promise<void> {
    try {
        const admin = createAdminClient()
        const since = new Date(Date.now() - CHECKIN_GROUP_MINUTES * 60 * 1000).toISOString()
        const { data } = await admin
            .from('checkins')
            .select('id, client_id, submitted_at, client:clients!inner(full_name, status)')
            .eq('coach_id', input.coachId)
            .eq('type', 'checkin')
            .not('submitted_at', 'is', null)
            .gte('submitted_at', since)
            .order('submitted_at', { ascending: false })

        const rows = ((data ?? []) as unknown as Array<{ id: string; client_id: string; client: { full_name: string | null; status: string } | null }>)
            .filter(row => row.client?.status === 'active')
        if (!rows.some(row => row.id === input.checkinId)) {
            const { data: client } = await admin.from('clients').select('full_name').eq('id', input.clientId).maybeSingle()
            rows.unshift({ id: input.checkinId, client_id: input.clientId, client: { full_name: client?.full_name ?? null, status: 'active' } })
        }

        const current = rows.find(row => row.id === input.checkinId)
        const single = rows.length <= 1
        const pushCopy = buildCheckinReceivedCopy(rows.map(row => row.client?.full_name), { aiReady: input.aiReady })
        const inboxCopy = buildCheckinReceivedCopy([current?.client?.full_name], { aiReady: input.aiReady })

        // La campana guarda una fila por revisión; el push resume el grupo.
        await notifyCoach(input.coachId, 'reviews', {
            ...(single ? pushCopy : inboxCopy),
            url: coachClientUrl(input.clientId, 'checkins'),
            tag: 'coach-checkins-received',
        }, { kind: 'checkin_submitted', clientId: input.clientId, groupKey: `checkin:${input.checkinId}`, push: single })

        if (!single) {
            await sendGroupedPush(input.coachId, {
                ...pushCopy,
                url: '/coach/dashboard',
                tag: 'coach-checkins-received',
            }, 'checkin_submitted')
        }
    } catch (error) {
        console.warn('[notifications/coach] Aviso de revisión respondida no enviado:', error)
    }
}

/** Push de resumen (sin fila nueva en la campana), si el coach tiene activado ese canal. */
async function sendGroupedPush(coachId: string, payload: PushPayload, kind: string) {
    const prefs = await getCoachNotificationPreferences(coachId)
    if (!prefs.reviews_enabled) return
    const heldUntil = prefs.quiet_hours_enabled
        ? quietHoursEnd({ now: new Date(), tz: await getCoachTimezone(coachId), enabled: true, start: prefs.quiet_start, end: prefs.quiet_end })
        : null
    if (heldUntil) {
        await logDelivery({ audience: 'coach', coachId, kind, status: 'sent', skippedReason: 'quiet_hours', heldUntil: heldUntil.toISOString() })
        return
    }
    const result = await sendPushToCoach(coachId, { ...payload, badge: await countUnreadCoachNotifications(coachId) })
    await logDelivery({
        audience: 'coach',
        coachId,
        kind,
        status: (result.deliveredCount ?? 0) > 0 ? 'sent' : 'failed',
        push: result,
    })
}

/** Aviso al coach: un atleta ha completado su formulario inicial. Nunca lanza. */
export async function notifyCoachOnboardingCompleted(input: { coachId: string; clientId: string }): Promise<void> {
    try {
        const admin = createAdminClient()
        const { data: client } = await admin.from('clients').select('full_name').eq('id', input.clientId).maybeSingle()
        await notifyCoach(input.coachId, 'reviews', {
            ...buildOnboardingCompletedCopy(client?.full_name),
            url: coachClientUrl(input.clientId, 'onboarding'),
            tag: `coach-onboarding-${input.clientId}`,
        }, { kind: 'onboarding_submitted', clientId: input.clientId })
    } catch (error) {
        console.warn('[notifications/coach] Aviso de onboarding no enviado:', error)
    }
}

/**
 * Aviso al coach: mensaje de un atleta. Una sola fila y un solo push por
 * conversación mientras haya mensajes sin leer («Ana · 3 mensajes nuevos»);
 * si llega otro en menos de 2 minutos, el push se actualiza sin sonar.
 */
export async function notifyCoachClientMessage(input: {
    coachId: string
    clientId: string
    preview: string
}): Promise<void> {
    try {
        const admin = createAdminClient()
        const [{ data: client }, { count }] = await Promise.all([
            admin.from('clients').select('full_name').eq('id', input.clientId).maybeSingle(),
            admin
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('coach_id', input.coachId)
                .eq('client_id', input.clientId)
                .eq('sender_role', 'client')
                .is('read_at', null),
        ])

        await notifyCoach(input.coachId, 'messages', {
            ...buildCoachMessageCopy(client?.full_name, count ?? 1, input.preview),
            url: `/coach/messages?client=${input.clientId}`,
            tag: `coach-message-${input.clientId}`,
        }, { kind: 'message', clientId: input.clientId, groupKey: `message:${input.clientId}` })
    } catch (error) {
        console.warn('[notifications/coach] Aviso de mensaje no enviado:', error)
    }
}

/** Aviso en la campana (sin push): un atleta ha entrado por primera vez en la app. */
export async function notifyCoachAthleteJoined(input: { coachId: string; clientId: string }): Promise<void> {
    try {
        const admin = createAdminClient()
        const { data: client } = await admin.from('clients').select('full_name').eq('id', input.clientId).maybeSingle()
        await notifyCoach(input.coachId, 'system', {
            ...buildAthleteJoinedCopy(client?.full_name),
            url: coachClientUrl(input.clientId),
            tag: `coach-athlete-joined-${input.clientId}`,
        }, { kind: 'athlete_joined', clientId: input.clientId, groupKey: `joined:${input.clientId}` })
    } catch (error) {
        console.warn('[notifications/coach] Aviso de atleta nuevo no enviado:', error)
    }
}

/** Marca como leídos los avisos de la campana de esos temas (p. ej. al leer el chat). Nunca lanza. */
export async function markCoachNotificationsRead(coachId: string, groupKeys: string[]): Promise<void> {
    if (groupKeys.length === 0) return
    try {
        const admin = createAdminClient()
        const { error } = await admin
            .from('coach_notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('coach_id', coachId)
            .eq('is_read', false)
            .in('group_key', groupKeys)
        if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
            console.warn('[notifications/coach] No se pudieron cerrar avisos de la campana:', error.message)
        }
    } catch (error) {
        console.warn('[notifications/coach] Error cerrando avisos de la campana:', error)
    }
}
