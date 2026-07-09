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
    Check,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Dumbbell,
    FileText,
    Loader2,
    Scale,
    Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
    CalendarData,
    CalendarEvent,
    CalendarEventStatus,
    CalendarTask,
    CalendarTaskPriority,
} from '@/types/coach'
import {
    completeCoachTaskAction,
    createCoachTaskAction,
    rescheduleReviewEventAction,
    snoozeCoachTaskAction,
} from '@/components/coach/calendar-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
import { getVisibleMonthDayItems } from '@/lib/calendar/month-day-items'
import { cn } from '@/lib/utils'

interface CalendarViewProps {
    coachId: string
    initialData: CalendarData
    initialYear: number
    initialMonth: number
    initialViewMode?: ViewMode
    initialWeekStart?: string
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
    pending_review: 'Revisión pendiente',
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

const TASK_PRIORITY_STYLES: Record<CalendarTaskPriority, string> = {
    normal: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    high: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
}

const GENERAL_TASK_VALUE = '__general_task__'

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
            ? 'Revisión rechazada, requiere nueva validación.'
            : event.reviewStatus === 'draft'
                ? 'Revisión en borrador, falta aprobación.'
                : 'Revisión recibida, falta revisar/aprobar.'

        return `${reviewCopy}${event.submittedAt ? ` Recibido el ${formatShortDate(event.submittedAt.split('T')[0])}.` : ''}`
    }

    return event.submittedAt
        ? `Revisión recibida y aprobada el ${formatShortDate(event.submittedAt.split('T')[0])}.`
        : 'Flujo completado.'
}

function getCompactEventLine(event: CalendarEvent) {
    if (event.status === 'missing') return `Sin respuesta · ${formatShortDate(event.date)}`
    if (event.status === 'scheduled') return `Esperado · ${formatShortDate(event.date)}`
    if (event.submittedAt) return `Recibido · ${formatShortDate(event.submittedAt.split('T')[0])}`
    return STATUS_LABELS[event.status]
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
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <span className="shrink-0">{icon}</span>
            <span className="min-w-0 truncate">{label}</span>
        </span>
    )
}

