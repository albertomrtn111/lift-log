import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PaymentRecord, BillingDashboardData, YearTotal, BillingClientOption } from '@/types/billing'

// Re-export types so existing imports from '@/data/billing' keep working
export type { PaymentRecord, BillingSummary, YearTotal, BillingDashboardData, BillingClientOption } from '@/types/billing'

// ----------------------------------------------------------------------------
// Core Read Operations
// ----------------------------------------------------------------------------

export async function getBillingDashboard(coachId: string, year: number, month: number): Promise<BillingDashboardData> {
    const supabase = await createClient()

    // 1. Get active clients with payment_amount
    const { data: clients } = await supabase
        .from('clients')
        .select('id, full_name, email, payment_amount')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .not('payment_amount', 'is', null)

    const activeClients = clients || []
    const clientCount = activeClients.filter(c => Number(c.payment_amount) > 0).length
    const currentMonthlyProjected = activeClients.reduce((sum, c) => sum + Number(c.payment_amount || 0), 0)
    const annualProjected = currentMonthlyProjected * 12

    // 2. Get records for the selected month/year
    const { data: records } = await supabase
        .from('payment_records')
        .select(`
            id, coach_id, client_id, year, month, amount, status, paid_at, payment_method, notes, created_at, updated_at,
            clients ( full_name, email )
        `)
        .eq('coach_id', coachId)
        .eq('year', year)
        .eq('month', month)

    const formattedRecords: PaymentRecord[] = (records || []).map((r: any) => ({
        ...r,
        full_name: r.clients?.full_name,
        email: r.clients?.email,
        clients: undefined
    }))

    // Calculate monthly summary
    const totalCollected = formattedRecords.filter(r => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0)
    const totalPending = formattedRecords.filter(r => r.status === 'pending' || r.status === 'overdue').reduce((sum, r) => sum + Number(r.amount), 0)

    // 3. Get all records for the selected year to build yearTotals
    const { data: yearRecords } = await supabase
        .from('payment_records')
        .select('month, amount, status')
        .eq('coach_id', coachId)
        .eq('year', year)

    const yearTotalsMap = new Map<number, YearTotal>()
    for (let m = 1; m <= 12; m++) {
        yearTotalsMap.set(m, { month: m, collected: 0, pending: 0, total: 0 })
    }

    ;(yearRecords || []).forEach(r => {
        const monthData = yearTotalsMap.get(r.month)
        if (monthData) {
            const amount = Number(r.amount)
            monthData.total += amount
            if (r.status === 'paid') monthData.collected += amount
            if (r.status === 'pending' || r.status === 'overdue') monthData.pending += amount
        }
    })

    const yearTotals = Array.from(yearTotalsMap.values())

    // 4. Get previous year total collected
    const { data: prevYearRecords } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('coach_id', coachId)
        .eq('year', year - 1)
        .eq('status', 'paid')

    const previousYearTotal = (prevYearRecords || []).reduce((sum, r) => sum + Number(r.amount), 0)

    return {
        summary: {
            totalProjected: annualProjected,
            totalCollected,
            totalPending,
            clientCount
        },
        records: formattedRecords,
        yearTotals,
        previousYearTotal
    }
}

export async function getAnnualComparison(coachId: string, year: number) {
    const supabase = await createClient()

    const { data: currRecords } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('coach_id', coachId)
        .eq('year', year)
        .eq('status', 'paid')

    const currentYear = (currRecords || []).reduce((sum, r) => sum + Number(r.amount), 0)

    const { data: prevRecords } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('coach_id', coachId)
        .eq('year', year - 1)
        .eq('status', 'paid')

    const previousYear = (prevRecords || []).reduce((sum, r) => sum + Number(r.amount), 0)

    let growth = 0
    if (previousYear > 0) {
        growth = ((currentYear - previousYear) / previousYear) * 100
    } else if (currentYear > 0) {
        growth = 100
    }

    return {
        currentYear,
        previousYear,
        growth: Math.round(growth * 10) / 10
    }
}

export async function listBillingClients(coachId: string): Promise<BillingClientOption[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, email, status, payment_amount')
        .eq('coach_id', coachId)
        .order('status', { ascending: true })
        .order('full_name', { ascending: true })

    if (error || !data) return []

    return data.map((client) => ({
        id: client.id,
        full_name: client.full_name || 'Cliente',
        email: client.email || '',
        status: client.status,
        payment_amount: client.payment_amount != null ? Number(client.payment_amount) : null,
    }))
}

// ----------------------------------------------------------------------------
// Mutations — kept here for server-only callers (page.tsx etc.)
// For client components use billing-actions.ts instead
// ----------------------------------------------------------------------------

export async function generateMonthlyRecords(coachId: string, year: number, month: number) {
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

export async function updatePaymentStatus(recordId: string, status: 'paid' | 'pending' | 'overdue' | 'waived', paymentMethod?: string) {
    const supabase = await createClient()

    const payload: Record<string, unknown> = { status }

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

export async function createManualPaymentRecord(input: {
    coachId: string
    clientId: string
    year: number
    month: number
    amount: number
    status: 'pending' | 'paid' | 'overdue' | 'waived'
    paymentMethod?: string | null
    paidAt?: string | null
    notes?: string | null
}) {
    const supabase = await createClient()

    const payload = {
        coach_id: input.coachId,
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
            return { success: false, error: 'Ya existe un registro para ese cliente y ese periodo.' }
        }
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/billing')
    return { success: true }
}

export async function markVisibleMonthRecordsPaid(input: {
    coachId: string
    year: number
    month: number
    search?: string
    statusFilter?: 'all' | 'pending' | 'overdue'
    paymentMethod?: string | null
}) {
    const supabase = await createClient()

    const normalizedSearch = input.search?.trim().toLowerCase() ?? ''
    const allowedStatuses = input.statusFilter === 'overdue'
        ? ['overdue']
        : input.statusFilter === 'pending'
            ? ['pending']
            : ['pending', 'overdue']

    const { data: records, error } = await supabase
        .from('payment_records')
        .select(`
            id,
            status,
            clients (
                full_name,
                email
            )
        `)
        .eq('coach_id', input.coachId)
        .eq('year', input.year)
        .eq('month', input.month)
        .in('status', allowedStatuses)

    if (error) {
        return { success: false, error: error.message }
    }

    const filteredIds = (records ?? [])
        .filter((record: any) => {
            if (!normalizedSearch) return true
            const fullName = (record.clients?.full_name || '').toLowerCase()
            const email = (record.clients?.email || '').toLowerCase()
            return fullName.includes(normalizedSearch) || email.includes(normalizedSearch)
        })
        .map((record: any) => record.id)

    if (filteredIds.length === 0) {
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
        .in('id', filteredIds)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    revalidatePath('/coach/billing')
    return { success: true, updatedCount: filteredIds.length }
}
