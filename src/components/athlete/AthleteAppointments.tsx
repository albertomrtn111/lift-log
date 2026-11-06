import { CalendarClock } from 'lucide-react'
import type { AthleteAppointment } from '@/data/athlete-sessions'
import { appointmentLabel } from '@/lib/athlete/session-rules'

/** Próximas citas del centro, encima del calendario. */
export function AthleteAppointments({ appointments }: { appointments: AthleteAppointment[] }) {
    if (appointments.length === 0) return null
    return (
        <section className="px-4 pt-3" aria-labelledby="proximas-citas">
            <h2 id="proximas-citas" className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Próximas citas</h2>
            <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/60">
                {appointments.map(appointment => (
                    <li key={appointment.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-[15px]">
                        <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 truncate">{appointmentLabel(appointment.starts_at)}</span>
                    </li>
                ))}
            </ul>
        </section>
    )
}
