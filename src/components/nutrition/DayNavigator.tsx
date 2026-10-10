'use client'

import { useState } from 'react'
import { addDays, format, isToday, isYesterday, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function dayLabel(date: Date) {
    if (isToday(date)) return 'Hoy'
    if (isYesterday(date)) return 'Ayer'
    const label = format(date, 'EEEE', { locale: es })
    return label.charAt(0).toUpperCase() + label.slice(1)
}

/** ‹ Hoy · vie 10 oct › — día compartido por Macros y Suplementos */
export function DayNavigator({ date, onChange, className }: { date: Date; onChange: (date: Date) => void; className?: string }) {
    const [open, setOpen] = useState(false)
    const canGoForward = !isToday(date) && date < startOfDay(new Date())

    return (
        <div className={cn('flex items-center justify-between rounded-full bg-muted/60 p-1', className)}>
            <button
                type="button"
                onClick={() => onChange(addDays(date, -1))}
                aria-label="Día anterior"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button type="button" className="min-w-0 rounded-full px-3 py-1 text-sm transition-colors hover:bg-background">
                        <span className="font-semibold">{dayLabel(date)}</span>
                        <span className="text-muted-foreground"> · {format(date, "EEE d MMM", { locale: es })}</span>
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(selected) => {
                            if (selected) onChange(selected)
                            setOpen(false)
                        }}
                        locale={es}
                        weekStartsOn={1}
                        disabled={(day) => day > new Date()}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>

            <button
                type="button"
                onClick={() => canGoForward && onChange(addDays(date, 1))}
                disabled={!canGoForward}
                aria-label="Día siguiente"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    )
}

