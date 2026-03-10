'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { CalendarEvent } from '@/types/coach'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Clock,
    CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'

// ============================================================================
// CONSTANTS
// ============================================================================

interface CalendarViewProps {
    events: CalendarEvent[]
    initialYear: number
    initialMonth: number
}

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type ViewMode = 'month' | 'week'

const STATUS_COLORS: Record<CalendarEvent['status'], string> = {
    completed: 'bg-green-500',
    pending_review: 'bg-amber-500',
    upcoming: 'bg-blue-400',
    overdue: 'bg-red-500',
}

const STATUS_BADGE_VARIANTS: Record<CalendarEvent['status'], string> = {
    completed: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    pending_review: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    upcoming: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    overdue: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
}

const STATUS_LABELS: Record<CalendarEvent['status'], string> = {
    completed: 'Completado',
    pending_review: 'Review pendiente',
    upcoming: 'Programado',
    overdue: 'No recibido',
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CalendarView({ events: initialEvents, initialYear, initialMonth }: CalendarViewProps) {
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)
    const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
    const [loading, setLoading] = useState(false)
    const [viewMode, setViewMode] = useState<ViewMode>('month')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))

    const now = new Date()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Client-side month navigation (Mejora 7)
    const fetchEvents = useCallback(async (y: number, m: number) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/calendar-events?year=${y}&month=${m}`)
            if (res.ok) {
                const data = await res.json()
                setEvents(data)
            }
        } catch { /* silent */ }
        setLoading(false)
    }, [])

    const goToPrevMonth = () => {
        let newMonth = month - 1
        let newYear = year
        if (newMonth < 0) { newMonth = 11; newYear -= 1 }
        setMonth(newMonth)
        setYear(newYear)
        window.history.replaceState(null, '', `/coach/calendar?year=${newYear}&month=${newMonth}`)
        fetchEvents(newYear, newMonth)
    }

    const goToNextMonth = () => {
        let newMonth = month + 1
        let newYear = year
        if (newMonth > 11) { newMonth = 0; newYear += 1 }
        setMonth(newMonth)
        setYear(newYear)
        window.history.replaceState(null, '', `/coach/calendar?year=${newYear}&month=${newMonth}`)
        fetchEvents(newYear, newMonth)
    }

    const goToToday = () => {
        const n = new Date()
        setYear(n.getFullYear())
        setMonth(n.getMonth())
        window.history.replaceState(null, '', `/coach/calendar?year=${n.getFullYear()}&month=${n.getMonth()}`)
        fetchEvents(n.getFullYear(), n.getMonth())
        setWeekStart(startOfWeek(n, { weekStartsOn: 1 }))
    }

    const goToPrevWeek = () => setWeekStart(prev => addDays(prev, -7))
    const goToNextWeek = () => setWeekStart(prev => addDays(prev, 7))

    // Group events by date
    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {}
        events.forEach(e => {
            if (!map[e.date]) map[e.date] = []
            map[e.date].push(e)
        })
        return map
    }, [events])

    // Calendar grid
    const firstDayOfMonth = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let startDay = firstDayOfMonth.getDay() - 1
    if (startDay < 0) startDay = 6

    const calendarDays: (number | null)[] = []
    for (let i = 0; i < startDay; i++) calendarDays.push(null)
    for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d)

    // Sheet data
    const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

    // Week view data
    const weekDays = useMemo(() => {
        const days: { date: Date; dateStr: string }[] = []
        for (let i = 0; i < 7; i++) {
            const d = addDays(weekStart, i)
            days.push({ date: d, dateStr: format(d, 'yyyy-MM-dd') })
        }
        return days
    }, [weekStart])

    // Fetch events for week view when navigating
    useEffect(() => {
        if (viewMode === 'week') {
            const ws = weekDays[0].date
            const newMonth = ws.getMonth()
            const newYear = ws.getFullYear()
            if (newMonth !== month || newYear !== year) {
                setMonth(newMonth)
                setYear(newYear)
                fetchEvents(newYear, newMonth)
            }
        }
    }, [weekStart, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-4">
            {/* Navigation */}
            <Card className="p-4">
                <div className="flex items-center justify-between">
                    <Button variant="outline" size="icon" onClick={viewMode === 'month' ? goToPrevMonth : goToPrevWeek}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="text-center">
                        <h2 className="font-semibold text-lg">
                            {viewMode === 'month'
                                ? `${MONTH_NAMES[month]} ${year}`
                                : `${format(weekDays[0].date, "d MMM", { locale: es })} — ${format(weekDays[6].date, "d MMM yyyy", { locale: es })}`
                            }
                        </h2>
                        {/* Mejora 6: "Hoy" button prominent when not on current month */}
                        <Button
                            variant={isCurrentMonth ? 'ghost' : 'outline'}
                            size="sm"
                            onClick={goToToday}
                            className={cn(
                                'text-xs mt-0.5',
                                !isCurrentMonth && 'text-primary border-primary/30'
                            )}
                        >
                            {isCurrentMonth ? 'Hoy' : `← Volver a ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`}
                        </Button>
                    </div>

                    <Button variant="outline" size="icon" onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                {/* Mejora 8: View toggle */}
                <div className="flex items-center justify-center gap-1 mt-3 bg-muted/50 rounded-lg p-1 w-fit mx-auto">
                    {[
                        { key: 'month' as ViewMode, label: 'Mes' },
                        { key: 'week' as ViewMode, label: 'Semana' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => {
                                setViewMode(tab.key)
                                if (tab.key === 'week') setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
                            }}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                viewMode === tab.key
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </Card>

            {/* Loading overlay */}
            {loading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Month View */}
            {!loading && viewMode === 'month' && (
                <Card className="p-2 sm:p-4">
                    {/* Day headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {DAY_NAMES.map(day => (
                            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="aspect-square" />
                            }

                            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            const dayEvents = eventsByDate[dateStr] || []
                            const isToday = dateStr === todayStr
                            const hasOverdue = dayEvents.some(e => e.status === 'overdue')
                            const eventCount = dayEvents.length

                            // Mejora 9: Density heatmap
                            const densityBg = isToday || hasOverdue ? '' :
                                eventCount >= 3 ? 'bg-primary/15' :
                                    eventCount === 2 ? 'bg-primary/10' :
                                        eventCount === 1 ? 'bg-primary/5' : ''

                            return (
                                <div
                                    key={day}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={cn(
                                        'aspect-square p-1 rounded-lg border border-transparent transition-colors cursor-pointer hover:border-primary/30',
                                        isToday && 'bg-primary/10 border-primary',
                                        hasOverdue && !isToday && 'border-destructive',
                                        densityBg,
                                    )}
                                >
                                    <div className="h-full flex flex-col">
                                        <span className={cn(
                                            'text-sm font-medium',
                                            isToday && 'text-primary'
                                        )}>
                                            {day}
                                        </span>

                                        {dayEvents.length > 0 && (
                                            <>
                                                {/* Desktop: badges */}
                                                <div className="hidden sm:flex flex-1 overflow-hidden mt-1 flex-col gap-0.5">
                                                    {dayEvents.slice(0, 2).map(event => (
                                                        <Badge
                                                            key={event.id}
                                                            variant="outline"
                                                            className={cn(
                                                                'w-full text-[10px] truncate justify-start px-1 py-0 border',
                                                                STATUS_BADGE_VARIANTS[event.status]
                                                            )}
                                                        >
                                                            {event.clientName.split(' ')[0]}
                                                        </Badge>
                                                    ))}
                                                    {dayEvents.length > 2 && (
                                                        <span className="text-[10px] text-muted-foreground">
                                                            +{dayEvents.length - 2} más
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Mobile: dots (Mejora 4) */}
                                                <div className="flex sm:hidden flex-wrap gap-0.5 mt-1">
                                                    {dayEvents.slice(0, 4).map(event => (
                                                        <div
                                                            key={event.id}
                                                            className={cn('w-1.5 h-1.5 rounded-full', STATUS_COLORS[event.status])}
                                                        />
                                                    ))}
                                                    {dayEvents.length > 4 && (
                                                        <span className="text-[8px] text-muted-foreground leading-none">
                                                            +{dayEvents.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}

            {/* Week View (Mejora 8) */}
            {!loading && viewMode === 'week' && (
                <Card className="overflow-hidden">
                    <div className="grid grid-cols-7 border-b">
                        {weekDays.map(({ date, dateStr }) => {
                            const isToday = dateStr === todayStr
                            const dayEvents = eventsByDate[dateStr] || []
                            return (
                                <div key={dateStr} className="text-center border-r last:border-r-0">
                                    <div className={cn(
                                        'py-2 text-xs font-medium border-b',
                                        isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                                    )}>
                                        <div className="capitalize">{format(date, 'EEE', { locale: es })}</div>
                                        <div className="text-lg font-semibold">{format(date, 'd')}</div>
                                    </div>
                                    <div className="min-h-[200px] p-1.5 space-y-1">
                                        {dayEvents.length === 0 ? (
                                            <span className="text-[10px] text-muted-foreground/40 block text-center mt-4">(libre)</span>
                                        ) : (
                                            dayEvents.map(event => (
                                                <div
                                                    key={event.id}
                                                    onClick={() => setSelectedDate(dateStr)}
                                                    className={cn(
                                                        'p-1.5 rounded text-[11px] cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all',
                                                        STATUS_BADGE_VARIANTS[event.status]
                                                    )}
                                                >
                                                    <div className="font-medium truncate">{event.clientName.split(' ')[0]}</div>
                                                    <div className="text-[10px] opacity-70">{STATUS_LABELS[event.status]}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}

            {/* Legend (Mejora 5) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Completado</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>Review pendiente</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400" />
                    <span>Programado</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>No recibido</span>
                </div>
            </div>

            {/* Day Detail Sheet (Mejora 3 + 10) */}
            <Sheet open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null) }}>
                <SheetContent side="right" className="w-full sm:max-w-md">
                    <SheetHeader>
                        <SheetTitle className="capitalize">
                            {selectedDate && format(new Date(selectedDate + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                        </SheetTitle>
                    </SheetHeader>

                    <div className="mt-6 space-y-3">
                        {selectedDateEvents.length === 0 ? (
                            <div className="text-center py-12">
                                <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">Sin check-ins programados</p>
                            </div>
                        ) : (
                            selectedDateEvents.map(event => (
                                <div
                                    key={event.id}
                                    className={cn(
                                        'p-4 rounded-lg border',
                                        STATUS_BADGE_VARIANTS[event.status]
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <StatusIcon status={event.status} />
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{event.clientName}</p>
                                                <Badge
                                                    variant="outline"
                                                    className={cn('text-[10px] mt-1', STATUS_BADGE_VARIANTS[event.status])}
                                                >
                                                    {STATUS_LABELS[event.status]}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mejora 10: Quick actions */}
                                    <div className="mt-3 flex items-center gap-2">
                                        {event.status === 'completed' || event.status === 'pending_review' ? (
                                            <Button variant="outline" size="sm" className="text-xs h-7" asChild>
                                                <Link href={`/coach/clients?client=${event.clientId}&tab=revisiones`}>
                                                    Ver review →
                                                </Link>
                                            </Button>
                                        ) : null}
                                        <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                                            <Link href={`/coach/clients?client=${event.clientId}`}>
                                                Ir al workspace →
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}

// ============================================================================
// HELPERS
// ============================================================================

function StatusIcon({ status }: { status: CalendarEvent['status'] }) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        case 'pending_review':
            return <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        case 'overdue':
            return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
        case 'upcoming':
            return <CalendarDays className="h-4 w-4 text-blue-500 shrink-0" />
    }
}
