import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { StudioEvaluationsBoard } from '@/components/coach/sala/StudioEvaluationsBoard'
import { getEvaluationBoard } from '@/data/evaluations'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

export default async function SalaEvaluationsPage() {
    const coachId = await getActiveCoachId()
    if (!coachId) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: enabled } = await supabase.rpc('coach_has_feature', { p_coach_id: coachId, p_feature: 'studio_mode' })
    if (!enabled) redirect('/coach/dashboard')

    const board = await getEvaluationBoard(coachId)

    return (
        <div className="min-h-screen bg-background pb-24 lg:pb-8">
            <CoachPageHeader eyebrow="Sala" title="Evaluaciones" description="Saltos, sprints, fuerza y asimetrías de tus deportistas." />
            <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
                <Link href="/coach/sala" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
                    <ChevronLeft className="h-4 w-4" /> Sala
                </Link>
                <StudioEvaluationsBoard clients={board.clients} evaluations={board.evaluations} />
            </div>
        </div>
    )
}
