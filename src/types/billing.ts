// Billing types — no server imports, safe to use in client components
import type { LedgerClient, LedgerRecord } from '@/lib/billing/ledger'

export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'waived'

export interface BillingLedgerData {
    year: number
    /** Hoy en la zona horaria del coach (YYYY-MM-DD) */
    today: string
    currency: string
    clients: LedgerClient[]
    records: LedgerRecord[]
    previousYearCollected: number
}
