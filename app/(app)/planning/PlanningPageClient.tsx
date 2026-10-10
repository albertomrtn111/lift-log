'use client'

import { useState, useTransition, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarX2, ChevronLeft, ChevronRight, Loader2, Moon } from 'lucide-react'
import {
    CalendarItem,
    getClientWeeklySchedule,
    saveCardioSessionLog
} from '@/data/client-schedule'
import { WeeklySummary } from '@/components/planning/WeeklySummary'
import { PlanningDayCard } from '@/components/planning/PlanningDayCard'
import { PlanMonthGrid, PlanWeekStrip } from '@/components/planning/PlanCalendar'
import { CardioSessionDetail } from '@/components/planning/CardioSessionDetail'
import { parseDateStr, toLocalDateStr } from '@/components/planning/plan-visuals'
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, isSameWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { STRAVA_ACTIVITY_COMPLETED_EVENT, type StravaActivityCompletedDetail } from '@/lib/strava/events'

interface PlanningPageClientProps {
    initialItems: CalendarItem[]
    clientId: string
    initialDate: string
}

type ViewMode = 'week' | 'month'

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
]

const SWIPE_MIN_DISTANCE = 60

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}

function dayHeading(dateStr: string, today: string) {
    const date = parseDateStr(dateStr)
    if (dateStr === today) return 'Hoy'
    if (dateStr === toLocalDateStr(addDays(parseDateStr(today), 1))) return 'Mañana'
    if (dateStr === toLocalDateStr(addDays(parseDateStr(today), -1))) return 'Ayer'
    return capitalize(format(date, 'EEEE', { locale: es }))
}

