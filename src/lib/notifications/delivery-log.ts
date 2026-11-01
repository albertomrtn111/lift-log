import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { PushSendResult } from '@/lib/push'

export type DeliveryAudience = 'client' | 'coach'

export interface DeliveryRecord {
    audience: DeliveryAudience
    clientId?: string | null
    coachId?: string | null
    kind: string
    status?: 'sent' | 'skipped' | 'failed'
    skippedReason?: string | null
    inbox?: boolean
    push?: PushSendResult | null
    emailStatus?: 'sent' | 'failed' | 'skipped' | null
    dedupeKey?: string | null
    /** Push retenido por horas de silencio: cuándo debe salir. */
    heldUntil?: string | null
}

/** Error de Postgres por clave única: el candado ya lo tiene otra ejecución. */
function isUniqueViolation(error: { code?: string } | null | undefined) {
    return error?.code === '23505'
}

/** La tabla aún no existe (migración sin aplicar): el aviso no debe romperse por el registro. */
function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42P01' || error?.code === 'PGRST205' || /notification_deliveries/i.test(error?.message ?? '')
}

function toRow(record: DeliveryRecord) {
    return {
        audience: record.audience,
        client_id: record.clientId ?? null,
        coach_id: record.coachId ?? null,
        kind: record.kind,
        status: record.status ?? 'sent',
        skipped_reason: record.skippedReason ?? null,
        inbox: record.inbox ?? false,
        push_targets: record.push?.subscriptionCount ?? 0,
        push_delivered: record.push?.deliveredCount ?? 0,
        push_pruned: record.push?.prunedCount ?? 0,
        email_status: record.emailStatus ?? null,
        dedupe_key: record.dedupeKey ?? null,
        ...(record.heldUntil ? { held_until: record.heldUntil } : {}),
    }
}

/** Guarda una entrega. Nunca lanza: el registro no puede bloquear un aviso. */
export async function logDelivery(record: DeliveryRecord): Promise<void> {
    try {
        const admin = createAdminClient()
        const { error } = await admin.from('notification_deliveries').insert(toRow(record))
        if (error && !isMissingTable(error) && !isUniqueViolation(error)) {
            console.warn('[notifications] No se pudo registrar la entrega:', error.message)
        }
    } catch (error) {
        console.warn('[notifications] Error registrando la entrega:', error)
    }
}

/**
 * Reserva una entrega única (p. ej. un recordatorio) antes de enviarla.
 * Devuelve el id de la fila para completarla después, o null si ya estaba
 * reservada. Si la tabla no existe, devuelve 'untracked' para no bloquear.
 */
export async function claimDelivery(record: DeliveryRecord & { dedupeKey: string }): Promise<string | 'untracked' | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('notification_deliveries')
        .insert(toRow({ ...record, status: 'skipped', skippedReason: 'pending' }))
        .select('id')
        .single()

    if (error) {
        if (isUniqueViolation(error)) return null
        if (isMissingTable(error)) return 'untracked'
        throw new Error(`No se pudo reservar la entrega: ${error.message}`)
    }
    return data.id as string
}

/** Completa una entrega reservada con lo que pasó de verdad. */
export async function completeDelivery(id: string | 'untracked', record: DeliveryRecord): Promise<void> {
    if (id === 'untracked') return
    try {
        const admin = createAdminClient()
        const { dedupe_key: _dedupeKey, ...row } = toRow(record)
        const { error } = await admin.from('notification_deliveries').update(row).eq('id', id)
        if (error) console.warn('[notifications] No se pudo completar la entrega:', error.message)
    } catch (error) {
        console.warn('[notifications] Error completando la entrega:', error)
    }
}

/** Anota cómo fue el email de una entrega ya registrada. */
export async function setDeliveryEmailStatus(id: string | 'untracked', emailStatus: 'sent' | 'failed' | 'skipped') {
    if (id === 'untracked') return
    try {
        const admin = createAdminClient()
        const { error } = await admin.from('notification_deliveries').update({ email_status: emailStatus }).eq('id', id)
        if (error) console.warn('[notifications] No se pudo anotar el email de la entrega:', error.message)
    } catch (error) {
        console.warn('[notifications] Error anotando el email de la entrega:', error)
    }
}
