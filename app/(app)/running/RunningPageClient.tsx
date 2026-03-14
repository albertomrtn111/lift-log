'use client'

import { useState, useTransition, useCallback } from 'react'
import { Timer, CalendarOff, Dumbbell, Check } from 'lucide-react'
import { WeekNavigation } from '@/components/running/WeekNavigation'
import { WeeklySummaryCard } from '@/components/running/WeeklySummaryCard'
import { RunningDayCard } from '@/components/running/RunningDayCard'
import { CardioSessionDetail } from '@/components/planning/CardioSessionDetail'
import {
    CalendarItem,
    getClientWeeklySchedule,
    saveCardioSessionLog,
    markStrengthSessionCompleted
} from '@/data/client-schedule'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'

interface RunningPageClientProps {
    initialItems: CalendarItem[]
    clientId: string
    initialWeekStart: string // ISO date string
}

export default function RunningPageClient({
    initialItems,
    clientId,
    initialWeekStart,
}: RunningPageClientProps) {
    const [items, setItems] = useState<CalendarItem[]>(initialItems)
    const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
    const [selectedStrength, setSelectedStrength] = useState<CalendarItem | null>(null)
    const [completingStrength, setCompletingStrength] = useState(false)
    const [strengthDone, setStrengthDone] = useState(false)
    const [weekOffset, setWeekOffset] = useState(0)
    const [isPending, startTransition] = useTransition()

    const fetchWeek = useCallback(async (offset: number) => {
        const base = new Date(initialWeekStart + 'T12:00:00')
        const target = offset > 0
            ? addWeeks(base, offset)
            : offset < 0 ? subWeeks(base, Math.abs(offset)) : base
        const ws = startOfWeek(target, { weekStartsOn: 1 })
        const we = endOfWeek(target, { weekStartsOn: 1 })

        const result = await getClientWeeklySchedule(clientId, ws, we)
        setItems(result)
    }, [clientId, initialWeekStart])

    const handleWeekChange = (newWeek: number) => {
        // WeekNavigation uses 1-indexed weeks, convert to offset
        const newOffset = newWeek - 1 + weekOffset - (weekOffset)
        // Actually simpler: track offset from "current week"
        const delta = newWeek > (weekOffset + 1) ? 1 : -1
        const nextOffset = weekOffset + delta
        setWeekOffset(nextOffset)
        startTransition(() => {
            fetchWeek(nextOffset)
        })
    }

    const handlePrevWeek = () => {
        const nextOffset = weekOffset - 1
        setWeekOffset(nextOffset)
        startTransition(() => {
            fetchWeek(nextOffset)
        })
    }

    const handleNextWeek = () => {
        const nextOffset = weekOffset + 1
        setWeekOffset(nextOffset)
        startTransition(() => {
            fetchWeek(nextOffset)
        })
    }

    const handleSaveLog = async (
        itemId: string,
        data: {
            actualDistanceKm?: number
            actualDurationMin?: number
            actualAvgPace?: string
            rpe?: number
            feedbackNotes?: string
            avgHeartRate?: number
            maxHeartRate?: number
        }
    ) => {
        const item = items.find(i => i.id === itemId)
        if (!item) return

        if (item.kind === 'cardio' && item.cardioSessionId) {
            const result = await saveCardioSessionLog(item.cardioSessionId, {
                ...data,
                avgHeartRate: data.avgHeartRate,
                maxHeartRate: data.maxHeartRate,
            })
            if (result.success) {
                // Update local state
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

    const handleCompleteStrength = async () => {
        if (!selectedStrength) return
        setCompletingStrength(true)
        try {
            const isVirtual = selectedStrength.id.startsWith('virtual-')
            const result = await markStrengthSessionCompleted(
                selectedStrength.id,
                isVirtual,
                clientId,
                selectedStrength.programId,
                selectedStrength.dayId,
                selectedStrength.date,
            )
            if (result.success) {
                setStrengthDone(true)
                // Update local state
                setItems(prev =>
                    prev.map(i =>
                        i.id === selectedStrength.id
                            ? { ...i, isCompleted: true }
                            : i
                    )
                )
                setTimeout(() => {
                    setStrengthDone(false)
                    setSelectedStrength(null)
                }, 1000)
            }
        } finally {
            setCompletingStrength(false)
        }
    }

    const hasAnySessions = items.some(i => i.kind !== 'rest')

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Timer className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Running</h1>
                            <p className="text-sm text-muted-foreground">Tu plan de carrera</p>
                        </div>
                    </div>

                    {/* Simple week nav: prev/next arrows */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handlePrevWeek}
                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                            disabled={isPending}
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <span className="font-semibold text-sm">
                            {isPending ? 'Cargando...' : getWeekLabel(weekOffset)}
                        </span>
                        <button
                            onClick={handleNextWeek}
                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                            disabled={isPending}
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4">
                {/* Weekly summary */}
                <WeeklySummaryCard items={items} />

                {/* Week calendar */}
                {hasAnySessions ? (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Esta semana</h3>
                        <div className={cn("space-y-2", isPending && "opacity-50 pointer-events-none")}>
                            {items.map((item) => (
                                <RunningDayCard
                                    key={item.id}
                                    item={item}
                                    onClick={() => {
                                        if (item.kind === 'strength') {
                                            setStrengthDone(false)
                                            setSelectedStrength(item)
                                        } else if (item.kind === 'cardio') {
                                            setSelectedItem(item)
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CalendarOff className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="font-semibold text-lg mb-1">Sin sesiones planificadas</h3>
                        <p className="text-sm text-muted-foreground max-w-xs">
                            Tu entrenador aún no ha programado sesiones para esta semana.
                        </p>
                    </div>
                )}
            </div>

            {/* Session detail sheet */}
            <CardioSessionDetail
                item={selectedItem}
                open={!!selectedItem}
                onOpenChange={(open) => !open && setSelectedItem(null)}
                onSave={handleSaveLog}
            />

            {/* Strength session completion sheet */}
            <Sheet
                open={!!selectedStrength}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedStrength(null)
                        setStrengthDone(false)
                    }
                }}
            >
                <SheetContent className="w-full sm:max-w-md">
                    <SheetHeader>
                        <SheetTitle>{selectedStrength?.title ?? 'Entrenamiento de fuerza'}</SheetTitle>
                    </SheetHeader>

                    <div className="py-6 space-y-6">
                        {/* Program info */}
                        {selectedStrength?.programName && (
                            <p className="text-sm text-muted-foreground">
                                {selectedStrength.programName}
                            </p>
                        )}

                        {/* Status block */}
                        {selectedStrength?.isCompleted ? (
                            <div className="flex flex-col items-center gap-3 py-8 text-center">
                                <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                                    <Check className="h-8 w-8 text-success" />
                                </div>
                                <p className="font-semibold text-success">¡Sesión completada!</p>
                                <p className="text-sm text-muted-foreground">
                                    Ya registraste este entrenamiento.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-col items-center gap-3 py-6 text-center">
                                    <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
                                        <Dumbbell className="h-8 w-8 text-warning" />
                                    </div>
                                    <p className="text-sm text-muted-foreground max-w-xs">
                                        ¿Has completado este entrenamiento de fuerza?
                                        Márcalo para llevar el seguimiento de tu progreso.
                                    </p>
                                </div>

                                <Button
                                    className="w-full"
                                    size="lg"
                                    disabled={completingStrength || strengthDone}
                                    onClick={handleCompleteStrength}
                                >
                                    {strengthDone ? (
                                        <><Check className="h-4 w-4 mr-2" /> ¡Completado!</>
                                    ) : completingStrength ? (
                                        'Guardando...'
                                    ) : (
                                        <><Dumbbell className="h-4 w-4 mr-2" /> He completado este entreno</>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}



function getWeekLabel(offset: number): string {
    if (offset === 0) return 'Esta semana'
    if (offset === -1) return 'Semana pasada'
    if (offset === 1) return 'Próxima semana'
    if (offset < 0) return `Hace ${Math.abs(offset)} semanas`
    return `En ${offset} semanas`
}
