'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { addDays, endOfWeek, format, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    AlertCircle,
    Apple,
    ArrowUpRight,
    Bell,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Dumbbell,
    FileText,
    Filter,
    Loader2,
    Plus,
    Scale,
    Sparkles,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CalendarData, CalendarEvent, CalendarEventStatus, CalendarNote, CalendarNoteKind } from '@/types/coach'
import { createCalendarNoteAction, deleteCalendarNoteAction } from '@/components/coach/calendar-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CalendarViewProps {
    coachId: string
    initialData: CalendarData
    initialYear: number
    initialMonth: number
}

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type ViewMode = 'month' | 'week'
type CalendarFilter = 'all' | CalendarEventStatus

const STATUS_LABELS: Record<CalendarEventStatus, string> = {
    completed: 'Completado',
    pending_review: 'Review pendiente',
    scheduled: 'Programado',
    missing: 'No recibido',
}

const STATUS_BADGE_VARIANTS: Record<CalendarEventStatus, string> = {
    completed: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    pending_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    scheduled: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    missing: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
}

const STATUS_DOT_COLORS: Record<CalendarEventStatus, string> = {
    completed: 'bg-green-500',
    pending_review: 'bg-amber-500',
    scheduled: 'bg-blue-500',
    missing: 'bg-red-500',
}

const NOTE_KIND_LABELS: Record<CalendarNoteKind, string> = {
    note: 'Nota',
    reminder: 'Recordatorio',
    alert: 'Aviso',
}

const NOTE_KIND_STYLES: Record<CalendarNoteKind, string> = {
    note: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
    reminder: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    alert: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
}

const GENERAL_NOTE_VALUE = '__general__'

function toDateAtNoon(dateStr: string) {
    return new Date(`${dateStr}T12:00:00`)
}

function formatDateKey(date: Date) {
    return format(date, 'yyyy-MM-dd')
}

function sortEvents(events: CalendarEvent[]) {
    const statusWeight: Record<CalendarEventStatus, number> = {
        missing: 0,
        pending_review: 1,
        scheduled: 2,
        completed: 3,
    }

    return [...events].sort((left, right) => {
        const statusDiff = statusWeight[left.status] - statusWeight[right.status]
        if (statusDiff !== 0) return statusDiff
        return left.clientName.localeCompare(right.clientName, 'es')
    })
}

function formatShortDate(dateStr: string) {
    return format(toDateAtNoon(dateStr), "d MMM", { locale: es })
}

function formatLongDate(dateStr: string) {
    return format(toDateAtNoon(dateStr), "EEEE d 'de' MMMM", { locale: es })
}

function getFilterLabel(filter: CalendarFilter) {
    if (filter === 'all') return 'Todos'
    return STATUS_LABELS[filter]
}

function getEventLead(event: CalendarEvent) {
    if (event.status === 'missing') {
        return `Formulario esperado para el ${formatShortDate(event.date)} y vencido sin respuesta.`
    }

    if (event.status === 'scheduled') {
        return `Formulario enviado y pendiente de respuesta para el ${formatShortDate(event.date)}.`
    }

    if (event.status === 'pending_review') {
        const reviewCopy = event.reviewStatus === 'rejected'
            ? 'Review rechazada, requiere nueva validación.'
            : event.reviewStatus === 'draft'
                ? 'Review en borrador, falta aprobación.'
                : 'Check-in recibido, falta revisar/aprobar.'

        return `${reviewCopy}${event.submittedAt ? ` Recibido el ${formatShortDate(event.submittedAt.split('T')[0])}.` : ''}`
    }

    return event.submittedAt
        ? `Check-in recibido y review aprobada el ${formatShortDate(event.submittedAt.split('T')[0])}.`
        : 'Flujo completado.'
}

