import { Card } from '@/components/ui/card'
import { CalendarItem } from '@/data/client-schedule'
import { TrendingUp, CheckCircle2 } from 'lucide-react'

interface WeeklySummaryCardProps {
  items: CalendarItem[]
}

export function WeeklySummary({ items }: WeeklySummaryCardProps) {
  const cardioItems = items.filter(i => i.kind === 'cardio')
  const strengthItems = items.filter(i => i.kind === 'strength')

  const cardioTotal = cardioItems.length
  const cardioCompleted = cardioItems.filter(i => i.isCompleted).length
  const cardioPercent = cardioTotal > 0 ? Math.round((cardioCompleted / cardioTotal) * 100) : 0

  const strengthTotal = strengthItems.length
  const strengthCompleted = strengthItems.filter(i => i.isCompleted).length
  const strengthPercent = strengthTotal > 0 ? Math.round((strengthCompleted / strengthTotal) * 100) : 0

  const plannedDistance = cardioItems.reduce((sum, i) => sum + (i.targetDistanceKm || 0), 0)
  const completedDistance = cardioItems
    .filter(i => i.isCompleted)
    .reduce((sum, i) => sum + (i.actualDistanceKm || i.targetDistanceKm || 0), 0)

  const distancePercent = plannedDistance > 0 ? Math.round((completedDistance / plannedDistance) * 100) : 0

  if (cardioTotal === 0 && strengthTotal === 0) {
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
        {/* Helper for progress bar */}
        {/* Cardio Sessions */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Running</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{cardioCompleted}</span>
            <span className="text-muted-foreground">/ {cardioTotal}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(cardioPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Strength Sessions */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-warning" />
            <span className="text-sm text-muted-foreground">Fuerza</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{strengthCompleted}</span>
            <span className="text-muted-foreground">/ {strengthTotal}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full transition-all"
              style={{ width: `${Math.min(strengthPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Distance - Optional */}
        {plannedDistance > 0 && (
          <div className="col-span-2 pt-2 border-t border-border mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Distancia Running</span>
              <span className="text-xs font-medium">{completedDistance.toFixed(1)} / {plannedDistance} km</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all"
                style={{ width: `${Math.min(distancePercent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
