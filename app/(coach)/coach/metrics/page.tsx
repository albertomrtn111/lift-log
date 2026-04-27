import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getMetricDefinitions } from '@/data/metric-definitions'
import { MetricsPageClient } from '@/components/coach/metrics/MetricsPageClient'
import { BarChart2 } from 'lucide-react'

export default async function MetricsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const initialMetrics = await getMetricDefinitions()

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <BarChart2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Métricas</h1>
                            <p className="text-sm text-muted-foreground">
                                Configura las métricas personalizadas para tus clientes en la revisión.
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <MetricsPageClient initialMetrics={initialMetrics} />
            </div>
        </div>
    )
}
