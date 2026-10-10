'use client'

import type { CalendarItem } from '@/data/client-schedule'
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { getSessionVisual, toLocalDateStr } from './plan-visuals'

const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MAX_DOTS = 3

function SessionDots({ items, inverted }: { items: CalendarItem[]; inverted?: boolean }) {
    const sessions = items.filter(item => item.kind !== 'rest')
    if (sessions.length === 0) return <span className="h-1.5" aria-hidden />

    return (
        <span className="flex h-1.5 items-center justify-center gap-0.5" aria-hidden>
            {sessions.slice(0, MAX_DOTS).map(item => {
                const visual = getSessionVisual(item)
                return (
                    <span
                        key={item.id}
                        className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            inverted
                                ? item.isCompleted ? 'bg-primary-foreground' : 'bg-primary-foreground/45'
                                : item.isCompleted ? visual.accent : visual.softDot
                        )}
                    />
                )
            })}
        </span>
    )
}

function describeDay(date: Date, items: CalendarItem[]) {
    const sessions = items.filter(item => item.kind !== 'rest')
    const label = format(date, "EEEE d 'de' MMMM", { locale: es })
    if (sessions.length === 0) return `${label}, descanso`
    const done = sessions.filter(item => item.isCompleted).length
    return `${label}, ${sessions.length} sesión${sessions.length > 1 ? 'es' : ''}, ${done} completada${done === 1 ? '' : 's'}`
}

// ------------------------------------------------------------------
// Semana: 7 días con puntos por sesión
// ------------------------------------------------------------------

interface PlanWeekStripProps {
    weekStart: Date
    itemsByDate: Map<string, CalendarItem[]>
    selectedDate: string
    today: string
    onSelect: (date: string) => void
    className?: string
}

export function PlanWeekStrip({ weekStart, itemsByDate, selectedDate, today, onSelect, className }: PlanWeekStripProps) {
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

    return (
        <div className={cn('grid grid-cols-7 gap-1', className)} role="tablist" aria-label="Días de la semana">
            {days.map((date, index) => {
                const dateStr = toLocalDateStr(date)
                const items = itemsByDate.get(dateStr) ?? []
                const isSelected = dateStr === selectedDate
                const isToday = dateStr === today
                const sessions = items.filter(item => item.kind !== 'rest')
                const allDone = sessions.length > 0 && sessions.every(item => item.isCompleted)

                return (
                    <button
                        key={dateStr}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-label={describeDay(date, items)}
                        onClick={() => onSelect(dateStr)}
                        className={cn(
                            'flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-foreground hover:bg-muted/70'
                        )}
                    >
                        <span className={cn(
                            'text-[11px] font-medium',
                            isSelected ? 'text-primary-foreground/80' : isToday ? 'text-primary' : 'text-muted-foreground'
                        )}>
                            {WEEKDAY_LETTERS[index]}
                        </span>
                        <span className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums',
                            !isSelected && isToday && 'text-primary ring-1 ring-primary/50',
                            !isSelected && allDone && !isToday && 'text-success'
                        )}>
                            {format(date, 'd')}
                        </span>
                        <SessionDots items={items} inverted={isSelected} />
                    </button>
                )
            })}
        </div>
    )
}

// ------------------------------------------------------------------
// Mes: cuadrícula tipo calendario
// ------------------------------------------------------------------

interface PlanMonthGridProps {
    month: Date
    itemsByDate: Map<string, CalendarItem[]>
    selectedDate: string
    today: string
    onSelect: (date: string) => void
}

export function PlanMonthGrid({ month, itemsByDate, selectedDate, today, onSelect }: PlanMonthGridProps) {
    const monthStart = startOfMonth(month)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    const days: Date[] = []
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day)

    return (
        <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="mb-1 grid grid-cols-7">
                {WEEKDAY_LETTERS.map(letter => (
                    <span key={letter} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
                        {letter}
                    </span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
                {days.map(date => {
                    const dateStr = toLocalDateStr(date)
                    const inMonth = date.getMonth() === monthStart.getMonth()

                    if (!inMonth) return <span key={dateStr} className="h-12" aria-hidden />

                    const items = itemsByDate.get(dateStr) ?? []
                    const isSelected = dateStr === selectedDate
                    const isToday = dateStr === today

                    return (
                        <button
                            key={dateStr}
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={describeDay(date, items)}
                            onClick={() => onSelect(dateStr)}
                            className={cn(
                                'mx-auto flex h-12 w-full max-w-[3rem] flex-col items-center justify-center gap-1 rounded-xl transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted/70',
                                !isSelected && isToday && 'text-primary ring-1 ring-inset ring-primary/50'
                            )}
                        >
                            <span className="text-sm font-semibold tabular-nums">{format(date, 'd')}</span>
                            <SessionDots items={items} inverted={isSelected} />
                        </button>
                    )
                })}
            </div>
        </section>
    )
}
