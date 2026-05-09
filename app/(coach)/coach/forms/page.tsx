import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getFormTemplates } from '@/data/form-templates'
import { getActiveClients } from '@/data/members'
import { listReviewTemplates } from '@/data/review-templates'
import { FormsPageClient } from '@/components/coach/forms/FormsPageClient'
import { ClipboardList } from 'lucide-react'
import type { MetricCategory, MetricDefinition } from '@/types/metrics'

export default async function FormsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const [templates, activeClients, reviewTemplates, metricsRes] = await Promise.all([
        getFormTemplates(),
        getActiveClients(coachId),
        listReviewTemplates(coachId),
        supabase
            .from('metric_definitions')
            .select('*')
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
    ])

    const metrics = metricsRes.data ?? []
    const metricCounts: Record<MetricCategory, number> = { body: 0, performance: 0, general: 0 }
    for (const row of metrics as { category: MetricCategory }[]) {
        if (row.category in metricCounts) metricCounts[row.category]++
    }

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <ClipboardList className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Formularios</h1>
                            <p className="text-sm text-muted-foreground">
                                Gestiona revisiones completas y formularios de onboarding
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6">
                <FormsPageClient
                    templates={templates}
                    activeClients={activeClients}
                    reviewTemplates={reviewTemplates}
                    metrics={metrics as MetricDefinition[]}
                    metricCounts={metricCounts}
                />
            </div>
        </div>
    )
}
