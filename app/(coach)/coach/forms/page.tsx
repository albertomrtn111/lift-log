import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getFormTemplates } from '@/data/form-templates'
import { getActiveClients } from '@/data/members'
import { listReviewTemplates } from '@/data/review-templates'
import { FormsPageClient } from '@/components/coach/forms/FormsPageClient'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
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
            <CoachPageHeader
                eyebrow="Herramientas"
                title="Formularios"
                description="Revisiones periódicas y formularios de onboarding para tus atletas."
            />

            <div className="px-4 pt-4 lg:px-8 lg:pt-6">
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
