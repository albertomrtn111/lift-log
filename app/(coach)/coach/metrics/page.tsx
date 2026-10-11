import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getMetricDefinitions } from '@/data/metric-definitions'
import { MetricsPageClient } from '@/components/coach/metrics/MetricsPageClient'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'

export default async function MetricsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const initialMetrics = await getMetricDefinitions()

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            <CoachPageHeader
                eyebrow="Herramientas"
                title="Métricas"
                description="Métricas personalizadas que tus atletas rellenan en cada revisión."
            />

            <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                <MetricsPageClient initialMetrics={initialMetrics} />
            </div>
        </div>
    )
}
