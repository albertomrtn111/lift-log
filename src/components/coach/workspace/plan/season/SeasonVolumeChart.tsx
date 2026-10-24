'use client'

import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { formatAmount, measureFor, percentOf, targetAmount } from '@/lib/season/volume'
import type { SeasonDiscipline, SeasonMeasure, SeasonPlan, SeasonWeek } from '@/types/season'
import { DISCIPLINE_META, WEEK_TYPE_META, dayLabel } from './season-meta'

type Filter = 'cardio' | SeasonDiscipline

interface ChartRow {
    label: string
    index: number
    week: SeasonWeek
    planned: number
    done: number | null
    targetTotal: number
    deload: number
    [targetKey: `target_${string}`]: number
}

function axisValue(value: number, measure: SeasonMeasure) {
    if (measure === 'minutes') return value < 60 ? `${value} min` : `${Math.round((value / 60) * 10) / 10} h`
    if (measure === 'km') return `${value} km`
    return String(value)
}

// Marcas del eje en valores redondos (horas enteras, km o sesiones)
function axisTicks(max: number, measure: SeasonMeasure) {
    const steps = measure === 'minutes'
        ? [30, 60, 120, 180, 300, 600, 1200]
        : measure === 'km' ? [5, 10, 20, 25, 50, 100, 200, 500] : [1, 2, 5, 10]
    const step = steps.find((value) => max / value <= 5) ?? steps[steps.length - 1]
    return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step)
}

// Marca horizontal de lo programado sobre la barra del objetivo
function PlannedTick(props: { cx?: number; cy?: number; value?: number | null }) {
    const { cx, cy, value } = props
    if (cx == null || cy == null || !value) return null
    return <line x1={cx - 9} x2={cx + 9} y1={cy} y2={cy} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="text-foreground" />
}

