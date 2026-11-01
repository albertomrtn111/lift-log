import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToCoach, type PushPayload } from '@/lib/push'
import { logDelivery } from '@/lib/notifications/delivery-log'
import { buildCheckinReceivedCopy, buildOnboardingCompletedCopy } from '@/lib/notifications/coach-copy'

export type CoachNotificationChannel = 'tasks' | 'reviews' | 'messages'

export interface CoachNotificationPreferences {
    tasks_enabled: boolean
    reviews_enabled: boolean
    messages_enabled: boolean
    /** HH:MM — hora local del recordatorio del día anterior */
    day_before_time: string
    /** HH:MM — hora local del recordatorio del mismo día */
    same_day_time: string
}

export const DEFAULT_COACH_NOTIFICATION_PREFERENCES: CoachNotificationPreferences = {
    tasks_enabled: true,
    reviews_enabled: true,
    messages_enabled: true,
    day_before_time: '20:00',
    same_day_time: '09:00',
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
        .select('tasks_enabled, reviews_enabled, messages_enabled, day_before_time, same_day_time')
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
    }
}

/**
 * Envía un push al coach si tiene activado ese canal y lo deja en el
 * registro de entregas (`kind` = qué aviso es; por defecto, el canal).
 * Nunca lanza: pensado para llamarse en caliente desde acciones y crons.
 */
export async function notifyCoach(
    coachId: string,
    channel: CoachNotificationChannel,
    payload: PushPayload,
    kind: string = channel
): Promise<boolean> {
    try {
        const prefs = await getCoachNotificationPreferences(coachId)
        const enabled =
            channel === 'tasks' ? prefs.tasks_enabled
                : channel === 'reviews' ? prefs.reviews_enabled
                : prefs.messages_enabled

        if (!enabled) {
            await logDelivery({ audience: 'coach', coachId, kind, status: 'skipped', skippedReason: 'channel_disabled' })
            return false
        }

        const result = await sendPushToCoach(coachId, payload)
        if (!result.ok && result.reason && result.reason !== 'misconfigured' && result.reason !== 'dependency_missing') {
            console.warn('[notifications/coach] Push no enviado:', result)
        }
        await logDelivery({
            audience: 'coach',
            coachId,
            kind,
            status: (result.deliveredCount ?? 0) > 0 ? 'sent' : 'failed',
            push: result,
        })
        return result.ok
    } catch (error) {
        console.warn('[notifications/coach] Error enviando push (non-blocking):', error)
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
 * Aviso al coach: un atleta ha respondido su revisión. Si en los últimos
 * 30 minutos han llegado más, el aviso las agrupa y sustituye al anterior
 * (mismo tag). Nunca lanza.
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

        const copy = buildCheckinReceivedCopy(rows.map(row => row.client?.full_name), { aiReady: input.aiReady })
        const single = rows.length <= 1
        await notifyCoach(input.coachId, 'reviews', {
            ...copy,
            url: single ? coachClientUrl(input.clientId, 'checkins') : '/coach/dashboard',
            tag: 'coach-checkins-received',
        }, 'checkin_submitted')
    } catch (error) {
        console.warn('[notifications/coach] Aviso de revisión respondida no enviado:', error)
    }
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
        }, 'onboarding_submitted')
    } catch (error) {
        console.warn('[notifications/coach] Aviso de onboarding no enviado:', error)
    }
}
