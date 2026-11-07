import Link from 'next/link'
import { addDays, format, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, CalendarDays, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CalendarEvent } from '@/types/coach'
import { cn } from '@/lib/utils'

interface WeekAgendaProps {
    events: CalendarEvent[]
}

function toDateAtNoon(dateStr: string) {
    return new Date(`${dateStr}T12:00:00`)
}

function getDayLabel(dateStr: string) {
    const date = toDateAtNoon(dateStr)
    if (isToday(date)) return 'Hoy'
    if (isTomorrow(date)) return 'Mañana'
    return format(date, 'EEEE', { locale: es })
}

/**
 * Agenda de los próximos 7 días: una fila por revisión programada,
 * agrupadas por día, con el nombre de la plantilla de revisión.
 */
export function WeekAgenda({ events }: WeekAgendaProps) {
    const today = new Date()
    const horizon = format(addDays(today, 7), 'yyyy-MM-dd')
    const upcoming = events
        .filter((event) => event.date <= horizon)
        .sort((a, b) => a.date.localeCompare(b.date))

    if (upcoming.length === 0) {
        return (
            <div className="p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Semana despejada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    No hay revisiones programadas en los próximos 7 días.
                </p>
            </div>
        )
    }

    const byDate = new Map<string, CalendarEvent[]>()
    for (const event of upcoming) {
        const list = byDate.get(event.date) ?? []
        list.push(event)
        byDate.set(event.date, list)
    }

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex-1 divide-y divide-border/60">
                {[...byDate.entries()].map(([date, dayEvents]) => {
                    const isTodayGroup = isToday(toDateAtNoon(date))
                    return (
                        <div key={date} className="px-4 py-3.5 sm:px-5">
                            <div className="flex items-baseline gap-2">
                                <p className={cn(
                                    'nt-eyebrow',
                                    isTodayGroup ? 'text-primary' : 'text-foreground'
                                )}>
                                    {getDayLabel(date)}
                                </p>
                                <span className="nt-eyebrow text-muted-foreground">
                                    {format(toDateAtNoon(date), 'd MMM', { locale: es })}
                                </span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                                {dayEvents.map((event) => (
                                    <Link
                                        key={event.id}
                                        href={`/coach/clients?client=${event.clientId}`}
                                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-foreground/[0.035]"
                                    >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                            <ClipboardCheck className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[14px] font-medium leading-tight">
                                                {event.clientName}
                                            </p>
                                            {event.reviewTemplateName && (
                                                <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                                                    {event.reviewTemplateName}
                                                </p>
                                            )}
                                        </div>
                                        {event.isUrgent && (
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
            <div className="border-t border-border/60 p-3">
                <Button variant="ghost" size="sm" asChild className="w-full">
                    <Link href="/coach/calendar">
                        Abrir calendario completo
                        <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
