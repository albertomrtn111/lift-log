import type { CalendarItem } from '@/data/client-schedule'
import { cn } from '@/lib/utils'
import { ProgressRing } from '@/components/ui/progress-ring'
import {
    formatKm,
    formatMinutes,
    getSessionVisual,
    SPORT_SUMMARY,
    type PlanSport,
} from './plan-visuals'

interface WeeklySummaryCardProps {
    items: CalendarItem[]
    title?: string
    emptyText?: string
}

interface SportStats {
    sport: PlanSport
    total: number
    completed: number
    plannedKm: number
    completedKm: number
}

const ORDER: PlanSport[] = ['running', 'bike', 'swim', 'hybrid', 'strength']

export function WeeklySummary({
    items,
    title = 'Resumen semanal',
    emptyText = 'No hay sesiones planificadas esta semana.',
}: WeeklySummaryCardProps) {
    const sessions = items.filter(i => i.kind !== 'rest')

    if (sessions.length === 0) {
        return (
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{emptyText}</p>
            </section>
        )
    }

    const statsMap = new Map<PlanSport, SportStats>()
    let completed = 0
    let plannedKm = 0
    let completedKm = 0
    let completedMin = 0

    for (const item of sessions) {
        const sport = getSessionVisual(item).sport ?? 'running'
        const stats = statsMap.get(sport) ?? { sport, total: 0, completed: 0, plannedKm: 0, completedKm: 0 }
        stats.total++
        stats.plannedKm += item.targetDistanceKm ?? 0
        plannedKm += item.targetDistanceKm ?? 0

        if (item.isCompleted) {
            const km = item.actualDistanceKm ?? item.targetDistanceKm ?? 0
            stats.completed++
            stats.completedKm += km
            completed++
            completedKm += km
            completedMin += item.actualDurationMin ?? item.targetDurationMin ?? 0
        }
        statsMap.set(sport, stats)
    }

    const stats = ORDER.map(sport => statsMap.get(sport)).filter(Boolean) as SportStats[]
    const ratio = completed / sessions.length
    const pct = Math.round(ratio * 100)

    return (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-4">
                <ProgressRing value={ratio}>{pct}%</ProgressRing>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
                    <p className="mt-0.5 text-lg font-semibold leading-tight">
                        {completed} <span className="font-normal text-muted-foreground">de {sessions.length} sesiones</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                        {plannedKm > 0 && <span>{formatKm(completedKm)} / {formatKm(plannedKm)}</span>}
                        {completedMin > 0 && <span>{formatMinutes(completedMin)} entrenados</span>}
                    </div>
                </div>
            </div>

            {stats.length > 1 || stats[0]?.plannedKm ? (
                <div className="mt-4 space-y-3 border-t border-border/60 pt-3.5">
                    {stats.map(s => {
                        const meta = SPORT_SUMMARY[s.sport]
                        const Icon = meta.icon
                        const useKm = s.plannedKm > 0
                        const value = useKm ? s.completedKm / s.plannedKm : s.completed / s.total
                        return (
                            <div key={s.sport} className="flex items-center gap-3">
                                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.tile)}>
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                                        <span className="font-medium text-foreground">{meta.label}</span>
                                        <span className="tabular-nums text-muted-foreground">
                                            {s.completed}/{s.total}
                                            {useKm && ` · ${formatKm(s.completedKm)} de ${formatKm(s.plannedKm)}`}
                                        </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className={cn('h-full rounded-full transition-[width] duration-700 ease-out', meta.accent)}
                                            style={{ width: `${Math.min(Math.round(value * 100), 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </section>
    )
}
