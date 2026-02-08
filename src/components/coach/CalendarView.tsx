'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarEvent } from '@/types/coach'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

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

export function CalendarView({ events, initialYear, initialMonth }: CalendarViewProps) {
    const router = useRouter()
    const [year, setYear] = useState(initialYear)
    const [month, setMonth] = useState(initialMonth)

    const goToPrevMonth = () => {
        let newMonth = month - 1
        let newYear = year
        if (newMonth < 0) {
            newMonth = 11
            newYear -= 1
        }
        setMonth(newMonth)
        setYear(newYear)
        router.push(`/coach/calendar?year=${newYear}&month=${newMonth}`)
    }

    const goToNextMonth = () => {
        let newMonth = month + 1
        let newYear = year
        if (newMonth > 11) {
            newMonth = 0
            newYear += 1
        }
        setMonth(newMonth)
        setYear(newYear)
        router.push(`/coach/calendar?year=${newYear}&month=${newMonth}`)
    }

    const goToToday = () => {
        const now = new Date()
        setYear(now.getFullYear())
        setMonth(now.getMonth())
        router.push(`/coach/calendar?year=${now.getFullYear()}&month=${now.getMonth()}`)
    }

    // Generate calendar days
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    const daysInMonth = lastDayOfMonth.getDate()

    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    let startDay = firstDayOfMonth.getDay() - 1
    if (startDay < 0) startDay = 6

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Create calendar grid
    const calendarDays: (number | null)[] = []
    for (let i = 0; i < startDay; i++) {
        calendarDays.push(null)
    }
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(day)
    }

    // Group events by date
    const eventsByDate: Record<string, CalendarEvent[]> = {}
    events.forEach(event => {
        if (!eventsByDate[event.date]) {
            eventsByDate[event.date] = []
        }
        eventsByDate[event.date].push(event)
    })

    return (
        <div className="space-y-4">
            {/* Navigation */}
            <Card className="p-4">
                <div className="flex items-center justify-between">
                    <Button variant="outline" size="icon" onClick={goToPrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="text-center">
                        <h2 className="font-semibold text-lg">
                            {MONTH_NAMES[month]} {year}
                        </h2>
                        <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs">
                            Hoy
                        </Button>
                    </div>

                    <Button variant="outline" size="icon" onClick={goToNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </Card>

            {/* Calendar grid */}
            <Card className="p-4">
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
                        const hasUrgent = dayEvents.some(e => e.isUrgent)
                        const isToday = dateStr === todayStr

                        return (
                            <div
                                key={day}
                                className={cn(
                                    'aspect-square p-1 rounded-lg border border-transparent transition-colors',
                                    isToday && 'bg-primary/10 border-primary',
                                    dayEvents.length > 0 && !isToday && 'bg-muted/50',
                                    hasUrgent && 'border-destructive'
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
                                        <div className="flex-1 overflow-hidden mt-1 space-y-0.5">
                                            {dayEvents.slice(0, 2).map(event => (
                                                <Link
                                                    key={event.id}
                                                    href={`/coach/clients?client=${event.clientId}`}
                                                    className="block"
                                                >
                                                    <Badge
                                                        variant={event.isUrgent ? 'destructive' : 'secondary'}
                                                        className="w-full text-[10px] truncate justify-start px-1 py-0"
                                                    >
                                                        {event.clientName.split(' ')[0]}
                                                    </Badge>
                                                </Link>
                                            ))}
                                            {dayEvents.length > 2 && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    +{dayEvents.length - 2} más
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Card>

            {/* Legend */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-muted border" />
                    <span>Check-in programado</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive" />
                    <span>Urgente (≤2 días)</span>
                </div>
            </div>
        </div>
    )
}
