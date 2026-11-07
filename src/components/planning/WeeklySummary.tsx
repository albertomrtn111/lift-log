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
            <section className="dark nt-stage rounded-[24px] p-5 text-foreground">
                <p className="nt-eyebrow text-white/50">{title}</p>
                <p className="mt-1.5 text-sm text-white/60">{emptyText}</p>
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

    // Panel de tinta en los dos temas, como el panel del día del coach: `dark` da los colores oscuros por dentro.
    return (
        <section className="dark nt-stage nt-rise rounded-[24px] p-5 text-foreground">
            <div className="flex items-center gap-4">
                <ProgressRing value={ratio} size={76} stroke={7} className="[&_circle:first-child]:stroke-white/10"><span className="nt-number text-[17px] text-white">{pct}%</span></ProgressRing>
                <div className="min-w-0 flex-1">
                    <p className="nt-eyebrow text-white/50">{title}</p>
                    <p className="nt-title mt-1.5 text-[21px] leading-tight text-white">
                        <span className="nt-number">{completed}</span> <span className="font-normal text-white/55">de {sessions.length} sesiones</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-white/55 tabular-nums">
                        {plannedKm > 0 && <span>{formatKm(completedKm)} / {formatKm(plannedKm)}</span>}
                        {completedMin > 0 && <span>{formatMinutes(completedMin)} entrenados</span>}
                    </div>
                </div>
            </div>

            {stats.length > 1 || stats[0]?.plannedKm ? (
                <div className="mt-5 space-y-3.5 border-t border-white/10 pt-4">
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
                                        <span className="text-[13px] font-medium text-white">{meta.label}</span>
                                        <span className="tabular-nums text-white/55">
                                            {s.completed}/{s.total}
                                            {useKm && ` · ${formatKm(s.completedKm)} de ${formatKm(s.plannedKm)}`}
                                        </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
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
