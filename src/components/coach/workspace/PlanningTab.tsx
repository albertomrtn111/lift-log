'use client'

import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Dumbbell, Activity, Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getWeeklySchedule } from '@/app/(coach)/coach/workspace/planning-actions'
import { UnifiedCalendarItem } from '@/types/planning'
import { useToast } from '@/hooks/use-toast'

interface PlanningTabProps {
    clientId: string
}

export function PlanningTab({ clientId }: PlanningTabProps) {
    const { toast } = useToast()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [isLoading, setIsLoading] = useState(true)
    const [schedule, setSchedule] = useState<UnifiedCalendarItem[]>([])

    // Calculate week range
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }) // Monday start
    const endDate = endOfWeek(currentDate, { weekStartsOn: 1 })

    // Generate array of 7 days
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i))

    // Fetch data when week changes
    useEffect(() => {
        const fetchSchedule = async () => {
            setIsLoading(true)
            const result = await getWeeklySchedule(clientId, startDate, endDate)

            if (result.success && result.data) {
                setSchedule(result.data)
            } else {
                toast({
                    title: "Error",
                    description: "No se pudo cargar la planificación.",
                    variant: "destructive"
                })
            }
            setIsLoading(false)
        }

        fetchSchedule()
    }, [clientId, currentDate]) // Re-run when client or date changes

    const handlePreviousWeek = () => setCurrentDate(subWeeks(currentDate, 1))
    const handleNextWeek = () => setCurrentDate(addWeeks(currentDate, 1))
    const handleToday = () => setCurrentDate(new Date())

    const getItemsForDay = (date: Date) => {
        return schedule.filter(item => isSameDay(new Date(item.date), date))
    }

    // Helper for formatting cardio summary
    const getCardioSummary = (item: UnifiedCalendarItem & { type: 'cardio' }) => {
        const parts = []

        // Try to get distance/duration from blocks if not at top level
        let distance = item.distance_km
        let duration = item.duration_minutes

        if (!distance && !duration && item.structure?.blocks) {
            const continuousBlock = item.structure.blocks.find(b => b.type === 'continuous')
            if (continuousBlock) {
                distance = continuousBlock.distance
                duration = continuousBlock.duration
            }
        }

        if (distance) parts.push(`${distance}km`)
        if (duration) parts.push(`${duration}'`)

        return parts.join(' / ')
    }

    return (
        <div className="space-y-6">
            {/* Header / Week Navigation */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-background/50 p-4 rounded-xl border shadow-sm backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold capitalize text-foreground">
                        {format(startDate, 'MMMM yyyy', { locale: es })}
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={handlePreviousWeek} className="h-8 w-8">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-sm font-medium w-36 text-center tabular-nums">
                        {format(startDate, 'd MMM', { locale: es })} - {format(endDate, 'd MMM', { locale: es })}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleNextWeek} className="h-8 w-8">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleToday} className="ml-2 text-xs">
                        Hoy
                    </Button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {weekDays.map((day) => {
                    const isToday = isSameDay(day, new Date())
                    const items = getItemsForDay(day)

                    return (
                        <Card key={day.toISOString()} className={cn(
                            "min-h-[150px] md:min-h-[300px] flex flex-col border-muted transition-colors",
                            isToday ? "border-primary/50 bg-primary/5 shadow-md" : "hover:bg-muted/30"
                        )}>
                            <CardHeader className="p-3 pb-2 border-b border-border/50">
                                <CardTitle className="text-sm font-medium flex justify-between items-center text-muted-foreground">
                                    <span className="capitalize">{format(day, 'EEEE', { locale: es })}</span>
                                    <span className={cn(
                                        "h-6 w-6 rounded-full flex items-center justify-center text-xs",
                                        isToday ? "bg-primary text-primary-foreground font-bold" : "bg-muted text-foreground"
                                    )}>
                                        {format(day, 'd')}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 flex-1 flex flex-col gap-2 relative">
                                {isLoading ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <>
                                        {items.length === 0 && (
                                            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/30 font-medium select-none">
                                                Descanso
                                            </div>
                                        )}

                                        {items.map((item) => {
                                            if (item.type === 'strength') {
                                                return (
                                                    <div key={item.id} className="p-2.5 rounded-md bg-zinc-800 text-white text-xs shadow-sm border border-zinc-700 hover:border-zinc-500 transition-colors cursor-pointer group">
                                                        <div className="flex items-center gap-1.5 mb-1 text-zinc-400 group-hover:text-zinc-300">
                                                            <Dumbbell className="h-3.5 w-3.5" />
                                                            <span className="font-semibold uppercase tracking-wider text-[10px]">Fuerza</span>
                                                        </div>
                                                        <div className="font-medium line-clamp-2 leading-relaxed">
                                                            {item.training_days?.name || "Entrenamiento"}
                                                        </div>
                                                    </div>
                                                )
                                            } else {
                                                // Cardio
                                                const summary = getCardioSummary(item)

                                                return (
                                                    <div key={item.id} className={cn(
                                                        "p-2.5 rounded-md text-xs shadow-sm border transition-colors cursor-pointer group",
                                                        "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
                                                        "hover:border-blue-300 dark:hover:border-blue-700"
                                                    )}>
                                                        <div className="flex items-center gap-1.5 mb-1 text-blue-500 dark:text-blue-400">
                                                            <Activity className="h-3.5 w-3.5" />
                                                            <span className="font-semibold uppercase tracking-wider text-[10px]">Cardio</span>
                                                        </div>
                                                        <div className="font-medium text-foreground mb-0.5">
                                                            {item.name}
                                                        </div>
                                                        {summary && (
                                                            <div className="text-[10px] text-muted-foreground font-medium">
                                                                {summary}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                        })}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
