'use client'

import { cn } from '@/lib/utils'
import { deviationStatus, formatAmount, percentOf } from '@/lib/season/volume'
import type { SeasonWeekSummary } from '@/types/season'
import { DISCIPLINE_META, WEEK_TYPE_META } from './season-meta'

const BAR_CLASS: Record<string, string> = {
    none: 'bg-muted-foreground/40',
    empty: 'bg-rose-500',
    low: 'bg-amber-500',
    ok: 'bg-emerald-500',
    high: 'bg-violet-500',
}

/** Objetivo de la temporada frente a lo programado en la semana visible */
export function SeasonWeekLoad({ summary, onOpenSeason }: { summary: SeasonWeekSummary; onOpenSeason?: () => void }) {
    const rows = summary.disciplines.filter((row) => row.target !== null || row.planned > 0)

    return (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Objetivo de temporada · semana {summary.weekNumber} de {summary.totalWeeks}
                </p>
                <div className="flex items-center gap-2">
                    {summary.phaseName && <span className="text-[11px] text-muted-foreground">{summary.phaseName}</span>}
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', WEEK_TYPE_META[summary.weekType].badgeClass)}>
                        {WEEK_TYPE_META[summary.weekType].label}
                    </span>
                    {onOpenSeason && (
                        <button type="button" onClick={onOpenSeason} className="text-[11px] font-medium text-primary hover:underline">
                            Ver temporada
                        </button>
                    )}
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Esta semana no tiene objetivos todavía.</p>
            ) : (
                <ul className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
                    {rows.map((row) => {
                        const meta = DISCIPLINE_META[row.discipline]
                        const Icon = meta.icon
                        const status = deviationStatus(row.target, row.planned)
                        const percent = percentOf(row.target, row.planned)
                        const missing = row.target !== null ? row.target - row.planned : null
                        return (
                            <li key={row.discipline} className="min-w-0">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-muted-foreground">
                                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded', meta.chipClass)}><Icon className="h-3 w-3" /></span>
                                        <span className="truncate">{meta.label}</span>
                                    </span>
                                    <span className="whitespace-nowrap tabular-nums">
                                        <span className="font-bold">{formatAmount(row.planned, row.measure)}</span>
                                        {row.target !== null && <span className="text-muted-foreground"> / {formatAmount(row.target, row.measure)}</span>}
                                    </span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className={cn('h-full rounded-full transition-all', BAR_CLASS[status])}
                                        style={{ width: `${Math.min(100, percent ?? 100)}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    {row.target === null
                                        ? 'Sin objetivo'
                                        : missing !== null && missing > 0
                                            ? `Faltan ${formatAmount(missing, row.measure)} (${percent} %)`
                                            : `${percent} % del objetivo`}
                                </p>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
