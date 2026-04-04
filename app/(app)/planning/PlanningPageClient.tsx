'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Dumbbell, Timer } from 'lucide-react'
import {
    CalendarItem,
    getClientWeeklySchedule,
    saveCardioSessionLog
} from '@/data/client-schedule'
import { WeekSelector } from '@/components/planning/WeekSelector'
import { WeeklySummary } from '@/components/planning/WeeklySummary'
import { PlanningDayCard } from '@/components/planning/PlanningDayCard'
import { CardioSessionDetail } from '@/components/planning/CardioSessionDetail'
import { addWeeks, startOfWeek, endOfWeek, differenceInCalendarWeeks } from 'date-fns'
import { cn } from '@/lib/utils'

interface PlanningPageClientProps {
    program: {
        id: string
        name: string
        totalWeeks: number
        effectiveFrom: string
    } | null
    initialItems: CalendarItem[]
    clientId: string
    initialWeek: number
}

const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export default function PlanningPageClient({
    program,
    initialItems,
    clientId,
    initialWeek,
}: PlanningPageClientProps) {
    const router = useRouter()
    const [selectedWeek, setSelectedWeek] = useState(initialWeek)
    const [items, setItems] = useState<CalendarItem[]>(initialItems)
    const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
    const [isPending, startTransition] = useTransition()

    // If no program, we might default to just showing "Current Week" or empty state
    // But assuming robust implementation, let's handle program-based logic first.

    useEffect(() => {
        // Fetch data when week changes
        // But only if we have a program to calculate dates from
        if (!program) return

        const fetchSchedule = async () => {
            const startDate = new Date(program.effectiveFrom)
            // effectiveFrom is usually Monday of Week 1? 
            // Or maybe just the start date. 
            // We'll assume strict weeks alignment for simplicity or align to week starts.

            const weekStart = startOfWeek(
                addWeeks(startDate, selectedWeek - 1),
                { weekStartsOn: 1 }
            )
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

            startTransition(async () => {
                const result = await getClientWeeklySchedule(clientId, toLocalDateStr(weekStart), toLocalDateStr(weekEnd))
                setItems(result)
            })
        }

        fetchSchedule()
    }, [selectedWeek, program, clientId])

    const handleCardClick = (item: CalendarItem) => {
        if (item.kind === 'cardio') {
            setSelectedItem(item)
        } else if (item.kind === 'strength') {
            // Navigate to Strength tab layout
            // Try to deduce week number from ID if virtual, or default to selectedWeek
            let targetWeek = selectedWeek

            // Virtual ID format: virtual-{programId}-{dayId}-w{weekIndex}
            // weekIndex is 0-based
            if (item.id.startsWith('virtual-')) {
                const parts = item.id.split('-w')
                if (parts.length === 2) {
                    const weekIndex = parseInt(parts[1])
                    if (!isNaN(weekIndex)) {
                        targetWeek = weekIndex + 1
                    }
                }
            }

            // For real sessions, they are usually in the current view week, so selectedWeek is correct.
            // But if we want to be safe, we could calculate it from date?
            // For now selectedWeek or virtual-deduced is good enough.

            const params = new URLSearchParams()
            params.set('week', targetWeek.toString())
            if (item.dayId) {
                params.set('dayId', item.dayId)
            }

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

    if (!program) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <CalendarDays className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-1">Sin plan activo</h3>
                <p className="text-sm text-muted-foreground">
                    No tienes un programa de entrenamiento asignado actualmente.
                </p>
            </div>
        )
    }

    return (
        <div className="app-mobile-page min-h-screen">
            {/* Header */}
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Planificación</h1>
                            <p className="text-sm text-muted-foreground">{program.name}</p>
                        </div>
                    </div>
                </div>

                {/* Week selector */}
                <div className="px-4 pb-3">
                    <WeekSelector
                        totalWeeks={program.totalWeeks}
                        selectedWeek={selectedWeek}
                        onSelectWeek={setSelectedWeek}
                    />
                </div>
            </header>

            <div className="px-4 pt-4 space-y-6">
                {/* Weekly summary */}
                <WeeklySummary items={items} />

                {/* Daily List */}
                <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Sesiones de la semana</h3>
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
