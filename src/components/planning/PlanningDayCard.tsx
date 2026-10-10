import type { CalendarItem } from '@/data/client-schedule'
import { Check, ChevronRight, Clock, Gauge, HeartPulse, Route } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatKm,
  formatMinutes,
  getSessionStatus,
  getSessionVisual,
} from './plan-visuals'

interface PlanningDayCardProps {
  item: CalendarItem
  today: string
  onClick: () => void
}

function Metric({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
      {children}
    </span>
  )
}

export function PlanningDayCard({ item, today, onClick }: PlanningDayCardProps) {
  const visual = getSessionVisual(item)
  const status = getSessionStatus(item, today)
  const Icon = visual.icon
  const isCompleted = status === 'completed'

  // Con la sesión hecha se enseña lo realizado; si no, el objetivo
  const distance = isCompleted ? (item.actualDistanceKm ?? item.targetDistanceKm) : item.targetDistanceKm
  const duration = isCompleted ? (item.actualDurationMin ?? item.targetDurationMin) : item.targetDurationMin
  const pace = isCompleted ? (item.actualAvgPace ?? item.targetPace) : item.targetPace
  const hasMetrics = item.kind === 'cardio' && Boolean(distance || duration || pace)
  const fallbackLine = item.kind === 'strength' ? item.subtitle : (!hasMetrics ? item.subtitle : undefined)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3.5 pl-4 text-left shadow-sm transition-all',
        'hover:border-border hover:shadow-md active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        status === 'today' ? 'border-primary/40 ring-1 ring-primary/15' : 'border-border/70',
        status === 'missed' && 'opacity-80'
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', visual.accent, status === 'missed' && 'opacity-40')} aria-hidden />

      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', visual.tile)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {visual.label}
          </span>
          {status === 'missed' && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              No realizada
            </span>
          )}
        </div>

        <h4 className="mt-0.5 truncate text-[15px] font-semibold leading-snug text-foreground">
          {item.title}
        </h4>

        {hasMetrics && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {distance ? <Metric icon={Route}>{formatKm(distance)}</Metric> : null}
            {duration ? <Metric icon={Clock}>{formatMinutes(duration)}</Metric> : null}
            {pace ? <Metric icon={Gauge}>{pace}</Metric> : null}
            {isCompleted && item.avgHeartRate ? <Metric icon={HeartPulse}>{item.avgHeartRate} ppm</Metric> : null}
          </div>
        )}

        {fallbackLine && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{fallbackLine}</p>
        )}
      </div>

      {isCompleted ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-sm" aria-label="Completada">
          <Check className="h-4 w-4" strokeWidth={3} />
        </div>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  )
}
