'use client'

import { ClientWithMeta } from '@/types/coach'
import { ClientRow } from './ClientRow'
import { format, addDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { useMemo } from 'react'

interface WeekTimelineProps {
    clients: ClientWithMeta[]
}

export function WeekTimeline({ clients }: WeekTimelineProps) {
    const timeline = useMemo(() => {
        const today = startOfDay(new Date())
        const days: { date: Date; dateStr: string; label: string; clients: ClientWithMeta[] }[] = []

        for (let i = 1; i <= 7; i++) {
            const day = addDays(today, i)
            const dateStr = format(day, 'yyyy-MM-dd')
            const label = format(day, "EEEE d", { locale: es })
            const dayClients = clients.filter(c => c.next_checkin_date === dateStr)
            days.push({ date: day, dateStr, label, clients: dayClients })
        }

        return days
    }, [clients])

    if (clients.length === 0) {
        return (
            <div className="p-6 text-center text-muted-foreground text-sm">
                No hay check-ins programados para los próximos 7 días
            </div>
        )
    }

    return (
        <div className="divide-y">
            {timeline.map(day => (
                <div key={day.dateStr}>
                    {/* Day header */}
                    <div className="px-4 py-2 bg-muted/30">
                        <span className="text-xs font-medium text-muted-foreground capitalize">
                            {day.label}
                        </span>
                        {day.clients.length === 0 && (
                            <span className="text-xs text-muted-foreground/50 ml-2">(libre)</span>
                        )}
                    </div>
                    {/* Client rows */}
                    {day.clients.map(client => (
                        <ClientRow key={client.id} client={client} showFrequency={false} />
                    ))}
                </div>
            ))}
        </div>
    )
}
