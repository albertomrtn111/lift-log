import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { BoardView } from '@/components/coach/analytics/BoardView'
import { coachClock, loadAnalyticsFacts } from '@/data/analytics'
import { ensureBoards, loadWidgets } from '@/lib/analytics/boards'
import { loadStart, resolveRange } from '@/lib/analytics/engine'

interface PageProps {
    searchParams: Record<string, string | string[] | undefined>
}

function param(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value ?? null
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return null

    const pages = await ensureBoards(supabase, coachId)
    const boardId = param(searchParams.board)
    const page = pages.find(item => item.id === boardId) ?? pages.find(item => item.isHome) ?? pages[0]
    const { today } = await coachClock(supabase, coachId)
    const [widgets, facts] = await Promise.all([
        loadWidgets(supabase, page.id),
        loadAnalyticsFacts(coachId, loadStart(resolveRange(page.filters, today))),
    ])

    return (
        <div className="min-h-screen pb-24 lg:pb-6">
            <CoachPageHeader
                eyebrow="Herramientas"
                title="Analítica"
                description="Tus tableros: elige qué medir, de quién y en qué fechas, y añade o quita gráficos."
            />
            <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                <BoardView
                    initialPages={pages}
                    initialPageId={page.id}
                    initialWidgets={widgets}
                    initialFacts={facts}
                    initialAthleteId={param(searchParams.athlete)}
                />
            </div>
        </div>
    )
}
