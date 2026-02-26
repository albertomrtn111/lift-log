import { Card } from '@/components/ui/card'
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

  if (totalSessions === 0) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Resumen semanal</h3>
        <p className="text-sm text-muted-foreground">No hay sesiones planificadas esta semana.</p>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Resumen semanal</h3>

      <div className="grid grid-cols-2 gap-4">
        {plannedDistance > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Distancia</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{completedDistance.toFixed(1)}</span>
              <span className="text-muted-foreground">/ {plannedDistance} km</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(distancePercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm text-muted-foreground">Sesiones</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{completedSessions}</span>
            <span className="text-muted-foreground">/ {totalSessions}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.min(sessionsPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