function getCompactEventLine(event: CalendarEvent) {
    if (event.status === 'missing') return `Sin respuesta · ${formatShortDate(event.date)}`
    if (event.status === 'scheduled') return `Esperado · ${formatShortDate(event.date)}`
    if (event.submittedAt) return `Recibido · ${formatShortDate(event.submittedAt.split('T')[0])}`
    return STATUS_LABELS[event.status]
}

function NoteKindIcon({ kind }: { kind: CalendarNoteKind }) {
    if (kind === 'reminder') return <Bell className="h-3.5 w-3.5" />
    if (kind === 'alert') return <AlertCircle className="h-3.5 w-3.5" />
    return <FileText className="h-3.5 w-3.5" />
}

function StatusIcon({ status }: { status: CalendarEventStatus }) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        case 'pending_review':
            return <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        case 'scheduled':
            return <CalendarDays className="h-4 w-4 text-blue-600 shrink-0" />
        case 'missing':
            return <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
    }
}

function SummaryCard({
    label,
    value,
    helper,
    tone,
}: {
    label: string
    value: number
    helper: string
    tone?: 'default' | 'warning' | 'danger' | 'success'
}) {
    return (
        <Card className={cn(
            'p-4',
            tone === 'warning' && 'border-amber-500/20 bg-amber-500/[0.04]',
            tone === 'danger' && 'border-red-500/20 bg-red-500/[0.04]',
            tone === 'success' && 'border-green-500/20 bg-green-500/[0.04]',
        )}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </Card>
    )
}

function MiniInfo({
    icon,
    label,
}: {
    icon: React.ReactNode
    label: string
}) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
            {icon}
            {label}
        </span>
    )
}

