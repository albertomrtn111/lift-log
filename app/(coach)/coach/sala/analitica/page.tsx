import { redirect } from 'next/navigation'
import { BoardView } from '@/components/coach/analytics/BoardView'
import { CoachNotificationsBell } from '@/components/coach/notifications/CoachNotificationsBell'
import { coachClock, loadAnalyticsFacts } from '@/data/analytics'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { ensureBoards, loadWidgets } from '@/lib/analytics/boards'
import { loadStart, resolveRange } from '@/lib/analytics/engine'
import { createClient } from '@/lib/supabase/server'

interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

function param(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value ?? null
}

/** Analítica de la sala: sus propios tableros, aparte de los de Online. Empieza con uno vacío. */
export default async function SalaAnalyticsPage({ searchParams }: PageProps) {
    const coachId = await getActiveCoachId()
    if (!coachId) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: enabled } = await supabase.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'studio_mode' })
    if (!enabled) redirect('/coach/dashboard')

    const query = await searchParams
    const pages = await ensureBoards(supabase, coachId, 'sala')
    const boardId = param(query.board)
    const page = pages.find(item => item.id === boardId) ?? pages.find(item => item.isHome) ?? pages[0]
    const { today } = await coachClock(supabase, coachId)
    const [widgets, facts] = await Promise.all([
        loadWidgets(supabase, page.id),
        loadAnalyticsFacts(coachId, loadStart(resolveRange(page.filters, today))),
    ])

    return (
        <div className="min-h-screen pb-24 lg:pb-6">
            <h1 className="sr-only">Analítica de la sala</h1>
            <div className="flex justify-end px-4 pt-3 lg:hidden">
                <CoachNotificationsBell />
            </div>
            <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                <BoardView
                    initialPages={pages}
                    initialPageId={page.id}
                    initialWidgets={widgets}
                    initialFacts={facts}
                    initialAthleteId={param(query.athlete)}
                    environment="sala"
                />
            </div>
        </div>
    )
}
