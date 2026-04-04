import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { generateMonthlyRecords, getBillingDashboard, getAnnualComparison, listBillingClients } from '@/data/billing'
import BillingPageClient from '@/components/coach/billing/BillingPageClient'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
    searchParams
}: {
    searchParams: { year?: string; month?: string }
}) {
    const { coachId } = await requireActiveCoachId()

    const now = new Date()
    const targetYear = searchParams.year ? parseInt(searchParams.year) : now.getFullYear()
    const targetMonth = searchParams.month ? parseInt(searchParams.month) : (now.getMonth() + 1)

    // Ensure records exist for the targeted month
    await generateMonthlyRecords(coachId, targetYear, targetMonth)

    // Pre-fetch data for the initial render
    const initialData = await getBillingDashboard(coachId, targetYear, targetMonth)
    const [annualComparison, clientOptions] = await Promise.all([
        getAnnualComparison(coachId, targetYear),
        listBillingClients(coachId),
    ])

    return (
        <div className="flex-1 space-y-6 p-4 sm:p-8 pt-6">
            <BillingPageClient
                coachId={coachId}
                initialYear={targetYear}
                initialMonth={targetMonth}
                initialData={initialData}
                annualComparison={annualComparison}
                clientOptions={clientOptions}
            />
        </div>
    )
}