function ChartTooltip({ active, payload, disciplines, measureOf }: {
    active?: boolean
    payload?: Array<{ payload: ChartRow }>
    disciplines: SeasonDiscipline[]
    measureOf: (discipline: SeasonDiscipline) => SeasonMeasure
}) {
    const row = active ? payload?.[0]?.payload : null
    if (!row) return null
    const { week } = row
    return (
        <div className="min-w-[220px] rounded-xl border border-border/70 bg-popover p-3 text-xs shadow-lg">
            <p className="font-semibold">
                Semana {week.weekNumber} · {dayLabel(week.weekStart)}
                <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-[10px]', WEEK_TYPE_META[week.weekType].badgeClass)}>
                    {WEEK_TYPE_META[week.weekType].label}
                </span>
            </p>
            <table className="mt-2 w-full tabular-nums">
                <thead>
                    <tr className="text-[10px] uppercase text-muted-foreground">
                        <th className="text-left font-medium" />
                        <th className="px-1 text-right font-medium">Obj.</th>
                        <th className="px-1 text-right font-medium">Prog.</th>
                        <th className="pl-1 text-right font-medium">Hecho</th>
                    </tr>
                </thead>
                <tbody>
                    {disciplines.map((discipline) => {
                        const measure = measureOf(discipline)
                        const cell = week.disciplines[discipline]
                        const target = targetAmount(cell.target, measure)
                        return (
                            <tr key={discipline}>
                                <td className="py-0.5 pr-2">
                                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: DISCIPLINE_META[discipline].color }} />
                                    {DISCIPLINE_META[discipline].label}
                                </td>
                                <td className="px-1 text-right">{target !== null ? formatAmount(target, measure) : '—'}</td>
                                <td className="px-1 text-right">{formatAmount(cell.planned[measure], measure)}</td>
                                <td className="pl-1 text-right">{week.timing === 'future' ? '—' : formatAmount(cell.done[measure], measure)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            {week.timing === 'current' && <p className="mt-2 text-muted-foreground">Semana en curso: el realizado es parcial.</p>}
        </div>
    )
}

export function SeasonVolumeChart({ season, weeks, onOpenWeek }: {
    season: SeasonPlan
    weeks: SeasonWeek[]
    onOpenWeek: (week: SeasonWeek) => void
}) {
    const cardioDisciplines = season.disciplines.filter((discipline) => discipline !== 'strength')
    const [filter, setFilter] = useState<Filter>(cardioDisciplines.length ? 'cardio' : season.disciplines[0])
    const [distanceView, setDistanceView] = useState(season.primaryUnit === 'distance')

    const shown: SeasonDiscipline[] = filter === 'cardio' ? cardioDisciplines : [filter]
    const unit = distanceView ? 'distance' : 'time'
    const measureOf = (discipline: SeasonDiscipline) => measureFor(discipline, unit)
    const measure: SeasonMeasure = filter === 'strength' ? 'sessions' : distanceView ? 'km' : 'minutes'
    // Los objetivos solo existen en la unidad de la temporada
    const showsTargets = filter === 'strength' || unit === season.primaryUnit

    const { rows, ticks } = useMemo(() => {
        const base = weeks.map((week, index) => {
            const row: ChartRow = {
                label: `S${week.weekNumber}`,
                index,
                week,
                planned: 0,
                done: week.timing === 'future' ? null : 0,
                targetTotal: 0,
                deload: 0,
            }
            for (const discipline of shown) {
                const cell = week.disciplines[discipline]
                const target = showsTargets ? targetAmount(cell.target, measure) ?? 0 : 0
                row[`target_${discipline}`] = target
                row.targetTotal += target
                row.planned += cell.planned[measure]
                if (row.done !== null) row.done += cell.done[measure]
            }
            return row
        })
        const max = Math.max(1, ...base.map((row) => Math.max(row.targetTotal, row.planned, row.done ?? 0)))
        const ticks = axisTicks(max, measure)
        const top = ticks[ticks.length - 1]
        return {
            ticks,
            rows: base.map((row) => ({ ...row, deload: row.week.weekType === 'descarga' ? top : 0 })) as ChartRow[],
        }
    }, [weeks, shown, measure, showsTargets])

    const totals = rows.reduce((sum, row) => ({
        target: sum.target + row.targetTotal,
        planned: sum.planned + row.planned,
        donePast: sum.donePast + (row.week.timing === 'past' ? row.done ?? 0 : 0),
        plannedPast: sum.plannedPast + (row.week.timing === 'past' ? row.planned : 0),
    }), { target: 0, planned: 0, donePast: 0, plannedPast: 0 })
    const unplanned = rows.filter((row) => row.week.timing !== 'future' && row.targetTotal > 0 && row.planned === 0).length

    const filters: Array<{ value: Filter; label: string }> = [
        ...(cardioDisciplines.length > 1 ? [{ value: 'cardio' as Filter, label: 'Todo el cardio' }] : []),
        ...season.disciplines.map((discipline) => ({ value: discipline as Filter, label: DISCIPLINE_META[discipline].label })),
    ]

    return (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h3 className="font-semibold">Volumen de temporada</h3>
                    <p className="text-xs text-muted-foreground">
                        Barra clara: objetivo · marca: programado · barra estrecha: realizado. Pulsa una semana para abrirla en Planificación.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                        {filters.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setFilter(option.value)}
                                aria-pressed={filter === option.value}
                                className={cn(
                                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                    filter === option.value ? 'border-foreground/20 bg-foreground/5 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    {filter !== 'strength' && (
                        <div className="flex gap-1 rounded-xl bg-muted p-1">
                            {([[false, 'Horas'], [true, 'Km']] as const).map(([value, label]) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setDistanceView(value)}
                                    className={cn('rounded-lg px-3 py-1 text-xs font-medium transition-all', distanceView === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60 text-center">
                <div className="px-2 py-2">
                    <p className="text-[11px] text-muted-foreground">Objetivo total</p>
                    <p className="text-sm font-bold tabular-nums">{showsTargets ? formatAmount(totals.target, measure) : '—'}</p>
                </div>
                <div className="px-2 py-2">
                    <p className="text-[11px] text-muted-foreground">Programado / objetivo</p>
                    <p className="text-sm font-bold tabular-nums">
                        {showsTargets && percentOf(totals.target, totals.planned) !== null ? `${percentOf(totals.target, totals.planned)} %` : '—'}
                    </p>
                </div>
                <div className="px-2 py-2">
                    <p className="text-[11px] text-muted-foreground">Hecho / programado</p>
                    <p className="text-sm font-bold tabular-nums">
                        {percentOf(totals.plannedPast, totals.donePast) !== null ? `${percentOf(totals.plannedPast, totals.donePast)} %` : '—'}
                    </p>
                </div>
            </div>

            <div className="px-2 pb-3 pt-4 sm:px-4">
                {!showsTargets && (
                    <p className="mb-2 px-2 text-xs text-muted-foreground">
                        Los objetivos de esta temporada están en {season.primaryUnit === 'time' ? 'horas' : 'km'}; aquí solo se ve programado y realizado.
                    </p>
                )}
                {unplanned > 0 && showsTargets && (
                    <p className="mb-2 px-2 text-xs text-rose-600 dark:text-rose-400">
                        {unplanned === 1 ? '1 semana con objetivo' : `${unplanned} semanas con objetivo`} y sin sesiones programadas.
                    </p>
                )}
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={rows}
                            margin={{ top: 8, right: 8, left: -8, bottom: 4 }}
                            barCategoryGap="18%"
                            onClick={(state: any) => {
                                const index = state?.activeTooltipIndex
                                if (typeof index === 'number' && rows[index]) onOpenWeek(rows[index].week)
                            }}
                            className="cursor-pointer"
                        >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                            <XAxis xAxisId="main" dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
                            <XAxis xAxisId="overlay" dataKey="label" hide />
                            <XAxis xAxisId="background" dataKey="label" hide />
                            <YAxis
                                tick={{ fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                width={52}
                                ticks={ticks}
                                domain={[0, ticks[ticks.length - 1]]}
                                tickFormatter={(value) => axisValue(value, measure)}
                            />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                                content={<ChartTooltip disciplines={shown} measureOf={(discipline) => discipline === 'strength' ? 'sessions' : measureOf(discipline)} />}
                            />
                            {/* Semanas de descarga sombreadas */}
                            <Bar xAxisId="background" dataKey="deload" fill="#0ea5e9" fillOpacity={0.07} isAnimationActive={false} />
                            {showsTargets && shown.map((discipline) => (
                                <Bar
                                    key={discipline}
                                    xAxisId="main"
                                    dataKey={`target_${discipline}`}
                                    stackId="target"
                                    fill={DISCIPLINE_META[discipline].color}
                                    fillOpacity={0.28}
                                    isAnimationActive={false}
                                />
                            ))}
                            <Bar
                                xAxisId="overlay"
                                dataKey="done"
                                barSize={6}
                                radius={[3, 3, 0, 0]}
                                fill={shown.length === 1 ? DISCIPLINE_META[shown[0]].color : 'hsl(var(--foreground))'}
                                fillOpacity={0.85}
                                isAnimationActive={false}
                            />
                            <Line
                                xAxisId="main"
                                dataKey="planned"
                                stroke="transparent"
                                dot={<PlannedTick />}
                                activeDot={false}
                                legendType="none"
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] text-muted-foreground">
                    {showsTargets && shown.map((discipline) => (
                        <span key={discipline} className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DISCIPLINE_META[discipline].color, opacity: 0.4 }} />
                            {DISCIPLINE_META[discipline].label}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-foreground" />Programado</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-foreground/80" />Realizado</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500/20" />Descarga</span>
                </div>
            </div>
        </div>
    )
}
