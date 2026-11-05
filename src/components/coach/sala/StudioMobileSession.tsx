'use client'

import { useMemo } from 'react'
import { Check, ChevronLeft, ChevronRight, ListChecks, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StudioGridData, StudioItem } from '@/data/studio'
import { sessionList } from '@/lib/studio/editor-rules'
import { SESSION_STATUS_LABELS, cellSummary, formatShortDate } from '@/lib/studio/grid-rules'
import { cn } from '@/lib/utils'

type GridSession = StudioGridData['sessions'][number] & { number: number | null; isToday: boolean }

/** En sala se trabaja con el móvil en la mano: una sesión cada vez, como lista de ejercicios. */
export function StudioMobileSession({
    data, sessions, sessionId, doneShown, busy, onSelect, onToggleDone, onOpenSession, onOpenItem, onNewSession, onOpenRequests, onUndo,
}: {
    data: StudioGridData
    sessions: GridSession[]
    sessionId: string | null
    doneShown: Record<string, boolean>
    busy: boolean
    onSelect: (sessionId: string) => void
    onToggleDone: (item: StudioItem) => void
    onOpenSession: (sessionId: string) => void
    onOpenItem: (itemId: string) => void
    onNewSession: () => void
    onOpenRequests: (sessionId: string) => void
    onUndo: () => void
}) {
    const index = sessions.findIndex(session => session.id === sessionId)
    const session = index >= 0 ? sessions[index] : null

    const entries = useMemo(() => {
        if (!session) return []
        return sessionList(
            data.items.filter(item => item.session_id === session.id),
            data.sections.filter(section => section.session_id === session.id)
        )
    }, [data.items, data.sections, session])

    const pending = session
        ? data.requests.filter(request => request.session_id === session.id && request.status === 'pending').length
        : 0

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <Button className="h-11 flex-1" onClick={onNewSession}>
                    <Plus className="mr-1 h-4 w-4" /> Nueva sesión
                </Button>
                <Button variant="outline" className="h-11" disabled={busy} onClick={onUndo}>
                    <Undo2 className="mr-1 h-4 w-4" /> Deshacer
                </Button>
            </div>

            {!session && <p className="py-6 text-center text-sm text-muted-foreground">Aún no tiene sesiones.</p>}

            {session && (
                <>
                    <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 shrink-0"
                            disabled={index === 0}
                            aria-label="Sesión anterior"
                            onClick={() => onSelect(sessions[index - 1].id)}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <button type="button" className="min-w-0 flex-1 py-1 text-center" onClick={() => onOpenSession(session.id)}>
                            <span className="block truncate font-semibold">
                                {session.number ? `Sesión ${session.number}` : SESSION_STATUS_LABELS[session.status as keyof typeof SESSION_STATUS_LABELS]}
                                {session.name ? ` · ${session.name}` : ''}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                                {session.isToday ? 'Hoy' : formatShortDate(session.session_date)}
                                {session.professional_id && data.professionals[session.professional_id]
                                    ? ` · ${data.professionals[session.professional_id]}`
                                    : ''}
                            </span>
                        </button>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-11 w-11 shrink-0"
                            disabled={index === sessions.length - 1}
                            aria-label="Sesión siguiente"
                            onClick={() => onSelect(sessions[index + 1].id)}
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenRequests(session.id)}
                        className={cn(
                            'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm',
                            pending > 0 ? 'bg-primary/10 font-semibold' : 'text-muted-foreground'
                        )}
                    >
                        <ListChecks className="h-4 w-4 shrink-0" />
                        {pending > 0 ? `${pending} encargo${pending > 1 ? 's' : ''} pendiente${pending > 1 ? 's' : ''}` : 'Encargos'}
                    </button>

                    {entries.length === 0 && (
                        <p className="py-4 text-center text-sm text-muted-foreground">Aún no tiene ejercicios.</p>
                    )}

                    <ol className="space-y-2">
                        {entries.map(entry => {
                            if (entry.type === 'section') {
                                return (
                                    <li key={entry.section.id} className="px-1 pt-2 text-sm font-semibold uppercase tracking-wide text-primary">
                                        {entry.section.parent_title ? `${entry.section.parent_title} › ` : ''}{entry.section.title}
                                    </li>
                                )
                            }
                            const item: StudioItem = entry.item
                            const done = doneShown[item.id] ?? item.is_done
                            const summary = cellSummary(item)
                            return (
                                <li key={item.id} className={cn('flex items-stretch gap-2 rounded-lg border p-2', done ? 'border-primary/40 bg-primary/10' : 'bg-card')}>
                                    <button type="button" className="min-h-14 min-w-0 flex-1 text-left" onClick={() => onOpenItem(item.id)}>
                                        <span className="block font-medium">{item.exercise_name}</span>
                                        <span className="block text-sm text-muted-foreground">
                                            {[summary.volume, summary.load, summary.details].filter(Boolean).join(' · ') || 'Sin valores'}
                                            {summary.nextLoad && <span className="ml-1 font-semibold text-primary">{summary.nextLoad}</span>}
                                        </span>
                                        {item.tags.length > 0 && <span className="block truncate text-sm text-muted-foreground">{item.tags.join(' · ')}</span>}
                                        {item.note && <span className="block text-sm text-muted-foreground">{item.note}</span>}
                                    </button>
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={done}
                                        aria-label={`${item.exercise_name} realizado`}
                                        disabled={busy}
                                        onClick={() => onToggleDone(item)}
                                        className={cn(
                                            'flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-lg border',
                                            done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'
                                        )}
                                    >
                                        <Check className="h-6 w-6" />
                                    </button>
                                </li>
                            )
                        })}
                    </ol>

                    <Button variant="outline" className="h-11 w-full" onClick={() => onOpenSession(session.id)}>
                        Añadir ejercicios y datos de la sesión
                    </Button>
                </>
            )}
        </div>
    )
}
