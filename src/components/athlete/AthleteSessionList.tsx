import Link from 'next/link'
import { ChevronRight, ClipboardList, FileText } from 'lucide-react'
import { ClientEmptyState } from '@/components/ui/client-empty-state'
import type { AthleteSessionSummary } from '@/data/athlete-sessions'
import { sessionDateLabel } from '@/lib/athlete/session-rules'

/** Historial de sesiones de sala del atleta. */
export function AthleteSessionList({ sessions }: { sessions: AthleteSessionSummary[] }) {
    return (
        <div className="app-mobile-page min-h-screen">
            <header className="app-mobile-header border-b border-border/60">
                <div className="px-4 pb-4 pt-4">
                    <div className="flex min-h-10 items-end pr-24">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sala</p>
                            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">Sesiones</h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="space-y-2 px-4 pb-6 pt-4">
                {sessions.length === 0 && (
                    <ClientEmptyState
                        icon={ClipboardList}
                        title="Aún no hay sesiones"
                        description="Cuando termines una sesión en la sala, aparecerá aquí con lo que hiciste."
                    />
                )}
                {sessions.map(session => (
                    <Link
                        key={session.id}
                        href={`/sesiones/${session.id}`}
                        className="flex min-h-16 items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold tracking-tight">
                                {session.name ?? (session.is_group ? 'Clase' : 'Sesión')}
                            </span>
                            <span className="block text-[13px] text-muted-foreground">
                                {[
                                    sessionDateLabel(session.session_date),
                                    `${session.exercises} ${session.exercises === 1 ? 'ejercicio' : 'ejercicios'}`,
                                ].join(' · ')}
                            </span>
                        </span>
                        {session.report_code && <FileText className="h-4 w-4 shrink-0 text-primary" aria-label="Con informe" />}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                ))}
            </div>
        </div>
    )
}
