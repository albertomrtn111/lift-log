import { CalendarItem } from '@/data/client-schedule'
import { TrendingUp, CheckCircle2 } from 'lucide-react'

interface WeeklySummaryCardProps {
  items: CalendarItem[]
}

export function WeeklySummaryCard({ items }: WeeklySummaryCardProps) {
  const sessions = items.filter(i => i.kind !== 'rest')
  const completedSessions = sessions.filter(i => i.isCompleted).length
  const totalSessions = sessions.length

  // Distance stats (only cardio)
  const cardioItems = items.filter(i => i.kind === 'cardio')
  const plannedDistance = cardioItems.reduce((sum, i) => sum + (i.targetDistanceKm || 0), 0)
  const completedDistance = cardioItems
    .filter(i => i.isCompleted)
    .reduce((sum, i) => sum + (i.actualDistanceKm || i.targetDistanceKm || 0), 0)

  const distancePercent = plannedDistance > 0
    ? Math.round((completedDistance / plannedDistance) * 100)
    : 0
  const sessionsPercent = totalSessions > 0
    ? Math.round((completedSessions / totalSessions) * 100)
    : 0

  // Kilómetros en español: «19,3».
  const km = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 })

  // Panel de tinta en los dos temas, como el del Plan: `dark` da los colores oscuros por dentro.
  if (totalSessions === 0) {
    return (
      <section className="dark nt-stage rounded-[24px] p-5 text-foreground">
        <p className="nt-eyebrow text-white/50">Resumen semanal</p>
        <p className="mt-1.5 text-sm text-white/60">No hay sesiones planificadas esta semana.</p>
      </section>
    )
  }

  return (
    <section className="dark nt-stage nt-rise rounded-[24px] p-5 text-foreground">
      <p className="nt-eyebrow text-white/50">Resumen semanal</p>

      <div className="mt-4 grid grid-cols-2 gap-6">
        {plannedDistance > 0 && (
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] text-white/55">
              <TrendingUp className="h-4 w-4 text-primary" />
              Distancia
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="nt-number text-[2.25rem] leading-none text-white">{km(completedDistance)}</span>
              <span className="text-[14px] text-white/55">/ {km(plannedDistance)} km</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(distancePercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-white/55">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Sesiones
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="nt-number text-[2.25rem] leading-none text-white">{completedSessions}</span>
            <span className="text-[14px] text-white/55">/ {totalSessions}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${Math.min(sessionsPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