export function CalendarView({ coachId, initialData, initialYear, initialMonth }: CalendarViewProps) {
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)
    const [events, setEvents] = useState<CalendarEvent[]>(sortEvents(initialData.events))
    const [notes, setNotes] = useState<CalendarNote[]>(initialData.notes)
    const [notesEnabled, setNotesEnabled] = useState(initialData.notesEnabled)
    const [loading, setLoading] = useState(false)
    const [viewMode, setViewMode] = useState<ViewMode>('month')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
    const [activeFilter, setActiveFilter] = useState<CalendarFilter>('all')
    const [noteKind, setNoteKind] = useState<CalendarNoteKind>('note')
    const [noteContent, setNoteContent] = useState('')
    const [noteClientId, setNoteClientId] = useState(GENERAL_NOTE_VALUE)
    const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
    const [isSavingNote, startSavingNote] = useTransition()
    const [isDeletingNote, startDeletingNote] = useTransition()

    const now = new Date()
    const todayStr = formatDateKey(now)
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let startDay = firstDayOfMonth.getDay() - 1
    if (startDay < 0) startDay = 6

    const calendarDays: Array<number | null> = []
    for (let i = 0; i < startDay; i += 1) calendarDays.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) calendarDays.push(day)

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }).map((_, index) => {
            const date = addDays(weekStart, index)
            return {
                date,
                dateStr: formatDateKey(date),
            }
        })
    }, [weekStart])

    const isCurrentWeek = todayStr >= weekDays[0].dateStr && todayStr <= weekDays[6].dateStr

    const allEventsByDate = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {}
        events.forEach((event) => {
            grouped[event.date] = grouped[event.date] ? [...grouped[event.date], event] : [event]
        })
        Object.keys(grouped).forEach((date) => {
            grouped[date] = sortEvents(grouped[date])
        })
        return grouped
    }, [events])

    const notesByDate = useMemo(() => {
        return notes.reduce<Record<string, CalendarNote[]>>((grouped, note) => {
            grouped[note.date] = grouped[note.date] ? [...grouped[note.date], note] : [note]
            return grouped
        }, {})
    }, [notes])

    const filteredEvents = useMemo(() => {
        if (activeFilter === 'all') return events
        return events.filter((event) => event.status === activeFilter)
    }, [activeFilter, events])

    const filteredEventsByDate = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {}
        filteredEvents.forEach((event) => {
            grouped[event.date] = grouped[event.date] ? [...grouped[event.date], event] : [event]
        })
        Object.keys(grouped).forEach((date) => {
            grouped[date] = sortEvents(grouped[date])
        })
        return grouped
    }, [filteredEvents])

    const countsByStatus = useMemo(() => {
        return events.reduce<Record<CalendarFilter, number>>((counts, event) => {
            counts.all += 1
            counts[event.status] += 1
            return counts
        }, {
            all: 0,
            completed: 0,
            pending_review: 0,
            scheduled: 0,
            missing: 0,
        })
    }, [events])

    const selectedDateEvents = selectedDate ? (allEventsByDate[selectedDate] || []) : []
    const selectedDateNotes = selectedDate ? (notesByDate[selectedDate] || []) : []
    const selectedDateClientOptions = selectedDateEvents.map((event) => ({
        id: event.clientId,
        name: event.clientName,
    })).filter((option, index, array) => array.findIndex((candidate) => candidate.id === option.id) === index)

    useEffect(() => {
        setNoteKind('note')
        setNoteContent('')
        setNoteClientId(GENERAL_NOTE_VALUE)
    }, [selectedDate])

    const applyData = useCallback((data: CalendarData) => {
        setEvents(sortEvents(data.events || []))
        setNotes(data.notes || [])
        setNotesEnabled(Boolean(data.notesEnabled))
    }, [])

    const fetchData = useCallback(async (searchParams: URLSearchParams) => {
        setLoading(true)
        try {
            const response = await fetch(`/api/calendar-events?${searchParams.toString()}`)
            if (!response.ok) throw new Error('No se pudo cargar el calendario.')
            const payload = await response.json() as CalendarData
            applyData(payload)
        } catch {
            toast.error('No se pudo actualizar el calendario.')
        } finally {
            setLoading(false)
        }
    }, [applyData])

    const syncUrl = useCallback((date: Date) => {
        window.history.replaceState(null, '', `/coach/calendar?year=${date.getFullYear()}&month=${date.getMonth()}`)
    }, [])

    const loadMonth = useCallback(async (targetYear: number, targetMonth: number) => {
        const searchParams = new URLSearchParams({
            year: String(targetYear),
            month: String(targetMonth),
        })
        setYear(targetYear)
        setMonth(targetMonth)
        syncUrl(new Date(targetYear, targetMonth, 1))
        await fetchData(searchParams)
    }, [fetchData, syncUrl])

    const loadWeek = useCallback(async (targetWeekStart: Date) => {
        const targetWeekEnd = endOfWeek(targetWeekStart, { weekStartsOn: 1 })
        const searchParams = new URLSearchParams({
            start: formatDateKey(targetWeekStart),
            end: formatDateKey(targetWeekEnd),
        })
        setWeekStart(targetWeekStart)
        setYear(targetWeekStart.getFullYear())
        setMonth(targetWeekStart.getMonth())
        syncUrl(targetWeekStart)
        await fetchData(searchParams)
    }, [fetchData, syncUrl])

    const goToPrevMonth = () => {
        let targetMonth = month - 1
        let targetYear = year
        if (targetMonth < 0) {
            targetMonth = 11
            targetYear -= 1
        }
        void loadMonth(targetYear, targetMonth)
    }

    const goToNextMonth = () => {
        let targetMonth = month + 1
        let targetYear = year
        if (targetMonth > 11) {
            targetMonth = 0
            targetYear += 1
        }
        void loadMonth(targetYear, targetMonth)
    }

    const goToPrevWeek = () => {
        void loadWeek(addDays(weekStart, -7))
    }

    const goToNextWeek = () => {
        void loadWeek(addDays(weekStart, 7))
    }

    const goToToday = () => {
        if (viewMode === 'week') {
            void loadWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
            return
        }

        const today = new Date()
        void loadMonth(today.getFullYear(), today.getMonth())
    }

    const switchView = (mode: ViewMode) => {
        if (mode === viewMode) return

        setViewMode(mode)
        if (mode === 'week') {
            const anchorDate = selectedDate
                ? toDateAtNoon(selectedDate)
                : isCurrentMonth
                    ? new Date()
                    : new Date(year, month, 1)
            void loadWeek(startOfWeek(anchorDate, { weekStartsOn: 1 }))
            return
        }

        void loadMonth(year, month)
    }

    const createNote = () => {
        if (!selectedDate) return

        startSavingNote(async () => {
            const result = await createCalendarNoteAction({
                coachId,
                date: selectedDate,
                kind: noteKind,
                content: noteContent,
                clientId: noteClientId === GENERAL_NOTE_VALUE ? null : noteClientId,
            })

            if (!result.success || !result.note) {
                toast.error(result.error || 'No se pudo guardar la nota.')
                return
            }

            setNotes((current) => [...current, result.note!].sort((left, right) => {
                const dateDiff = left.date.localeCompare(right.date)
                if (dateDiff !== 0) return dateDiff
                return left.createdAt.localeCompare(right.createdAt)
            }))
            setNoteContent('')
            setNoteKind('note')
            setNoteClientId(GENERAL_NOTE_VALUE)
            toast.success('Nota guardada en el calendario.')
        })
    }

    const deleteNote = (noteId: string) => {
        setDeletingNoteId(noteId)
        startDeletingNote(async () => {
            const result = await deleteCalendarNoteAction(noteId, coachId)
            if (!result.success) {
                toast.error(result.error || 'No se pudo eliminar la nota.')
                setDeletingNoteId(null)
                return
            }

            setNotes((current) => current.filter((note) => note.id !== noteId))
            setDeletingNoteId(null)
            toast.success('Nota eliminada.')
        })
    }

    const prefillNoteForClient = (event: CalendarEvent) => {
        setSelectedDate(event.date)
        setNoteClientId(event.clientId)
    }

    const receivedCount = countsByStatus.completed + countsByStatus.pending_review
    const panelActionCount = selectedDateEvents.filter((event) => event.status === 'missing' || event.status === 'pending_review').length
    const panelCompletedCount = selectedDateEvents.filter((event) => event.status === 'completed').length

    const topSummaryCards = [
        {
            label: 'Recibidos',
            value: receivedCount,
            helper: 'Check-ins que ya entraron de verdad en el rango visible.',
            tone: 'success' as const,
        },
        {
            label: 'Reviews pendientes',
            value: countsByStatus.pending_review,
            helper: 'Check-ins recibidos que aún requieren revisión o aprobación.',
            tone: 'warning' as const,
        },
        {
            label: 'Programados',
            value: countsByStatus.scheduled,
            helper: 'Formularios enviados y aún dentro de su ventana esperada.',
            tone: 'default' as const,
        },
        {
            label: 'No recibidos reales',
            value: countsByStatus.missing,
            helper: 'Solo aparecen cuando existe un formulario real vencido sin respuesta.',
            tone: 'danger' as const,
        },
    ]

    const filterOptions: CalendarFilter[] = ['all', 'pending_review', 'missing', 'scheduled', 'completed']

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {topSummaryCards.map((card) => (
                    <SummaryCard
                        key={card.label}
                        label={card.label}
                        value={card.value}
                        helper={card.helper}
                        tone={card.tone}
                    />
                ))}
            </div>

            <Card className="p-4 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center justify-between gap-3">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={viewMode === 'month' ? goToPrevMonth : goToPrevWeek}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="text-center">
                            <h2 className="text-lg font-semibold">
                                {viewMode === 'month'
                                    ? `${MONTH_NAMES[month]} ${year}`
                                    : `${format(weekDays[0].date, "d MMM", { locale: es })} - ${format(weekDays[6].date, "d MMM yyyy", { locale: es })}`
                                }
                            </h2>
                            <Button
                                variant={
                                    (viewMode === 'month' && isCurrentMonth) || (viewMode === 'week' && isCurrentWeek)
                                        ? 'ghost'
                                        : 'outline'
                                }
                                size="sm"
                                onClick={goToToday}
                                className="mt-1 text-xs"
                            >
                                {(viewMode === 'month' && isCurrentMonth) || (viewMode === 'week' && isCurrentWeek)
                                    ? 'Hoy'
                                    : viewMode === 'month'
                                        ? `Volver a ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
                                        : 'Volver a esta semana'}
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center justify-center gap-1 rounded-lg bg-muted/50 p-1 lg:justify-end">
                        {[
                            { key: 'month' as ViewMode, label: 'Mes' },
                            { key: 'week' as ViewMode, label: 'Semana' },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => switchView(tab.key)}
                                className={cn(
                                    'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                                    viewMode === tab.key
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Filter className="h-4 w-4" />
                        <span>Filtros rápidos</span>
                    </div>

                    <ScrollArea className="w-full lg:w-auto">
                        <div className="flex gap-2 pb-1">
                            {filterOptions.map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setActiveFilter(filter)}
                                    className={cn(
                                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                                        activeFilter === filter
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <span>{getFilterLabel(filter)}</span>
                                    <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-xs">
                                        {countsByStatus[filter]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </Card>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!loading && viewMode === 'month' && (
                <Card className="p-3 sm:p-4">
                    <div className="grid grid-cols-7 gap-1 border-b pb-2">
                        {DAY_NAMES.map((day) => (
                            <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-2">
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="min-h-[88px] sm:min-h-[126px]" />
                            }

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            const dayEvents = filteredEventsByDate[dateStr] || []
                            const allDayEvents = allEventsByDate[dateStr] || []
                            const dayNotes = notesByDate[dateStr] || []
                            const hasUrgent = allDayEvents.some((event) => event.status === 'missing' || event.status === 'pending_review')
                            const isToday = dateStr === todayStr

                            return (
                                <button
                                    key={dateStr}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={cn(
                                        'min-h-[88px] rounded-xl border p-2 text-left transition-all sm:min-h-[126px]',
                                        isToday && 'border-primary bg-primary/5',
                                        hasUrgent && !isToday && 'border-red-500/30 bg-red-500/[0.03]',
                                        !isToday && !hasUrgent && 'hover:border-primary/30 hover:bg-muted/20'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                                            {day}
                                        </span>
                                        {dayNotes.length > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                <FileText className="h-3 w-3" />
                                                {dayNotes.length}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-2 space-y-1">
                                        {dayEvents.slice(0, 3).map((event) => (
                                            <div
                                                key={event.id}
                                                className={cn(
                                                    'rounded-md border px-2 py-1 text-[11px]',
                                                    STATUS_BADGE_VARIANTS[event.status]
                                                )}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_COLORS[event.status])} />
                                                    <span className="truncate font-medium">{event.clientName}</span>
                                                </div>
                                                <div className="mt-0.5 truncate text-[10px] opacity-80">
                                                    {getCompactEventLine(event)}
                                                </div>
                                            </div>
                                        ))}

                                        {dayEvents.length > 3 && (
                                            <span className="block text-[11px] text-muted-foreground">
                                                +{dayEvents.length - 3} más
                                            </span>
                                        )}

                                        {dayEvents.length === 0 && dayNotes.length > 0 && (
                                            <span className="block text-[11px] text-muted-foreground">
                                                {dayNotes.length} nota{dayNotes.length !== 1 ? 's' : ''} guardada{dayNotes.length !== 1 ? 's' : ''}
                                            </span>
                                        )}

                                        {dayEvents.length === 0 && dayNotes.length === 0 && (
                                            <span className="block text-[11px] text-muted-foreground/60">
                                                Libre
                                            </span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </Card>
            )}

            {!loading && viewMode === 'week' && (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-7">
                    {weekDays.map(({ date, dateStr }) => {
                        const dayEvents = filteredEventsByDate[dateStr] || []
                        const allDayEvents = allEventsByDate[dateStr] || []
                        const dayNotes = notesByDate[dateStr] || []
                        const isToday = dateStr === todayStr
                        const urgentCount = allDayEvents.filter((event) => event.status === 'missing' || event.status === 'pending_review').length

                        return (
                            <Card
                                key={dateStr}
                                className={cn(
                                    'overflow-hidden',
                                    urgentCount > 0 && 'border-red-500/25',
                                    isToday && 'border-primary/30'
                                )}
                            >
                                <div className={cn(
                                    'border-b px-4 py-3',
                                    isToday ? 'bg-primary/5' : 'bg-muted/20',
                                    urgentCount > 0 && 'bg-red-500/[0.04]'
                                )}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {format(date, 'EEEE', { locale: es })}
                                            </p>
                                            <p className="mt-1 text-xl font-semibold">{format(date, 'd')}</p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {urgentCount > 0 && (
                                                <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">
                                                    {urgentCount} acción
                                                </Badge>
                                            )}
                                            {dayNotes.length > 0 && (
                                                <Badge variant="outline" className="bg-muted/70">
                                                    {dayNotes.length} nota{dayNotes.length !== 1 ? 's' : ''}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {allDayEvents.length > 0
                                            ? `${allDayEvents.length} item${allDayEvents.length !== 1 ? 's' : ''} en el día`
                                            : dayNotes.length > 0
                                                ? 'Día sin check-ins, con contexto guardado'
                                                : 'Sin carga planificada'}
                                    </p>
                                </div>

                                <ScrollArea className="h-[320px]">
                                    <div className="space-y-2 p-3">
                                        {dayEvents.map((event) => (
                                            <button
                                                key={event.id}
                                                onClick={() => setSelectedDate(dateStr)}
                                                className={cn(
                                                    'w-full rounded-lg border p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/20',
                                                    event.status === 'missing' && 'border-red-500/20',
                                                    event.status === 'pending_review' && 'border-amber-500/20'
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_COLORS[event.status])} />
                                                            <p className="truncate font-medium">{event.clientName}</p>
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {getCompactEventLine(event)}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn('shrink-0 text-[10px]', STATUS_BADGE_VARIANTS[event.status])}
                                                    >
                                                        {STATUS_LABELS[event.status]}
                                                    </Badge>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {event.aiStatus === 'completed' && (
                                                        <MiniInfo icon={<Sparkles className="h-3 w-3" />} label="IA lista" />
                                                    )}
                                                    {event.weightKg != null && (
                                                        <MiniInfo icon={<Scale className="h-3 w-3" />} label={`${event.weightKg} kg`} />
                                                    )}
                                                    {event.trainingAdherencePct != null && (
                                                        <MiniInfo icon={<Dumbbell className="h-3 w-3" />} label={`${event.trainingAdherencePct}%`} />
                                                    )}
                                                </div>
                                            </button>
                                        ))}

                                        {dayEvents.length === 0 && dayNotes.length === 0 && (
                                            <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                                                Libre. Sin check-ins ni incidencias reales.
                                            </div>
                                        )}

                                        {dayEvents.length === 0 && dayNotes.length > 0 && (
                                            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                                                Día sin check-ins. Hay notas guardadas para contexto.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </Card>
                        )
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                {(['completed', 'pending_review', 'scheduled', 'missing'] as CalendarEventStatus[]).map((status) => (
                    <div key={status} className="flex items-center gap-2">
                        <div className={cn('h-3 w-3 rounded-full', STATUS_DOT_COLORS[status])} />
                        <span>{STATUS_LABELS[status]}</span>
                    </div>
                ))}
            </div>

            <Sheet open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null) }}>
                <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-xl">
                    <div className="border-b px-6 py-5 pr-14">
                        <SheetHeader className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <SheetTitle className="capitalize">
                                        {selectedDate ? formatLongDate(selectedDate) : ''}
                                    </SheetTitle>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Vista operativa del día para revisar carga, incidencias y contexto.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">
                                    {selectedDateEvents.length} item{selectedDateEvents.length !== 1 ? 's' : ''} del día
                                </Badge>
                                {panelActionCount > 0 && (
                                    <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">
                                        {panelActionCount} requiere acción
                                    </Badge>
                                )}
                                {panelCompletedCount > 0 && (
                                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                                        {panelCompletedCount} completado{panelCompletedCount !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                                {selectedDateNotes.length > 0 && (
                                    <Badge variant="outline" className="bg-muted/70">
                                        {selectedDateNotes.length} nota{selectedDateNotes.length !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                        </SheetHeader>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="space-y-6 p-6">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <SummaryCard
                                    label="Acción"
                                    value={panelActionCount}
                                    helper="No recibidos + reviews pendientes."
                                    tone={panelActionCount > 0 ? 'danger' : 'default'}
                                />
                                <SummaryCard
                                    label="Completados"
                                    value={panelCompletedCount}
                                    helper="Flows ya cerrados."
                                    tone="success"
                                />
                                <SummaryCard
                                    label="Notas"
                                    value={selectedDateNotes.length}
                                    helper="Contexto añadido por el coach."
                                />
                            </div>

                            <section className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold">Notas y avisos</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Guarda contexto general del día o una observación vinculada a un cliente.
                                        </p>
                                    </div>
                                </div>

                                {!notesEnabled ? (
                                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                        Las notas no están disponibles todavía en este entorno. La vista del calendario sigue funcionando con normalidad.
                                    </div>
                                ) : (
                                    <div className="rounded-xl border bg-muted/20 p-4">
                                        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                                            <div className="space-y-2">
                                                <Label>Observación</Label>
                                                <Textarea
                                                    value={noteContent}
                                                    onChange={(event) => setNoteContent(event.target.value)}
                                                    placeholder="Ej. Priorizar nuevos, revisar adherencia o comentar una incidencia."
                                                    className="min-h-[96px] bg-background"
                                                />
                                            </div>

                                            <div className="space-y-4 sm:w-[220px]">
                                                <div className="space-y-2">
                                                    <Label>Tipo</Label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(['note', 'reminder', 'alert'] as CalendarNoteKind[]).map((kind) => (
                                                            <button
                                                                key={kind}
                                                                onClick={() => setNoteKind(kind)}
                                                                className={cn(
                                                                    'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors',
                                                                    noteKind === kind
                                                                        ? NOTE_KIND_STYLES[kind]
                                                                        : 'border-border bg-background text-muted-foreground'
                                                                )}
                                                            >
                                                                <NoteKindIcon kind={kind} />
                                                                {NOTE_KIND_LABELS[kind]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Cliente</Label>
                                                    <Select value={noteClientId} onValueChange={setNoteClientId}>
                                                        <SelectTrigger className="bg-background">
                                                            <SelectValue placeholder="Nota general del día" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value={GENERAL_NOTE_VALUE}>General del día</SelectItem>
                                                            {selectedDateClientOptions.map((option) => (
                                                                <SelectItem key={option.id} value={option.id}>
                                                                    {option.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <Button
                                                    onClick={createNote}
                                                    disabled={isSavingNote || !noteContent.trim() || !selectedDate}
                                                    className="w-full"
                                                >
                                                    {isSavingNote ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Plus className="h-4 w-4" />
                                                    )}
                                                    Añadir nota
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedDateNotes.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedDateNotes.map((note) => (
                                            <div key={note.id} className="rounded-xl border p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className={cn('text-xs', NOTE_KIND_STYLES[note.kind])}>
                                                                <span className="inline-flex items-center gap-1">
                                                                    <NoteKindIcon kind={note.kind} />
                                                                    {NOTE_KIND_LABELS[note.kind]}
                                                                </span>
                                                            </Badge>
                                                            {note.clientName && (
                                                                <Badge variant="secondary" className="text-xs">
                                                                    {note.clientName}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                                                            {note.content}
                                                        </p>
                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                            Actualizada el {format(new Date(note.updatedAt), "d MMM, HH:mm", { locale: es })}
                                                        </p>
                                                    </div>

                                                    {notesEnabled && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => deleteNote(note.id)}
                                                            disabled={isDeletingNote && deletingNoteId === note.id}
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                        >
                                                            {isDeletingNote && deletingNoteId === note.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                        Sin notas todavía para este día.
                                    </div>
                                )}
                            </section>

                            <Separator />

                            <section className="space-y-4">
                                <div>
                                    <h3 className="font-semibold">Clientes y eventos del día</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Estado real, contexto útil y accesos rápidos para trabajar desde el calendario.
                                    </p>
                                </div>

                                {selectedDateEvents.length === 0 ? (
                                    <div className="rounded-xl border border-dashed py-12 text-center">
                                        <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                                        <p className="text-sm text-muted-foreground">Sin check-ins reales programados para este día.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {selectedDateEvents.map((event) => (
                                            <div key={event.id} className="rounded-xl border p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <StatusIcon status={event.status} />
                                                            <p className="truncate font-semibold">{event.clientName}</p>
                                                        </div>
                                                        <p className="mt-2 text-sm text-muted-foreground">
                                                            {getEventLead(event)}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn('shrink-0', STATUS_BADGE_VARIANTS[event.status])}
                                                    >
                                                        {STATUS_LABELS[event.status]}
                                                    </Badge>
                                                </div>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {event.source === 'scheduled' && (
                                                        <MiniInfo
                                                            icon={<CalendarDays className="h-3 w-3" />}
                                                            label={`Esperado ${formatShortDate(event.date)}`}
                                                        />
                                                    )}
                                                    {event.submittedAt && (
                                                        <MiniInfo
                                                            icon={<FileText className="h-3 w-3" />}
                                                            label={`Recibido ${formatShortDate(event.submittedAt.split('T')[0])}`}
                                                        />
                                                    )}
                                                    {event.weightKg != null && (
                                                        <MiniInfo icon={<Scale className="h-3 w-3" />} label={`${event.weightKg} kg`} />
                                                    )}
                                                    {event.trainingAdherencePct != null && (
                                                        <MiniInfo icon={<Dumbbell className="h-3 w-3" />} label={`Entreno ${event.trainingAdherencePct}%`} />
                                                    )}
                                                    {event.nutritionAdherencePct != null && (
                                                        <MiniInfo icon={<Apple className="h-3 w-3" />} label={`Nutrición ${event.nutritionAdherencePct}%`} />
                                                    )}
                                                    {event.aiStatus === 'completed' && (
                                                        <MiniInfo icon={<Sparkles className="h-3 w-3" />} label="IA lista" />
                                                    )}
                                                    {event.aiStatus === 'pending' && (
                                                        <MiniInfo icon={<Clock className="h-3 w-3" />} label="IA pendiente" />
                                                    )}
                                                </div>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    {(event.status === 'completed' || event.status === 'pending_review') && (
                                                        <Button variant="outline" size="sm" asChild>
                                                            <Link href={`/coach/clients?client=${event.clientId}&tab=revisiones`}>
                                                                Ver review
                                                                <ArrowUpRight className="h-4 w-4" />
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link href={`/coach/clients?client=${event.clientId}`}>
                                                            Ir al workspace
                                                            <ArrowUpRight className="h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                    {notesEnabled && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => prefillNoteForClient(event)}
                                                        >
                                                            Añadir nota
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    </ScrollArea>
                </SheetContent>
            </Sheet>
        </div>
    )
}
