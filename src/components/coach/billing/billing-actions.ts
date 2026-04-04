'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'

export async function generateMonthlyRecordsAction(coachId: string, year: number, month: number) {
    const supabase = await createClient()

    const lastDayOfMonth = new Date(year, month, 0).toISOString().split('T')[0]

    const { data: clients, error: clientsErr } = await supabase
        .from('clients')
        .select('id, payment_amount')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .lte('start_date', lastDayOfMonth)
        .not('payment_amount', 'is', null)

    if (clientsErr || !clients || clients.length === 0) {
        return { success: true, generatedCount: 0 }
    }

    const recordsToInsert = clients
        .filter(c => Number(c.payment_amount) > 0)
        .map(c => ({
            coach_id: coachId,
            client_id: c.id,
            year,
            month,
            amount: c.payment_amount,
            status: 'pending'
        }))

    if (recordsToInsert.length === 0) {
        return { success: true, generatedCount: 0 }
    }

    const { error: insertErr } = await supabase
        .from('payment_records')
        .upsert(recordsToInsert, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })

    if (insertErr) {
        console.error('Error generating monthly records:', insertErr)
        return { success: false, error: insertErr.message }
    }

    revalidatePath('/coach/billing')
    return { success: true, generatedCount: recordsToInsert.length }
}

export async function updatePaymentStatusAction(
    recordId: string,
    status: 'paid' | 'pending' | 'overdue' | 'waived',
    paymentMethod?: string
) {
    const supabase = await createClient()

    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() }

    if (status === 'paid') {
        payload.paid_at = new Date().toISOString()
        if (paymentMethod !== undefined) {
            payload.payment_method = paymentMethod
        }
    } else {
        payload.paid_at = null
        payload.payment_method = null
    }

    const { error } = await supabase
        .from('payment_records')
        .update(payload)
        .eq('id', recordId)

    if (error) {
        console.error('Error updating payment status:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/billing')
    return { success: true }
}

export async function createManualPaymentAction(input: {
    clientId: string
    year: number
    month: number
    amount: number
    status: 'pending' | 'paid' | 'overdue' | 'waived'
    paymentMethod?: string | null
    paidAt?: string | null
    notes?: string | null
}) {
    const { coachId } = await requireActiveCoachId()
    const supabase = await createClient()

    const payload = {
        coach_id: coachId,
        client_id: input.clientId,
        year: input.year,
        month: input.month,
        amount: input.amount,
        status: input.status,
        payment_method: input.status === 'paid' ? input.paymentMethod ?? null : null,
        paid_at: input.status === 'paid' ? (input.paidAt || new Date().toISOString()) : null,
        notes: input.notes ?? null,
    }

    const { error } = await supabase
        .from('payment_records')
        .insert(payload)

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un pago para ese cliente y ese periodo.' }
        }
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/billing')
    return { success: true }
}

export async function markVisibleMonthRecordsPaidAction(input: {
    year: number
    month: number
    search?: string
    statusFilter?: 'all' | 'pending' | 'overdue'
    paymentMethod?: string | null
}) {
    const { coachId } = await requireActiveCoachId()
    const supabase = await createClient()

    const normalizedSearch = input.search?.trim().toLowerCase() ?? ''
    const statuses = input.statusFilter === 'overdue'
        ? ['overdue']
        : input.statusFilter === 'pending'
            ? ['pending']
            : ['pending', 'overdue']

    const { data: records, error } = await supabase
        .from('payment_records')
        .select(`
            id,
            clients (
                full_name,
                email
            )
        `)
        .eq('coach_id', coachId)
        .eq('year', input.year)
        .eq('month', input.month)
        .in('status', statuses)

    if (error) {
        return { success: false, error: error.message }
    }

    const targetIds = (records ?? [])
        .filter((record: any) => {
            if (!normalizedSearch) return true
            const fullName = (record.clients?.full_name || '').toLowerCase()
            const email = (record.clients?.email || '').toLowerCase()
            return fullName.includes(normalizedSearch) || email.includes(normalizedSearch)
        })
        .map((record: any) => record.id)

    if (targetIds.length === 0) {
        return { success: true, updatedCount: 0 }
    }

    const { error: updateError } = await supabase
        .from('payment_records')
        .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method: input.paymentMethod ?? null,
            updated_at: new Date().toISOString(),
        })
        .in('id', targetIds)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    revalidatePath('/coach/billing')
    return { success: true, updatedCount: targetIds.length }
}