export function CalendarView({
    coachId,
    initialData,
    initialYear,
    initialMonth,
    initialViewMode = 'week',
    initialWeekStart,
}: CalendarViewProps) {
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)
    const [events, setEvents] = useState<CalendarEvent[]>(sortEvents(initialData.events))
    const [tasks, setTasks] = useState<CalendarTask[]>(initialData.tasks)
    const [tasksEnabled, setTasksEnabled] = useState(initialData.tasksEnabled)
    const [clientOptions, setClientOptions] = useState(initialData.clientOptions)
    const [loading, setLoading] = useState(false)
    const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [weekStart, setWeekStart] = useState(() =>
        initialWeekStart
            ? startOfWeek(toDateAtNoon(initialWeekStart), { weekStartsOn: 1 })
            : startOfWeek(new Date(), { weekStartsOn: 1 })
    )
    const [activeFilter, setActiveFilter] = useState<CalendarFilter>('all')
    const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
    const [taskDate, setTaskDate] = useState(() => formatDateKey(new Date()))
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDescription, setTaskDescription] = useState('')
    const [taskPriority, setTaskPriority] = useState<CalendarTaskPriority>('normal')
    const [taskClientId, setTaskClientId] = useState(GENERAL_TASK_VALUE)
    const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
    const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false)
    const [snoozeTargetTaskId, setSnoozeTargetTaskId] = useState<string | null>(null)
    const [snoozeDate, setSnoozeDate] = useState('')
    const [isSavingTask, startSavingTask] = useTransition()
    const [isCompletingTask, startCompletingTask] = useTransition()
    const [isSnoozingTask, startSnoozingTask] = useTransition()
    const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null)
    const [dragOverDate, setDragOverDate] = useState<string | null>(null)

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

    const tasksByDate = useMemo(() => {
        return tasks.reduce<Record<string, CalendarTask[]>>((grouped, task) => {
            grouped[task.date] = grouped[task.date] ? [...grouped[task.date], task] : [task]
            return grouped
        }, {})
    }, [tasks])

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

    const selectedDateEvents = selectedDate ? (filteredEventsByDate[selectedDate] || []) : []
    const selectedDateTasks = selectedDate ? (tasksByDate[selectedDate] || []) : []

    useEffect(() => {
        if (!selectedDate) return
        setTaskDate(selectedDate)
        setTaskClientId(GENERAL_TASK_VALUE)
    }, [selectedDate])

    const applyData = useCallback((data: CalendarData) => {
        setEvents(sortEvents(data.events || []))
        setTasks(data.tasks || [])
        setTasksEnabled(Boolean(data.tasksEnabled))
        setClientOptions(data.clientOptions || [])
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

    const syncUrl = useCallback((date: Date, mode: ViewMode) => {
        const searchParams = new URLSearchParams({
            view: mode,
            year: String(date.getFullYear()),
            month: String(date.getMonth()),
        })

        if (mode === 'week') {
            searchParams.set('start', formatDateKey(startOfWeek(date, { weekStartsOn: 1 })))
        }

        window.history.replaceState(null, '', `/coach/calendar?${searchParams.toString()}`)
    }, [])

    const loadMonth = useCallback(async (targetYear: number, targetMonth: number) => {
        const searchParams = new URLSearchParams({
            year: String(targetYear),
            month: String(targetMonth),
        })
        setYear(targetYear)
        setMonth(targetMonth)
        syncUrl(new Date(targetYear, targetMonth, 1), 'month')
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
        syncUrl(targetWeekStart, 'week')
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

    const resetTaskForm = useCallback(() => {
        setTaskDate(selectedDate || todayStr)
        setTaskTitle('')
        setTaskDescription('')
        setTaskPriority('normal')
        setTaskClientId(GENERAL_TASK_VALUE)
    }, [selectedDate, todayStr])

    const openTaskDialog = (date?: string) => {
        setTaskDate(date || selectedDate || todayStr)
        setTaskTitle('')
        setTaskDescription('')
        setTaskPriority('normal')
        setTaskClientId(GENERAL_TASK_VALUE)
        setIsTaskDialogOpen(true)
    }

    const createTask = () => {
        startSavingTask(async () => {
            const result = await createCoachTaskAction({
                coachId,
                date: taskDate,
                title: taskTitle,
                description: taskDescription,
                priority: taskPriority,
                clientId: taskClientId === GENERAL_TASK_VALUE ? null : taskClientId,
            })

            if (!result.success || !result.task) {
                toast.error(result.error || 'No se pudo guardar la tarea.')
                return
            }

            setTasks((current) => [...current, result.task!].sort((left, right) => {
                const dateDiff = left.date.localeCompare(right.date)
                if (dateDiff !== 0) return dateDiff
                return left.createdAt.localeCompare(right.createdAt)
            }))
            setIsTaskDialogOpen(false)
            resetTaskForm()
            toast.success('Tarea guardada en el calendario.')
        })
    }

    const completeTask = (taskId: string) => {
        setCompletingTaskId(taskId)
        startCompletingTask(async () => {
            const result = await completeCoachTaskAction(taskId, coachId)
            if (!result.success) {
                toast.error(result.error || 'No se pudo completar la tarea.')
                setCompletingTaskId(null)
                return
            }

            setTasks((current) => current.map((task) => (
                task.id === taskId
                    ? {
                        ...task,
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    }
                    : task
            )))
            setCompletingTaskId(null)
            toast.success('Tarea completada.')
        })
    }

    const openSnoozeDialog = (taskId: string) => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        setSnoozeDate(formatDateKey(tomorrow))
        setSnoozeTargetTaskId(taskId)
        setSnoozeDialogOpen(true)
    }

    const snoozeTask = () => {
        if (!snoozeTargetTaskId || !snoozeDate) return

        startSnoozingTask(async () => {
            const result = await snoozeCoachTaskAction(snoozeTargetTaskId, coachId, snoozeDate)
            if (!result.success) {
                toast.error(result.error || 'No se pudo aplazar la tarea.')
                return
            }

            setTasks((current) => current.map((task) =>
                task.id === snoozeTargetTaskId
                    ? { ...task, date: snoozeDate, updatedAt: new Date().toISOString() }
                    : task
            ))
            setSnoozeDialogOpen(false)
            setSnoozeTargetTaskId(null)
            toast.success('Tarea aplazada al ' + snoozeDate + '.')
        })
    }

    // ------------------------------------------------------------------
    // Drag & drop de revisiones programadas (solo eventos aún sin respuesta)
    // ------------------------------------------------------------------

    const isDraggableEvent = (event: CalendarEvent) => event.source === 'scheduled'

    const handleEventDragStart = (event: CalendarEvent) => (dragEvent: React.DragEvent) => {
        dragEvent.dataTransfer.setData('text/plain', event.id)
        dragEvent.dataTransfer.effectAllowed = 'move'
        setDraggedEvent(event)
    }

    const handleEventDragEnd = () => {
        setDraggedEvent(null)
        setDragOverDate(null)
    }

    const handleDayDragOver = (dateStr: string) => (dragEvent: React.DragEvent) => {
        if (!draggedEvent) return
        dragEvent.preventDefault()
        dragEvent.dataTransfer.dropEffect = 'move'
        if (dragOverDate !== dateStr) setDragOverDate(dateStr)
    }

    const handleDayDrop = (dateStr: string) => (dragEvent: React.DragEvent) => {
        dragEvent.preventDefault()
        setDragOverDate(null)
        const eventToMove = draggedEvent
        setDraggedEvent(null)
        if (!eventToMove || eventToMove.date === dateStr) return

        const previousEvents = events
        const newStatus: CalendarEventStatus = dateStr < todayStr ? 'missing' : 'scheduled'

        // Optimista: mover el evento en la UI y confirmar en servidor.
        setEvents((current) => sortEvents(current.map((item) =>
            item.id === eventToMove.id
                ? {
                    ...item,
                    date: dateStr,
                    expectedDate: dateStr,
                    status: newStatus,
                    isUrgent: newStatus === 'missing',
                }
                : item
        )))

        void (async () => {
            const result = await rescheduleReviewEventAction({
                coachId,
                clientId: eventToMove.clientId,
                newDate: dateStr,
                reviewScheduleId: eventToMove.reviewScheduleId ?? null,
                checkinId: eventToMove.checkinId ?? null,
            })

            if (!result.success) {
                setEvents(previousEvents)
                toast.error(result.error || 'No se pudo mover la revisión.')
                return
            }

            toast.success(`Revisión de ${eventToMove.clientName} movida al ${formatShortDate(dateStr)}.`)
        })()
    }

    const prefillTaskForClient = (event: CalendarEvent) => {
        setSelectedDate(event.date)
        setTaskDate(event.date)
        setTaskClientId(event.clientId)
        setIsTaskDialogOpen(true)
    }

    const receivedCount = events.filter((event) => event.source === 'submitted').length
    const panelActionCount = selectedDateEvents.filter((event) => event.status === 'missing' || event.status === 'pending_review').length
    const panelCompletedCount = selectedDateEvents.filter((event) => event.status === 'completed').length

    const isOnToday = (viewMode === 'month' && isCurrentMonth) || (viewMode === 'week' && isCurrentWeek)
    const rangeTitle = viewMode === 'month'
        ? `${MONTH_NAMES[month]} ${year}`
        : `${format(weekDays[0].date, 'd', { locale: es })} – ${format(weekDays[6].date, "d 'de' MMMM yyyy", { locale: es })}`

    const filterOptions: CalendarFilter[] = ['all', 'pending_review', 'missing', 'scheduled', 'completed']

    return (
        <div className="space-y-4">
            {/* Toolbar compacta: navegación + vista + filtros en un solo bloque */}
            <Card className="p-3 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <div className="flex items-center rounded-lg border">
                            <button
                                onClick={viewMode === 'month' ? goToPrevMonth : goToPrevWeek}
                                className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                aria-label="Anterior"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                onClick={goToToday}
                                disabled={isOnToday}
                                className={cn(
                                    'h-8 border-x px-3 text-sm font-medium transition-colors',
                                    isOnToday
                                        ? 'text-muted-foreground/60'
                                        : 'text-foreground hover:bg-muted/60'
                                )}
                            >
                                Hoy
                            </button>
                            <button
                                onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}
                                className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                aria-label="Siguiente"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <h2 className="ml-2 min-w-0 truncate text-base font-semibold capitalize sm:text-lg">
                            {rangeTitle}
                        </h2>
                        {loading && <Loader2 className="ml-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                            {[
                                { key: 'week' as ViewMode, label: 'Semana' },
                                { key: 'month' as ViewMode, label: 'Mes' },
                            ].map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => switchView(tab.key)}
                                    className={cn(
                                        'rounded-md px-3 py-1 text-sm font-medium transition-all',
                                        viewMode === tab.key
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <Button size="sm" onClick={() => openTaskDialog()} className="shrink-0">
                            <Bell className="mr-1.5 h-4 w-4" />
                            Crear tarea
                        </Button>
                    </div>

                    <div className="flex w-full items-center justify-between gap-3 border-t pt-3">
                        <ScrollArea className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 pb-0.5">
                                {filterOptions.map((filter) => (
                                    <button
                                        key={filter}
                                        onClick={() => setActiveFilter(filter)}
                                        className={cn(
                                            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                            activeFilter === filter
                                                ? 'border-primary/40 bg-primary/10 text-primary'
                                                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        {filter !== 'all' && (
                                            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_COLORS[filter])} />
                                        )}
                                        <span>{getFilterLabel(filter)}</span>
                                        <span className={cn(
                                            'tabular-nums',
                                            activeFilter === filter ? 'text-primary' : 'text-muted-foreground/70'
                                        )}>
                                            {countsByStatus[filter]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                        <span className="hidden shrink-0 text-xs text-muted-foreground lg:block">
                            {receivedCount} recibida{receivedCount !== 1 ? 's' : ''} en el rango
                        </span>
                    </div>
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
                            const dayTasks = tasksByDate[dateStr] || []
                            const hasUrgent = dayEvents.some((event) => event.status === 'missing' || event.status === 'pending_review')
                            const isToday = dateStr === todayStr
                            const {
                                visibleEvents: visibleDayEvents,
                                visibleTasks: visibleDayTasks,
                                hiddenItemCount: hiddenDayItems,
                            } = getVisibleMonthDayItems(dayEvents, dayTasks)

                            return (
                                <button
                                    key={dateStr}
                                    onClick={() => setSelectedDate(dateStr)}
                                    onDragOver={handleDayDragOver(dateStr)}
                                    onDrop={handleDayDrop(dateStr)}
                                    className={cn(
                                        'min-h-[88px] rounded-xl border p-2 text-left transition-all sm:min-h-[148px]',
                                        isToday && 'border-primary bg-primary/5',
                                        hasUrgent && !isToday && 'border-red-500/30 bg-red-500/[0.03]',
                                        !isToday && !hasUrgent && 'hover:border-primary/30 hover:bg-muted/20',
                                        draggedEvent && dragOverDate === dateStr && 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                                            {day}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {dayTasks.length > 0 && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700">
                                                    <Bell className="h-3 w-3" />
                                                    {dayTasks.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-1.5 space-y-1">
                                        {visibleDayEvents.map((event) => (
                                            <div
                                                key={event.id}
                                                draggable={isDraggableEvent(event)}
                                                onDragStart={isDraggableEvent(event) ? handleEventDragStart(event) : undefined}
                                                onDragEnd={isDraggableEvent(event) ? handleEventDragEnd : undefined}
                                                title={isDraggableEvent(event) ? 'Arrastra para mover a otro día' : undefined}
                                                className={cn(
                                                    'rounded-md border px-1.5 py-1 text-[10px] leading-tight',
                                                    STATUS_BADGE_VARIANTS[event.status],
                                                    isDraggableEvent(event) && 'cursor-grab active:cursor-grabbing',
                                                    draggedEvent?.id === event.id && 'opacity-40'
                                                )}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT_COLORS[event.status])} />
                                                    <span className="truncate font-medium">{event.clientName}</span>
                                                </div>
                                                <div className="mt-0.5 truncate text-[9px] opacity-80">
                                                    {getCompactEventLine(event)}
                                                </div>
                                            </div>
                                        ))}

                                        {visibleDayTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    'rounded-md border px-1.5 py-1 text-[10px] leading-tight',
                                                    task.status === 'completed'
                                                        ? 'border-border/70 bg-muted/30 text-muted-foreground'
                                                        : TASK_PRIORITY_STYLES[task.priority]
                                                )}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <Bell className="h-3 w-3 shrink-0" />
                                                    <span className="truncate font-medium">
                                                        {task.title}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 truncate text-[9px] opacity-80">
                                                    {task.status === 'completed' ? 'Completada' : 'Tarea del coach'}
                                                </div>
                                            </div>
                                        ))}

                                        {hiddenDayItems > 0 && (
                                            <span className="block text-[11px] text-muted-foreground">
                                                +{hiddenDayItems} más
                                            </span>
                                        )}

                                        {dayEvents.length === 0 && dayTasks.length === 0 && (
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
                <div className="grid gap-1.5 lg:grid-cols-7 xl:gap-2">
                    {weekDays.map(({ date, dateStr }) => {
                        const dayEvents = filteredEventsByDate[dateStr] || []
                        const dayTasks = tasksByDate[dateStr] || []
                        const isToday = dateStr === todayStr
                        const urgentCount = dayEvents.filter((event) => event.status === 'missing' || event.status === 'pending_review').length

                        return (
                            <Card
                                key={dateStr}
                                onDragOver={handleDayDragOver(dateStr)}
                                onDrop={handleDayDrop(dateStr)}
                                className={cn(
                                    'min-w-0 overflow-hidden',
                                    urgentCount > 0 && 'border-red-500/25',
                                    isToday && 'border-primary/30',
                                    draggedEvent && dragOverDate === dateStr && 'border-primary ring-2 ring-primary/30'
                                )}
                            >
                                <div className={cn(
                                    'border-b px-2.5 py-2.5',
                                    isToday ? 'bg-primary/5' : 'bg-muted/20',
                                    urgentCount > 0 && 'bg-red-500/[0.04]'
                                )}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {format(date, 'EEEE', { locale: es })}
                                            </p>
                                            <p className="mt-0.5 text-lg font-semibold">{format(date, 'd')}</p>
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {urgentCount > 0 && (
                                                <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-red-500/10 text-red-700 border-red-500/20">
                                                    {urgentCount} acción
                                                </Badge>
                                            )}
                                            {dayTasks.length > 0 && (
                                                <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-amber-500/10 text-amber-700 border-amber-500/20">
                                                    {dayTasks.length} tarea{dayTasks.length !== 1 ? 's' : ''}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                                        {dayEvents.length > 0
                                            ? `${dayEvents.length} item${dayEvents.length !== 1 ? 's' : ''} en el día`
                                            : dayTasks.length > 0
                                                ? `${dayTasks.length} tarea${dayTasks.length !== 1 ? 's' : ''} operativa${dayTasks.length !== 1 ? 's' : ''}`
                                                : 'Sin carga planificada'}
                                    </p>
                                </div>

                                <ScrollArea className="h-[320px]">
                                    <div className="space-y-1.5 p-1.5">
                                        {dayEvents.map((event) => (
                                            <button
                                                key={event.id}
                                                onClick={() => setSelectedDate(dateStr)}
                                                draggable={isDraggableEvent(event)}
                                                onDragStart={isDraggableEvent(event) ? handleEventDragStart(event) : undefined}
                                                onDragEnd={isDraggableEvent(event) ? handleEventDragEnd : undefined}
                                                title={isDraggableEvent(event) ? 'Arrastra para mover a otro día' : undefined}
                                                className={cn(
                                                    'w-full overflow-hidden rounded-md border p-1.5 text-left transition-all hover:border-primary/30 hover:bg-muted/20',
                                                    event.status === 'missing' && 'border-red-500/20',
                                                    event.status === 'pending_review' && 'border-amber-500/20',
                                                    isDraggableEvent(event) && 'cursor-grab active:cursor-grabbing',
                                                    draggedEvent?.id === event.id && 'opacity-40'
                                                )}
                                            >
                                                <div className="flex min-w-0 flex-col gap-1.5">
                                                    <div className="min-w-0">
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT_COLORS[event.status])} />
                                                            <p className="min-w-0 truncate text-[12px] font-semibold leading-tight">{event.clientName}</p>
                                                        </div>
                                                        <p className="mt-1 truncate text-[11px] leading-tight text-muted-foreground">
                                                            {getCompactEventLine(event)}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={cn('h-5 w-fit max-w-full shrink-0 truncate px-1.5 text-[9px]', STATUS_BADGE_VARIANTS[event.status])}
                                                    >
                                                        {STATUS_LABELS[event.status]}
                                                    </Badge>
                                                </div>

                                                <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                                                    {event.aiStatus === 'completed' && (
                                                        <MiniInfo icon={<Sparkles className="h-2.5 w-2.5" />} label="IA lista" />
                                                    )}
                                                    {event.weightKg != null && (
                                                        <MiniInfo icon={<Scale className="h-2.5 w-2.5" />} label={`${event.weightKg} kg`} />
                                                    )}
                                                    {event.trainingAdherencePct != null && (
                                                        <MiniInfo icon={<Dumbbell className="h-2.5 w-2.5" />} label={`${event.trainingAdherencePct}%`} />
                                                    )}
                                                </div>
                                            </button>
                                        ))}

                                        {dayTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    'overflow-hidden rounded-md border p-1.5',
                                                    task.status === 'completed'
                                                        ? 'border-border/70 bg-muted/20'
                                                        : task.priority === 'high'
                                                            ? 'border-red-500/20 bg-red-500/[0.03]'
                                                            : 'border-amber-500/20 bg-amber-500/[0.03]'
                                                )}
                                            >
                                                <div className="flex min-w-0 flex-col gap-1.5">
                                                    <div className="min-w-0">
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <Bell className={cn('h-3 w-3 shrink-0', task.status === 'completed' ? 'text-muted-foreground' : 'text-amber-600')} />
                                                            <p className="min-w-0 truncate text-[12px] font-semibold leading-tight">{task.title}</p>
                                                        </div>
                                                        {task.description && (
                                                            <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{task.description}</p>
                                                        )}
                                                        <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                                                            <Badge variant="outline" className={cn('h-5 max-w-full truncate px-1.5 text-[9px]', TASK_PRIORITY_STYLES[task.priority])}>
                                                                {task.priority === 'high' ? 'Alta prioridad' : 'Normal'}
                                                            </Badge>
                                                            {task.clientName && (
                                                                <Badge variant="secondary" className="h-5 max-w-full truncate px-1.5 text-[9px]">
                                                                    {task.clientName}
                                                                </Badge>
                                                            )}
                                                            {task.status === 'completed' && (
                                                                <Badge variant="outline" className="h-5 max-w-full truncate px-1.5 text-[9px] bg-green-500/10 text-green-700 border-green-500/20">
                                                                    Completada
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {task.status === 'pending' && tasksEnabled && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => completeTask(task.id)}
                                                            disabled={isCompletingTask}
                                                            className="h-7 w-fit px-2 text-[11px]"
                                                        >
                                                            {isCompletingTask && completingTaskId === task.id ? (
                                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <Check className="mr-1 h-3 w-3" />
                                                            )}
                                                            Completar
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {dayEvents.length === 0 && dayTasks.length === 0 && (
                                            <div className="rounded-md border border-dashed px-2 py-4 text-center text-[11px] text-muted-foreground">
                                                Libre
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
                <div className="flex items-center gap-2">
                    <div className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-500/20">
                        <Bell className="h-2.5 w-2.5 text-amber-700" />
                    </div>
                    <span>Tareas del coach</span>
                </div>
                <span className="text-xs text-muted-foreground/70">
                    Arrastra una revisión programada o vencida a otro día para moverla.
                </span>
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
                                    {selectedDateEvents.length + selectedDateTasks.length} item{selectedDateEvents.length + selectedDateTasks.length !== 1 ? 's' : ''} del día
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
                                {selectedDateTasks.length > 0 && (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">
                                        {selectedDateTasks.length} tarea{selectedDateTasks.length !== 1 ? 's' : ''}
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
                                    helper="No recibidos + revisiones pendientes."
                                    tone={panelActionCount > 0 ? 'danger' : 'default'}
                                />
                                <SummaryCard
                                    label="Completados"
                                    value={panelCompletedCount}
                                    helper="Flows ya cerrados."
                                    tone="success"
                                />
                                <SummaryCard
                                    label="Tareas"
                                    value={selectedDateTasks.filter((task) => task.status === 'pending').length}
                                    helper="Recordatorios pendientes del coach."
                                    tone={selectedDateTasks.some((task) => task.status === 'pending') ? 'warning' : 'default'}
                                />
                            </div>

                            <section className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold">Tareas y recordatorios</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Crea tareas operativas del coach y márcalas como completadas cuando toque.
                                        </p>
                                    </div>
                                    <Button onClick={() => openTaskDialog(selectedDate || todayStr)}>
                                        <Bell className="mr-2 h-4 w-4" />
                                        Crear tarea
                                    </Button>
                                </div>

                                {selectedDateTasks.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedDateTasks.map((task) => (
                                            <div key={task.id} className="rounded-xl border p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-medium text-foreground">{task.title}</p>
                                                            <Badge variant="outline" className={cn('text-xs', TASK_PRIORITY_STYLES[task.priority])}>
                                                                {task.priority === 'high' ? 'Alta prioridad' : 'Normal'}
                                                            </Badge>
                                                            {task.clientName && (
                                                                <Badge variant="secondary" className="text-xs">
                                                                    {task.clientName}
                                                                </Badge>
                                                            )}
                                                            {task.status === 'completed' && (
                                                                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/20">
                                                                    Completada
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {task.description && (
                                                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                                                {task.description}
                                                            </p>
                                                        )}
                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                            {task.status === 'completed' && task.completedAt
                                                                ? `Completada el ${format(new Date(task.completedAt), "d MMM, HH:mm", { locale: es })}`
                                                                : `Programada para ${formatLongDate(task.date)}`}
                                                        </p>
                                                    </div>

                                                    {task.status === 'pending' && (
                                                        <div className="flex shrink-0 gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openSnoozeDialog(task.id)}
                                                                disabled={isCompletingTask || isSnoozingTask}
                                                            >
                                                                {isSnoozingTask && snoozeTargetTaskId === task.id ? (
                                                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Clock className="mr-1 h-4 w-4" />
                                                                )}
                                                                Aplazar
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => completeTask(task.id)}
                                                                disabled={isCompletingTask || isSnoozingTask}
                                                            >
                                                                {isCompletingTask && completingTaskId === task.id ? (
                                                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Check className="mr-1 h-4 w-4" />
                                                                )}
                                                                Completar
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                        Sin tareas para este día.
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
                                        <p className="text-sm text-muted-foreground">Sin revisiones reales programadas para este día.</p>
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
                                                                Ver revisión
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
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => prefillTaskForClient(event)}
                                                    >
                                                        Crear tarea
                                                    </Button>
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

            <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Crear tarea del coach</DialogTitle>
                        <DialogDescription>
                            Añade un recordatorio operativo y haz que aparezca en el calendario y en las notificaciones cuando llegue la fecha.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="task-title">Título</Label>
                            <Input
                                id="task-title"
                                value={taskTitle}
                                onChange={(event) => setTaskTitle(event.target.value)}
                                placeholder="Ej. Llamar a Carlos"
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="task-date">Fecha</Label>
                                <Input
                                    id="task-date"
                                    type="date"
                                    value={taskDate}
                                    onChange={(event) => setTaskDate(event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Prioridad</Label>
                                <Select value={taskPriority} onValueChange={(value) => setTaskPriority(value as CalendarTaskPriority)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">Alta</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Cliente asociado</Label>
                            <Select value={taskClientId} onValueChange={setTaskClientId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sin cliente asociado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={GENERAL_TASK_VALUE}>General del coach</SelectItem>
                                    {clientOptions.map((option) => (
                                        <SelectItem key={option.id} value={option.id}>
                                            {option.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="task-description">Descripción opcional</Label>
                            <Textarea
                                id="task-description"
                                value={taskDescription}
                                onChange={(event) => setTaskDescription(event.target.value)}
                                placeholder="Ej. Preguntar por la molestia de rodilla y revisar si hace falta ajustar la sesión."
                                className="min-h-[96px]"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTaskDialogOpen(false)} disabled={isSavingTask}>
                            Cancelar
                        </Button>
                        <Button onClick={createTask} disabled={isSavingTask || !taskTitle.trim() || !taskDate}>
                            {isSavingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                            Guardar tarea
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={snoozeDialogOpen} onOpenChange={(open) => { if (!open) setSnoozeDialogOpen(false) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Aplazar tarea</DialogTitle>
                        <DialogDescription>
                            Elige una nueva fecha para esta tarea. Desaparecerá del día actual y aparecerá en el nuevo día seleccionado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <Label htmlFor="snooze-date">Nueva fecha</Label>
                        <Input
                            id="snooze-date"
                            type="date"
                            value={snoozeDate}
                            onChange={(event) => setSnoozeDate(event.target.value)}
                            min={formatDateKey(new Date())}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSnoozeDialogOpen(false)} disabled={isSnoozingTask}>
                            Cancelar
                        </Button>
                        <Button onClick={snoozeTask} disabled={isSnoozingTask || !snoozeDate}>
                            {isSnoozingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                            Aplazar al {snoozeDate ? format(new Date(snoozeDate + 'T12:00:00'), "d MMM", { locale: es }) : '...'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
