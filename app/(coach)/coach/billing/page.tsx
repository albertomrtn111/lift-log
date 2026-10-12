import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { ensureCurrentMonthRecords, getBillingLedger, getCoachBillingSettings, todayKeyIn } from '@/data/billing'
import BillingPageClient from '@/components/coach/billing/BillingPageClient'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
    searchParams
}: {
    searchParams: { year?: string; month?: string; view?: string }
}) {
    const { coachId } = await requireActiveCoachId()
    const { timeZone } = await getCoachBillingSettings(coachId)
    const today = todayKeyIn(timeZone)

    const requestedYear = Number(searchParams.year)
    const requestedMonth = Number(searchParams.month)
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : Number(today.slice(0, 4))
    const month = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : Number(today.slice(5, 7))

    // Solo se generan los cobros del mes en curso; el resto lo resuelve el coach
    await ensureCurrentMonthRecords(coachId)
    const ledger = await getBillingLedger(coachId, year)

    return (
        <BillingPageClient
            initialLedger={ledger}
            initialMonth={month}
            initialView={searchParams.view === 'anual' ? 'year' : 'month'}
        />
    )
}
