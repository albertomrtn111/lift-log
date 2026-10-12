'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { getBillingLedger, syncClientCurrentMonth } from '@/data/billing'
import type { BillingLedgerData, PaymentStatus } from '@/types/billing'

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

function fail(error: unknown, fallback: string): { success: false; error: string } {
    return { success: false, error: error instanceof Error ? error.message : fallback }
}

function isValidPeriod(year: number, month: number) {
    return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12
}

export async function getBillingLedgerAction(year: number): Promise<ActionResult<BillingLedgerData>> {
    try {
        const { coachId } = await requireActiveCoachId()
        if (!Number.isInteger(year) || year < 2000 || year > 2100) return { success: false, error: 'Año no válido.' }
        return { success: true, data: await getBillingLedger(coachId, year) }
    } catch (error) {
        return fail(error, 'No se pudo cargar la facturación.')
    }
}

/** Cambia el estado de un cobro. Al cobrarlo guarda método y fecha. */
export async function updatePaymentStatusAction(
    recordId: string,
    status: PaymentStatus,
    paymentMethod?: string | null,
): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
        if (status === 'paid') {
            payload.paid_at = new Date().toISOString()
            if (paymentMethod !== undefined) payload.payment_method = paymentMethod || null
        } else {
            payload.paid_at = null
            payload.payment_method = null
        }

        const { error } = await supabase
            .from('payment_records')
            .update(payload)
            .eq('id', recordId)
            .eq('coach_id', coachId)

        if (error) return { success: false, error: error.message }
        revalidatePath('/coach/billing')
        return { success: true }
    } catch (error) {
        return fail(error, 'No se pudo actualizar el cobro.')
    }
}

/** Ajusta estado, importe, nota, método o fecha de cobro de un registro */
export async function updatePaymentRecordAction(recordId: string, input: {
    status?: PaymentStatus
    amount?: number
    notes?: string | null
    paymentMethod?: string | null
    paidAt?: string | null
}): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (input.amount !== undefined) {
            if (!Number.isFinite(input.amount) || input.amount <= 0) return { success: false, error: 'El importe debe ser mayor que 0.' }
            payload.amount = Math.round(input.amount * 100) / 100
        }
        if (input.notes !== undefined) payload.notes = input.notes?.trim() || null
        if (input.paymentMethod !== undefined) payload.payment_method = input.paymentMethod?.trim() || null
        if (input.paidAt !== undefined) payload.paid_at = input.paidAt
        if (input.status !== undefined) {
            payload.status = input.status
            if (input.status === 'paid') {
                if (!payload.paid_at) payload.paid_at = new Date().toISOString()
            } else {
                payload.paid_at = null
                payload.payment_method = null
            }
        }

        const { error } = await supabase
            .from('payment_records')
            .update(payload)
            .eq('id', recordId)
            .eq('coach_id', coachId)

        if (error) return { success: false, error: error.message }
        revalidatePath('/coach/billing')
        return { success: true }
    } catch (error) {
        return fail(error, 'No se pudo guardar el cobro.')
    }
}

/** Crea el cobro de un mes concreto (manual o para un mes «sin registrar») */
export async function createPaymentRecordAction(input: {
    clientId: string
    year: number
    month: number
    amount: number
    status: PaymentStatus
    paymentMethod?: string | null
    paidAt?: string | null
    notes?: string | null
}): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        if (!isValidPeriod(input.year, input.month)) return { success: false, error: 'Periodo no válido.' }
        if (!Number.isFinite(input.amount) || input.amount <= 0) return { success: false, error: 'El importe debe ser mayor que 0.' }

        const { data: client } = await supabase
            .from('clients')
            .select('id')
            .eq('id', input.clientId)
            .eq('coach_id', coachId)
            .maybeSingle()
        if (!client) return { success: false, error: 'Atleta no encontrado.' }

        const { error } = await supabase.from('payment_records').insert({
            coach_id: coachId,
            client_id: input.clientId,
            year: input.year,
            month: input.month,
            amount: Math.round(input.amount * 100) / 100,
            status: input.status,
            payment_method: input.status === 'paid' ? input.paymentMethod?.trim() || null : null,
            paid_at: input.status === 'paid' ? (input.paidAt || new Date().toISOString()) : null,
            notes: input.notes?.trim() || null,
        })

        if (error) {
            if (error.code === '23505') return { success: false, error: 'Ese atleta ya tiene un cobro en ese mes.' }
            return { success: false, error: error.message }
        }
        revalidatePath('/coach/billing')
        return { success: true }
    } catch (error) {
        return fail(error, 'No se pudo registrar el cobro.')
    }
}

/** Marca como cobrados exactamente los registros indicados (los visibles) */
export async function markRecordsPaidAction(recordIds: string[], paymentMethod: string | null): Promise<ActionResult<{ updatedCount: number }>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const ids = [...new Set(recordIds)].filter(Boolean)
        if (ids.length === 0) return { success: true, data: { updatedCount: 0 } }

        const { data, error } = await supabase
            .from('payment_records')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_method: paymentMethod?.trim() || null,
                updated_at: new Date().toISOString(),
            })
            .in('id', ids)
            .eq('coach_id', coachId)
            .in('status', ['pending', 'overdue'])
            .select('id')

        if (error) return { success: false, error: error.message }
        revalidatePath('/coach/billing')
        return { success: true, data: { updatedCount: data?.length ?? 0 } }
    } catch (error) {
        return fail(error, 'No se pudieron marcar los cobros.')
    }
}

/**
 * Cuota y día de cobro de un atleta desde Facturación. Si el cobro del mes en
 * curso sigue pendiente se actualiza su importe; si no existía, se crea.
 */
export async function updateClientFeeAction(clientId: string, amount: number | null, paymentDay: number | null): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return { success: false, error: 'Cuota no válida.' }
        if (paymentDay !== null && (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31)) {
            return { success: false, error: 'El día de cobro debe estar entre 1 y 31.' }
        }

        const fee = amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null
        const { error } = await supabase
            .from('clients')
            .update({ payment_amount: fee, payment_day: paymentDay, updated_at: new Date().toISOString() })
            .eq('id', clientId)
            .eq('coach_id', coachId)
        if (error) return { success: false, error: error.message }

        const billing = await syncClientCurrentMonth(coachId, clientId)
        if (!billing.success) return { success: false, error: 'La cuota se guardó, pero no se pudo actualizar el cobro de este mes.' }

        revalidatePath('/coach/billing')
        revalidatePath('/coach/members')
        return { success: true }
    } catch (error) {
        return fail(error, 'No se pudo guardar la cuota.')
    }
}
