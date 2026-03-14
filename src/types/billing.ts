// Billing types — no server imports, safe to use in client components

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
