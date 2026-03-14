import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Types
export interface PaymentRecord {
    id: string
    coach_id: string
    client_id: string
    year: number
    month: number
    amount: number
    status: 'pending' | 'paid' | 'overdue' | 'waived'
    paid_at: string | null
    payment_method: string | null
    notes: string | null
    created_at: string
    updated_at: string
    // Joined fields
    full_name?: string
    email?: string
}

export interface BillingSummary {
    totalProjected: number
    totalCollected: number
    totalPending: number
    clientCount: number
}

export interface YearTotal {
    month: number
    collected: number
    pending: number
    total: number
}

export interface BillingDashboardData {
    summary: BillingSummary
    records: PaymentRecord[]
    yearTotals: YearTotal[]
    previousYearTotal: number
}

// ----------------------------------------------------------------------------
// Core Read Operations
// ----------------------------------------------------------------------------

export async function getBillingDashboard(coachId: string, year: number, month: number): Promise<BillingDashboardData> {
    const supabase = await createClient()

    // 1. Get active clients with payment_amount
    const { data: clients, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name, email, payment_amount')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .not('payment_amount', 'is', null)

    const activeClients = clients || []
    const clientCount = activeClients.filter(c => Number(c.payment_amount) > 0).length
    
    // Total projected = sum of client amounts * 12 (for annual comparisons if needed)
    // Actually the requirement specifies totalProjected = suma de payment_amount de todos los clientes activos × 12
    const currentMonthlyProjected = activeClients.reduce((sum, c) => sum + Number(c.payment_amount || 0), 0)
    const annualProjected = currentMonthlyProjected * 12

    // 2. Get records for the selected month/year
    const { data: records, error: recordsErr } = await supabase
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

    // Current year collected
    const { data: currRecords } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('coach_id', coachId)
        .eq('year', year)
        .eq('status', 'paid')

    const currentYear = (currRecords || []).reduce((sum, r) => sum + Number(r.amount), 0)

    // Previous year collected
    const { data: prevRecords } = await supabase
        .from('payment_records')
        .select('amount')
        .eq('coach_id', coachId)
        .eq('year', year - 1)
        .eq('status', 'paid')

    const previousYear = (prevRecords || []).reduce((sum, r) => sum + Number(r.amount), 0)

    // Growth calculation
    let growth = 0
    if (previousYear > 0) {
        growth = ((currentYear - previousYear) / previousYear) * 100
    } else if (currentYear > 0) {
        growth = 100 // 100% growth if previous year was 0 and this year is > 0
    }

    return {
        currentYear,
        previousYear,
        growth: Math.round(growth * 10) / 10 // round to 1 decimal
    }
}

// ----------------------------------------------------------------------------
// Mutations & Actions
// ----------------------------------------------------------------------------

export async function generateMonthlyRecords(coachId: string, year: number, month: number) {
    const supabase = await createClient()

    // Determine the last day of the target month to filter start_date
    // (A record is generated if start_date <= last day of that month)
    // If month = 12, then year = next year, month = 0, date = 0 gets the last day of dec
    const lastDayOfMonth = new Date(year, month, 0).toISOString().split('T')[0]

    // Get active clients with configured payment
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
            year: year,
            month: month,
            amount: c.payment_amount,
            status: 'pending'
        }))

    if (recordsToInsert.length === 0) {
        return { success: true, generatedCount: 0 }
    }

    // Upsert using the unique constraint (coach_id, client_id, year, month)
    // We only insert if the record doesn't exist. ON CONFLICT DO NOTHING
    const { error: insertErr } = await supabase
        .from('payment_records')
        .upsert(recordsToInsert, { onConflict: 'coach_id,client_id,year,month', ignoreDuplicates: true })

    if (insertErr) {
        console.error('Error generating monthly records:', insertErr)
        return { success: false, error: insertErr.message }
    }

    return { success: true, generatedCount: recordsToInsert.length }
}

export async function updatePaymentStatus(recordId: string, status: 'paid' | 'pending' | 'overdue' | 'waived', paymentMethod?: string) {
    const supabase = await createClient()

    let payload: any = { status }

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