export default function PlanningPageClient({
    initialItems,
    clientId,
    initialDate,
}: PlanningPageClientProps) {
    const router = useRouter()
    const [currentDate, setCurrentDate] = useState(() => parseDateStr(initialDate))
    const [viewMode, setViewMode] = useState<ViewMode>('week')
    const [items, setItems] = useState<CalendarItem[]>(initialItems)
    const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
    const [selectedDate, setSelectedDate] = useState(initialDate)
    // El servidor calcula "hoy" en su zona horaria; en el cliente se corrige
    const [today, setToday] = useState(initialDate)
    const [isPending, startTransition] = useTransition()
    const touchStart = useRef<{ x: number; y: number } | null>(null)

    useEffect(() => {
        setToday(toLocalDateStr(new Date()))
    }, [])

    const rangeStart = viewMode === 'week'
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate)
    const rangeEnd = viewMode === 'week'
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : endOfMonth(currentDate)

    const rangeStartStr = toLocalDateStr(rangeStart)
    const rangeEndStr = toLocalDateStr(rangeEnd)

    const rangeLabel = viewMode === 'week'
        ? rangeStart.getMonth() === rangeEnd.getMonth()
            ? `${format(rangeStart, 'd')} – ${format(rangeEnd, 'd MMM', { locale: es })}`
            : `${format(rangeStart, 'd MMM', { locale: es })} – ${format(rangeEnd, 'd MMM', { locale: es })}`
        : capitalize(format(currentDate, 'MMMM yyyy', { locale: es }))

    const todayDate = parseDateStr(today)
    const isCurrentRange = viewMode === 'week'
        ? isSameWeek(currentDate, todayDate, { weekStartsOn: 1 })
        : isSameMonth(currentDate, todayDate)
    const rangeHint = viewMode === 'week'
        ? isCurrentRange ? 'Esta semana' : 'Semana'
        : isCurrentRange ? 'Este mes' : 'Mes'

    const fetchSchedule = useCallback(() => {
        startTransition(async () => {
            const result = await getClientWeeklySchedule(clientId, rangeStartStr, rangeEndStr)
            setItems(result)
        })
    }, [clientId, rangeEndStr, rangeStartStr])

    useEffect(() => {
        fetchSchedule()
    }, [fetchSchedule])

    // Una actividad de Strava categorizada desde el diálogo global completa una
    // sesión: se recarga el rango visible para que aparezca como realizada sin
    // recargar la página. También al volver a la app desde segundo plano.
    useEffect(() => {
        const handleCompleted = (event: Event) => {
            const detail = (event as CustomEvent<StravaActivityCompletedDetail>).detail
            if (!detail?.scheduledDate || (detail.scheduledDate >= rangeStartStr && detail.scheduledDate <= rangeEndStr)) {
                fetchSchedule()
            }
        }
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchSchedule()
        }

        window.addEventListener(STRAVA_ACTIVITY_COMPLETED_EVENT, handleCompleted)
        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            window.removeEventListener(STRAVA_ACTIVITY_COMPLETED_EVENT, handleCompleted)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchSchedule, rangeEndStr, rangeStartStr])

    // Solo se pintan items del rango visible (evita mezclar datos mientras carga)
    const visibleItems = useMemo(
        () => items.filter(item => item.date >= rangeStartStr && item.date <= rangeEndStr),
        [items, rangeEndStr, rangeStartStr]
    )

    const itemsByDate = useMemo(() => {
        const map = new Map<string, CalendarItem[]>()
        for (const item of visibleItems) {
            const list = map.get(item.date) ?? []
            list.push(item)
            map.set(item.date, list)
        }
        return map
    }, [visibleItems])

    const hasSessions = visibleItems.some(item => item.kind !== 'rest')
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => toLocalDateStr(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), index))),
        [currentDate]
    )

    // ----- Navegación -----

    const moveTo = (nextDate: Date, mode: ViewMode = viewMode) => {
        setCurrentDate(nextDate)
        const start = mode === 'week' ? startOfWeek(nextDate, { weekStartsOn: 1 }) : startOfMonth(nextDate)
        const end = mode === 'week' ? endOfWeek(nextDate, { weekStartsOn: 1 }) : endOfMonth(nextDate)
        const startStr = toLocalDateStr(start)
        const endStr = toLocalDateStr(end)
        setSelectedDate(today >= startStr && today <= endStr ? today : startStr)
    }

    const handlePrevious = () => {
        moveTo(viewMode === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1))
    }

    const handleNext = () => {
        moveTo(viewMode === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1))
    }

    const handleToday = () => {
        moveTo(parseDateStr(today))
    }

    const handleViewChange = (mode: ViewMode) => {
        if (mode === viewMode) return
        setViewMode(mode)
        // Se mantiene el día seleccionado como referencia al cambiar de vista
        const reference = parseDateStr(selectedDate)
        setCurrentDate(reference)
    }

    const handleSelectDay = (dateStr: string) => {
        setSelectedDate(dateStr)
        if (viewMode === 'week') {
            document.getElementById(`plan-day-${dateStr}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }

    const handleTouchStart = (event: React.TouchEvent) => {
        const touch = event.touches[0]
        touchStart.current = { x: touch.clientX, y: touch.clientY }
    }

    const handleTouchEnd = (event: React.TouchEvent) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start || selectedItem) return
        const touch = event.changedTouches[0]
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return
        if (dx < 0) handleNext()
        else handlePrevious()
    }

    // ----- Acciones sobre sesiones -----

    const handleCardClick = (item: CalendarItem) => {
        if (item.kind === 'cardio') {
            setSelectedItem(item)
        } else if (item.kind === 'strength') {
            let targetWeek = item.weekIndex ?? 1

            if (item.id.startsWith('virtual-')) {
                const parts = item.id.split('-w')
                if (parts.length === 2) {
                    const weekIndex = parseInt(parts[1])
                    if (!isNaN(weekIndex)) {
                        targetWeek = weekIndex + 1
                    }
                }
            }

            const params = new URLSearchParams()
            params.set('week', targetWeek.toString())
            if (item.programId) {
                params.set('programId', item.programId)
            }
            if (item.dayId) {
                params.set('dayId', item.dayId)
            }
            params.set('date', item.date)

            router.push(`/routine?${params.toString()}`)
        }
    }

    const handleSaveLog = async (
        itemId: string,
        data: {
            actualDistanceKm?: number
            actualDurationMin?: number
            actualAvgPace?: string
            rpe?: number
            feedbackNotes?: string
        }
    ) => {
        const item = items.find(i => i.id === itemId)
        if (!item) return

        if (item.kind === 'cardio' && item.cardioSessionId) {
            const result = await saveCardioSessionLog(item.cardioSessionId, data)
            if (result.success) {
                setItems(prev =>
                    prev.map(i =>
                        i.id === itemId
                            ? { ...i, isCompleted: true, ...data }
                            : i
                    )
                )
            }
        }
    }

    // ----- Render -----

    const renderDay = (dateStr: string, options: { showHeading: boolean }) => {
        const dayItems = itemsByDate.get(dateStr) ?? []
        const sessions = dayItems.filter(item => item.kind !== 'rest')
        const isToday = dateStr === today

        return (
            <section key={dateStr} id={`plan-day-${dateStr}`} className="scroll-mt-60">
                {options.showHeading && (
                    <div className="mb-2 flex items-baseline gap-2 px-0.5">
                        <h3 className={cn('text-sm font-semibold', isToday ? 'text-primary' : 'text-foreground')}>
                            {dayHeading(dateStr, today)}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                            {format(parseDateStr(dateStr), 'd MMM', { locale: es })}
                        </span>
                        {sessions.length > 1 && (
                            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                                {sessions.filter(item => item.isCompleted).length}/{sessions.length}
                            </span>
                        )}
                    </div>
                )}

                {sessions.length === 0 ? (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-border/80 px-4 py-3 text-sm text-muted-foreground">
                        <Moon className="h-4 w-4" />
                        Descanso
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sessions.map(item => (
                            <PlanningDayCard
                                key={item.id}
                                item={item}
                                today={today}
                                onClick={() => handleCardClick(item)}
                            />
                        ))}
                    </div>
                )}
            </section>
        )
    }

    return (
        <div className="app-mobile-page min-h-screen">
            {/* Header */}
            <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
                <div className="px-4 pb-3 pt-4">
                    <div className="flex min-h-10 items-end gap-2 pr-24">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {rangeHint}
                            </p>
                            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">Plan</h1>
                        </div>
                        {isPending && <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-muted-foreground" aria-label="Cargando" />}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                        {/* Semana / Mes */}
                        <div className="inline-flex shrink-0 rounded-full bg-muted p-1" role="tablist" aria-label="Vista">
                            {VIEW_OPTIONS.map(option => {
                                const isActive = viewMode === option.value
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        onClick={() => handleViewChange(option.value)}
                                        className={cn(
                                            'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                                            isActive
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Navegación de rango */}
                        <div className="ml-auto flex min-w-0 items-center">
                            <button
                                type="button"
                                onClick={handlePrevious}
                                aria-label={viewMode === 'week' ? 'Semana anterior' : 'Mes anterior'}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={handleToday}
                                disabled={isCurrentRange}
                                className="min-w-0 truncate px-1 text-sm font-semibold tabular-nums text-foreground disabled:cursor-default"
                                title={isCurrentRange ? undefined : 'Volver a hoy'}
                            >
                                {rangeLabel}
                            </button>
                            <button
                                type="button"
                                onClick={handleNext}
                                aria-label={viewMode === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {viewMode === 'week' && (
                        <PlanWeekStrip
                            className="mt-3"
                            weekStart={rangeStart}
                            itemsByDate={itemsByDate}
                            selectedDate={selectedDate}
                            today={today}
                            onSelect={handleSelectDay}
                        />
                    )}
                </div>

                {!isCurrentRange && (
                    <div className="flex justify-center pb-2">
                        <button
                            type="button"
                            onClick={handleToday}
                            className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                        >
                            Volver a hoy
                        </button>
                    </div>
                )}
            </header>

            <div
                className={cn('space-y-5 px-4 pb-6 pt-4 transition-opacity', isPending && 'opacity-60')}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <WeeklySummary
                    items={visibleItems}
                    title={viewMode === 'week' ? 'Progreso semanal' : 'Progreso mensual'}
                    emptyText={viewMode === 'week' ? 'No hay sesiones planificadas esta semana.' : 'No hay sesiones planificadas este mes.'}
                />

                {viewMode === 'month' ? (
                    <>
                        <PlanMonthGrid
                            month={currentDate}
                            itemsByDate={itemsByDate}
                            selectedDate={selectedDate}
                            today={today}
                            onSelect={handleSelectDay}
                        />
                        {selectedDate >= rangeStartStr && selectedDate <= rangeEndStr && renderDay(selectedDate, { showHeading: true })}
                    </>
                ) : hasSessions || isPending ? (
                    <div className="space-y-5">
                        {weekDays.map(dateStr => renderDay(dateStr, { showHeading: true }))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                            <CalendarX2 className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold">Semana sin sesiones</p>
                        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                            Tu coach aún no ha planificado entrenamientos para estos días.
                        </p>
                    </div>
                )}
            </div>

            {/* Detail Sheet */}
            <CardioSessionDetail
                item={selectedItem}
                open={!!selectedItem}
                onOpenChange={(open) => !open && setSelectedItem(null)}
                onSave={handleSaveLog}
            />
        </div>
    )
}
