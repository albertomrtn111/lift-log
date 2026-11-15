'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { addDays, eachDay, weekStart } from '@/lib/nutrition/planning'
import type { CalendarDay } from '@/data/nutrition/calendar'

interface NutritionWeekStripProps {
    calendar: Map<string, CalendarDay>
    /** Día que mira el atleta (YYYY-MM-DD) */
    date: string
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function dayKcal(day: CalendarDay | undefined) {
    if (!day || day.source === 'none') return null
    return day.day_type_config ? day.day_type_config.training.kcal : day.kcal
}

/** La semana del día que se mira, con las kcal de cada día y lo que ha planificado el coach. */
export function NutritionWeekStrip({ calendar, date }: NutritionWeekStripProps) {
    const days = eachDay(weekStart(date), addDays(weekStart(date), 6))
    const selected = calendar.get(date)
    const planned = selected?.source === 'planned'

    return (
        <section className="mb-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
            {planned && (
                <p className="mb-2 text-sm">
                    <span className="font-semibold text-primary">{selected.label || selected.block_name}</span>
                    {selected.label && selected.block_name && (
                        <span className="text-muted-foreground"> · {selected.block_name}</span>
                    )}
                </p>
            )}
            <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                    const entry = calendar.get(day)
                    const kcal = dayKcal(entry)
                    const isPlanned = entry?.source === 'planned'
                    return (
                        <div
                            key={day}
                            title={entry?.label ?? undefined}
                            className={cn(
                                'flex flex-col items-center rounded-xl px-0.5 py-1.5 text-center',
                                isPlanned ? 'bg-primary/10' : 'bg-muted/50',
                                day === date && 'ring-2 ring-primary',
                            )}
                        >
                            <span className="text-[10px] font-semibold text-muted-foreground">{WEEKDAYS[i]}</span>
                            <span className="text-[10px] text-muted-foreground">{format(parseISO(day), 'd', { locale: es })}</span>
                            <span className={cn('mt-0.5 text-[11px] font-semibold tabular-nums', isPlanned && 'text-primary')}>
                                {kcal === null ? '–' : Math.round(kcal).toLocaleString('es-ES')}
                            </span>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}
