'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
    CalendarItem,
    getClientWeeklySchedule,
    saveCardioSessionLog
} from '@/data/client-schedule'
import { WeeklySummary } from '@/components/planning/WeeklySummary'
import { PlanningDayCard } from '@/components/planning/PlanningDayCard'
import { CardioSessionDetail } from '@/components/planning/CardioSessionDetail'
import { addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameMonth, isSameWeek, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'

interface PlanningPageClientProps {
    initialItems: CalendarItem[]
    clientId: string
    initialDate: string
}

const PLAN_VIEW_OPTIONS: Array<{ value: 'week' | 'month'; label: string }> = [
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
]

const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export default function PlanningPageClient({
    initialItems,
    clientId,
    initialDate,
}: PlanningPageClientProps) {
    const router = useRouter()
    const [currentDate, setCurrentDate] = useState(() => new Date(`${initialDate}T12:00:00`))
    const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
    const [items, setItems] = useState<CalendarItem[]>(initialItems)
    const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
    const [isPending, startTransition] = useTransition()

    const rangeStart = viewMode === 'week'
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : startOfMonth(currentDate)
    const rangeEnd = viewMode === 'week'
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : endOfMonth(currentDate)

    const rangeLabel = viewMode === 'week'
        ? `${format(rangeStart, 'd MMM', { locale: es })} - ${format(rangeEnd, 'd MMM', { locale: es })}`
        : format(currentDate, 'MMMM yyyy', { locale: es })

    const rangeStartStr = toLocalDateStr(rangeStart)
    const rangeEndStr = toLocalDateStr(rangeEnd)

    const rangeHint = viewMode === 'week'
        ? isSameWeek(currentDate, new Date(), { weekStartsOn: 1 }) ? 'Esta semana' : 'Semana seleccionada'
        : isSameMonth(currentDate, new Date()) ? 'Este mes' : 'Mes seleccionado'

    useEffect(() => {
        const fetchSchedule = async () => {
            startTransition(async () => {
                const result = await getClientWeeklySchedule(clientId, rangeStartStr, rangeEndStr)
                setItems(result)
            })
        }

        fetchSchedule()
    }, [clientId, rangeEndStr, rangeStartStr])

    const handlePrevious = () => {
        setCurrentDate((date) => viewMode === 'week' ? subWeeks(date, 1) : subMonths(date, 1))
    }

    const handleNext = () => {
        setCurrentDate((date) => viewMode === 'week' ? addWeeks(date, 1) : addMonths(date, 1))
    }

    const handleToday = () => {
        setCurrentDate(new Date())
    }

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

    return (
        <div className="app-mobile-page min-h-screen">
            {/* Header */}
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-3 pr-20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <CalendarDays className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-foreground">Plan</h1>
                                <p className="text-sm text-muted-foreground">Calendario de entrenos</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2">
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handlePrevious}>
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <button type="button" className="min-w-0 text-center" onClick={handleToday}>
                            <span className="block truncate text-sm font-semibold capitalize text-foreground">{rangeLabel}</span>
                            <span className="block text-xs text-muted-foreground">{rangeHint}</span>
                        </button>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleNext}>
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <ClientTabSwitcher
                value={viewMode}
                options={PLAN_VIEW_OPTIONS}
                onValueChange={setViewMode}
            />

            <div className="px-4 pt-4 space-y-6">
                {/* Weekly summary */}
                <WeeklySummary
                    items={items}
                    title={viewMode === 'week' ? 'Resumen semanal' : 'Resumen mensual'}
                    emptyText={viewMode === 'week' ? 'No hay sesiones planificadas esta semana.' : 'No hay sesiones planificadas este mes.'}
                />

                {/* Daily List */}
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                        {viewMode === 'week' ? 'Sesiones de la semana' : 'Sesiones del mes'}
                    </h3>
                    <div className={cn("space-y-3", isPending && "opacity-50 pointer-events-none")}>
                        {items.length > 0 ? (
                            items.map((item) => (
                                <PlanningDayCard
                                    key={item.id}
                                    item={item}
                                    onClick={() => handleCardClick(item)}
                                />
                            ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No hay sesiones para esta semana.
                            </div>
                        )}
                    </div>
                </div>
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
