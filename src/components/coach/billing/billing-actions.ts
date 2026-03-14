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
