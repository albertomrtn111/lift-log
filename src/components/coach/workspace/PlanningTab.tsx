'use client'

import { useState, useEffect } from 'react'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Dumbbell, Activity, Calendar as CalendarIcon, Loader2, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getWeeklySchedule } from '@/app/(coach)/coach/workspace/planning-actions'
import { UnifiedCalendarItem } from '@/types/planning'
import { useToast } from '@/hooks/use-toast'
import { PlanningAddSessionDialog } from './PlanningAddSessionDialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface PlanningTabProps {
    clientId: string
}

export function PlanningTab({ clientId }: PlanningTabProps) {
    const { toast } = useToast()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [loading, setLoading] = useState(true) // Renamed from isLoading
    const [schedule, setSchedule] = useState<UnifiedCalendarItem[]>([])

    // Calculate week range
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }) // Monday start
    const endDate = endOfWeek(currentDate, { weekStartsOn: 1 })

    // Generate array of 7 days
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i))

    // Fetch data when week changes
    useEffect(() => {
        fetchSchedule()
    }, [clientId, currentDate]) // Re-run when client or date changes

    const fetchSchedule = async () => {
        setLoading(true)
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
        setLoading(false)
    }

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

    const isToday = (date: Date) => isSameDay(date, new Date());

    return (
        <div className="flex flex-col h-full space-y-4 p-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                    </h2>
                    <div className="flex items-center rounded-md border bg-background shadow-sm ml-4">
                        <Button variant="ghost" size="icon" onClick={handlePreviousWeek}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleToday} className="px-3 font-medium">
                            Hoy
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleNextWeek}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-4 h-full min-h-[600px]">
                {weekDays.map((day) => {
                    const items = getItemsForDay(day)
                    const isTodayDate = isToday(day)

                    return (
                        <div key={day.toISOString()} className={cn(
                            "flex flex-col gap-2 rounded-xl border p-2 bg-muted/20",
                            isTodayDate && "ring-2 ring-primary bg-primary/5"
                        )}>
                            {/* Day Header */}
                            <div className="flex items-center justify-between pb-2 border-b mb-2">
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-muted-foreground uppercase">
                                        {format(day, 'EEE', { locale: es })}
                                    </span>
                                    <span className={cn("text-lg font-bold", isTodayDate && "text-primary")}>
                                        {format(day, 'd')}
                                    </span>
                                </div>

                                {/* Add Session Button */}
                                <PlanningAddSessionDialog
                                    clientId={clientId}
                                    date={day}
                                    onSessionAdded={fetchSchedule}
                                />
                            </div>

                            {/* Items List */}
                            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
                                {loading ? (
                                    <div className="flex justify-center items-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                                                    <Card key={item.id} className="bg-zinc-900 border-zinc-800 text-white shadow-md hover:bg-zinc-800 transition-colors cursor-pointer group relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                                                        <CardContent className="p-3">
                                                            <div className="flex items-start justify-between mb-1">
                                                                <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 px-1 py-0 h-4">
                                                                    Fuerza
                                                                </Badge>
                                                                {item.is_completed && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                                            </div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Dumbbell className="h-4 w-4 text-blue-400" />
                                                                <span className="font-bold text-sm line-clamp-1">{item.training_days?.name || 'Día sin nombre'}</span>
                                                            </div>
                                                            <p className="text-[10px] text-zinc-500 line-clamp-1">
                                                                {item.training_programs?.name}
                                                            </p>
                                                        </CardContent>
                                                    </Card>
                                                )
                                            } else {
                                                // Cardio
                                                const summary = getCardioSummary(item as UnifiedCalendarItem & { type: 'cardio' })
                                                const structure = item.structure as any;
                                                const type = structure?.trainingType || 'rodaje';

                                                return (
                                                    <Card key={item.id} className={cn("border-none shadow-sm hover:opacity-80 transition-opacity cursor-pointer relative overflow-hidden",
                                                        type === 'rodaje' ? "bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100" :
                                                            type === 'series' ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100" :
                                                                "bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                                                    )}>
                                                        <div className={cn("absolute top-0 left-0 w-1 h-full",
                                                            type === 'rodaje' ? "bg-green-500" :
                                                                type === 'series' ? "bg-yellow-500" : "bg-blue-500"
                                                        )} />
                                                        <CardContent className="p-3">
                                                            <div className="flex items-start justify-between mb-1">
                                                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-white/50 dark:bg-black/20 backdrop-blur-sm">
                                                                    Cardio
                                                                </Badge>
                                                                {item.is_completed && <CheckCircle2 className="h-3 w-3" />}
                                                            </div>

                                                            <h4 className="font-bold text-sm mb-1 leading-snug">{item.name}</h4>

                                                            <div className="flex flex-wrap gap-2 text-[10px] font-medium opacity-80">
                                                                {/* Summary of blocks */}
                                                                {(structure?.blocks || []).slice(0, 1).map((b: any, i: number) => (
                                                                    <span key={i}>
                                                                        {b.type === 'continuous' ? `${b.distance || '?'}km` :
                                                                            b.type === 'intervals' ? `${b.sets}x${b.workDistance || b.workDuration}` :
                                                                                'Mix'}
                                                                    </span>
                                                                ))}
                                                                {(structure?.blocks || []).length > 1 && <span>+{(structure?.blocks || []).length - 1}</span>}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                )
                                            }
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
