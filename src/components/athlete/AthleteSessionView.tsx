import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { AthleteSessionFeedback } from '@/components/athlete/AthleteSessionFeedback'
import { AthleteTechnique } from '@/components/athlete/AthleteTechnique'
import type { AthleteSessionDetail, AthleteSessionItem } from '@/data/athlete-sessions'
import { sessionDateLabel } from '@/lib/athlete/session-rules'
import { sessionList } from '@/lib/studio/editor-rules'
import { cellSummary } from '@/lib/studio/grid-rules'

/** Una sesión de sala hecha, tal como la ve el atleta: solo lectura. */
export function AthleteSessionView({ session }: { session: AthleteSessionDetail }) {
    const facts = [
        session.duration_min ? `${session.duration_min} min` : '',
        session.rpe !== null ? `RPE ${session.rpe}` : '',
    ].filter(Boolean).join(' · ')

    return (
        <div className="app-mobile-page min-h-screen">
            <header className="app-mobile-header border-b border-border/60">
                <div className="px-4 pb-4 pt-4">
                    <Link href="/sesiones" className="mb-1 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary">
                        <ChevronLeft className="h-4 w-4" /> Sesiones
                    </Link>
                    <div className="pr-24">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{sessionDateLabel(session.session_date)}</p>
                        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                            {session.name ?? (session.is_group ? 'Clase' : 'Sesión')}
                        </h1>
                        {facts && <p className="mt-0.5 text-[13px] text-muted-foreground">{facts}</p>}
                    </div>
                </div>
            </header>

            <div className="space-y-2 px-4 pb-6 pt-4">
                {session.report_code && (
                    <a
                        href={`/informe/${session.report_code}`}
                        className="flex min-h-12 items-center gap-2 rounded-2xl bg-primary/10 px-4 py-3 text-[15px] font-semibold text-primary"
                    >
                        <FileText className="h-4 w-4" /> Ver informe
                    </a>
                )}

                {sessionList(session.items, session.sections).map(entry => (
                    entry.type === 'section' ? (
                        <h2 key={entry.section.id} className="px-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
                            {entry.section.parent_title ? `${entry.section.parent_title} › ` : ''}{entry.section.title}
                        </h2>
                    ) : (
                        <ExerciseRow key={entry.item.id} item={entry.item} />
                    )
                ))}

                {session.items.length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground">Esta sesión no tiene ejercicios apuntados.</p>
                )}

                <div className="pt-2">
                    <AthleteSessionFeedback sessionId={session.id} feedback={session.feedback} />
                </div>
            </div>
        </div>
    )
}

function ExerciseRow({ item }: { item: AthleteSessionItem }) {
    const summary = cellSummary(item)
    return (
        <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
            <p className="text-[15px] font-semibold tracking-tight">{item.exercise_name}</p>
            <p className="text-[13px] text-muted-foreground">
                {[summary.volume, summary.load, summary.details].filter(Boolean).join(' · ') || 'Sin datos'}
            </p>
            {item.circuit.length > 0 && <p className="text-[13px] text-muted-foreground">{item.circuit.join(' · ')}</p>}
            <AthleteTechnique media={item.media} />
        </div>
    )
}
