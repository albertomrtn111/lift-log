'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    ChevronDown,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    MessageCircle,
    Minus,
    Dumbbell,
    Trophy,
    CalendarX2,
    RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ProgressDay, ProgressExercise, ProgressExerciseSet } from '@/app/(coach)/coach/workspace/training-progress-actions'
import {
    TREND_THRESHOLD,
    getBestE1RM,
    getBlockDeltaPct,
    summarizeBlockProgress,
} from '@/lib/training/progress-summary'

// ============================================================================
// PROGRESIÓN — helpers de 1RM estimado
// ============================================================================

/** Get the "top set" = the set with the highest weight (or highest reps if same weight) */
function getTopSet(sets: ProgressExerciseSet[]): ProgressExerciseSet | null {
    if (sets.length === 0) return null
    return sets.reduce((best, s) => {
        const bw = best.weightKg ?? 0
        const sw = s.weightKg ?? 0
        if (sw > bw) return s
        if (sw === bw && (s.reps ?? 0) > (best.reps ?? 0)) return s
        return best
    })
}

type Trend = 'up' | 'down' | 'neutral'

function getWeekDeltaPct(current: ProgressExerciseSet[], prev: ProgressExerciseSet[]): number | null {
    const curr = getBestE1RM(current)
    const previous = getBestE1RM(prev)
    if (curr == null || previous == null || previous === 0) return null
    return (curr - previous) / previous
}

function deltaToTrend(delta: number | null): Trend {
    if (delta == null) return 'neutral'
    if (delta > TREND_THRESHOLD) return 'up'
    if (delta < -TREND_THRESHOLD) return 'down'
    return 'neutral'
}

function formatDeltaPct(delta: number): string {
    const pct = Math.round(delta * 1000) / 10
    return `${pct > 0 ? '+' : ''}${pct}%`
}

// ============================================================================
// MAIN TABLE
// ============================================================================

interface ProgressionTableProps {
    days: ProgressDay[]
    maxWeek: number
    /** Restaurar un día que el coach quitó en una semana */
    onRestoreSkip?: (dayId: string, week: number) => void
}

export function ProgressionTable({ days, maxWeek, onRestoreSkip }: ProgressionTableProps) {
    // Recortar las semanas futuras sin datos: la tabla termina en la última
    // semana con algo registrado o con un día quitado por el coach (mínimo 1 columna).
    const lastWeekWithData = useMemo(() => {
        let last = 0
        for (const day of days) {
            for (const week of day.skippedWeeks ?? []) if (week > last) last = week
            for (const exercise of day.exercises) {
                for (const key of Object.keys(exercise.setsByWeek)) {
                    const week = Number(key)
                    if ((exercise.setsByWeek[week] ?? []).length > 0 && week > last) last = week
                }
            }
        }
        return last
    }, [days])

    const visibleWeeks = Math.max(1, Math.min(maxWeek, lastWeekWithData || maxWeek))
    const weeks = Array.from({ length: visibleWeeks }, (_, i) => i + 1)
    const hiddenWeeks = maxWeek - visibleWeeks

    // Resumen ejecutivo del bloque
    const summary = useMemo(() => summarizeBlockProgress(days), [days])

    // Semanas en las que el coach quitó todos los días: no cuentan como semanas por registrar.
    const fullySkippedWeeks = useMemo(() => {
        const withWeekday = days.filter(day => day.defaultWeekday != null)
        const pool = withWeekday.length > 0 ? withWeekday : days
        if (pool.length === 0) return 0
        let count = 0
        for (let week = 1; week <= maxWeek; week++) {
            if (pool.every(day => (day.skippedWeeks ?? []).includes(week))) count++
        }
        return count
    }, [days, maxWeek])
    const weeksToTrack = Math.max(maxWeek - fullySkippedWeeks, summary.weeksTracked)

    // All days collapsed state: default all expanded
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    const toggle = (dayId: string) => {
        setCollapsed(prev => {
            const next = new Set(prev)
            if (next.has(dayId)) next.delete(dayId)
            else next.add(dayId)
            return next
        })
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-4">
                {/* Resumen del bloque */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Card className="p-3.5">
                        <p className="text-xs text-muted-foreground">Semanas registradas</p>
                        <p className="mt-1 text-xl font-bold tabular-nums">
                            {summary.weeksTracked}
                            <span className="text-sm font-normal text-muted-foreground"> / {weeksToTrack}</span>
                        </p>
                    </Card>
                    <Card className="p-3.5">
                        <p className="text-xs text-muted-foreground">Progresión de ejercicios</p>
                        <div className="mt-1.5 flex items-center gap-2.5 text-sm font-semibold">
                            <span className="flex items-center gap-1 text-green-600">
                                <TrendingUp className="h-3.5 w-3.5" />{summary.improving}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                                <Minus className="h-3.5 w-3.5" />{summary.stable}
                            </span>
                            <span className="flex items-center gap-1 text-red-500">
                                <TrendingDown className="h-3.5 w-3.5" />{summary.declining}
                            </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                            Por 1RM estimado, primera vs última semana
                        </p>
                    </Card>
                    <Card className="col-span-2 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Trophy className="h-3.5 w-3.5 text-amber-500" />
                            Mejor progreso del bloque
                        </p>
                        {summary.best ? (
                            <p className="mt-1 truncate text-sm font-semibold">
                                {summary.best.exercise.name}
                                <span className="ml-2 tabular-nums text-green-600">
                                    {formatDeltaPct(summary.best.delta)} e1RM
                                </span>
                            </p>
                        ) : summary.comparable > 0 ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Ningún ejercicio mejora su e1RM en el bloque.
                            </p>
                        ) : (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Aún no hay dos semanas comparables.
                            </p>
                        )}
                    </Card>
                </div>

                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            {/* Header */}
                            <thead>
                                <tr className="border-b">
                                    <th className="sticky left-0 z-20 bg-background text-left px-4 py-3 font-medium text-muted-foreground min-w-[180px] sm:min-w-[220px]">
                                        Ejercicio
                                    </th>
                                    {weeks.map(w => (
                                        <th
                                            key={w}
                                            className="text-center px-2 py-3 font-medium text-muted-foreground min-w-[140px] sm:min-w-[160px] whitespace-nowrap"
                                        >
                                            Semana {w}
                                        </th>
                                    ))}
                                    <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                                        Δ bloque
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {days.map(day => (
                                    <DayGroup
                                        key={day.id}
                                        day={day}
                                        weeks={weeks}
                                        isCollapsed={collapsed.has(day.id)}
                                        onToggle={() => toggle(day.id)}
                                        onRestoreSkip={onRestoreSkip}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hiddenWeeks > 0 && (
                        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                            {hiddenWeeks} semana{hiddenWeeks !== 1 ? 's' : ''} futura{hiddenWeeks !== 1 ? 's' : ''} sin registros oculta{hiddenWeeks !== 1 ? 's' : ''} — aparecerán cuando el atleta entrene.
                        </p>
                    )}
                </Card>
            </div>
        </TooltipProvider>
    )
}

// ============================================================================
// DAY GROUP
// ============================================================================

function DayGroup({
    day,
    weeks,
    isCollapsed,
    onToggle,
    onRestoreSkip,
}: {
    day: ProgressDay
    weeks: number[]
    isCollapsed: boolean
    onToggle: () => void
    onRestoreSkip?: (dayId: string, week: number) => void
}) {
    const skipped = new Set(day.skippedWeeks ?? [])
    return (
        <>
            {/* Day header row */}
            <tr
                className="bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
                onClick={onToggle}
            >
                <td
                    className="sticky left-0 z-20 bg-muted/40 px-4 py-2.5 font-semibold"
                    colSpan={1}
                >
                    <div className="flex items-center gap-2">
                        {isCollapsed
                            ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                        <Dumbbell className="h-4 w-4 text-primary/60" />
                        <span>{day.name}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            {day.exercises.length} ejercicio{day.exercises.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </td>
                {/* Semana a semana: vacío, o la marca de día quitado por el coach */}
                {weeks.map(w => (
                    skipped.has(w) ? (
                        <td key={w} className="nt-skipped-stripes bg-muted/40 px-2 py-1.5 text-center">
                            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                <CalendarX2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">Quitado por el coach</span>
                                {onRestoreSkip && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                className="-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
                                                onClick={(e) => { e.stopPropagation(); onRestoreSkip(day.id, w) }}
                                                aria-label={`Restaurar ${day.name} en la semana ${w}`}
                                            >
                                                <RotateCcw className="h-3 w-3" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">Restaurar el día en esta semana</TooltipContent>
                                    </Tooltip>
                                )}
                            </span>
                        </td>
                    ) : (
                        <td key={w} className="bg-muted/40" />
                    )
                ))}
                <td className="bg-muted/40" />
            </tr>

            {/* Exercise rows */}
            {!isCollapsed && day.exercises.map(exercise => (
                <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    weeks={weeks}
                    skippedWeeks={skipped}
                />
            ))}
        </>
    )
}

// ============================================================================
// EXERCISE ROW
// ============================================================================

function ExerciseRow({
    exercise,
    weeks,
    skippedWeeks,
}: {
    exercise: ProgressExercise
    weeks: number[]
    skippedWeeks: Set<number>
}) {
    const blockDelta = getBlockDeltaPct(exercise)
    const blockTrend = deltaToTrend(blockDelta)

    return (
        <tr className="border-b border-muted/30 hover:bg-muted/10 transition-colors">
            {/* Sticky exercise name */}
            <td
                className={cn(
                    'sticky left-0 z-10 bg-background px-4 py-2 border-r border-muted/20',
                    (exercise.supersetWith?.length ?? 0) > 0 && 'border-l-[3px] border-l-primary/60'
                )}
            >
                <div className="flex flex-col">
                    <span className="flex items-start gap-1.5 font-medium text-sm">
                        {exercise.blockLabel && (
                            <span
                                className={cn(
                                    'mt-px flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                                    (exercise.supersetWith?.length ?? 0) > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                                )}
                            >
                                {exercise.blockLabel}
                            </span>
                        )}
                        <span>{exercise.name}</span>
                    </span>
                    {(exercise.supersetWith?.length ?? 0) > 0 && (
                        <span className="text-[11px] font-medium text-primary">
                            Superserie con {exercise.supersetWith!.join(', ')}
                        </span>
                    )}
                    {exercise.prescribedReps && (
                        <span className="text-[11px] text-muted-foreground">
                            {exercise.prescribedSets ? `${exercise.prescribedSets}×` : ''}
                            {exercise.prescribedReps}
                            {exercise.prescribedRir != null ? ` @RIR${exercise.prescribedRir}` : ''}
                        </span>
                    )}
                </div>
            </td>

            {/* Set cells per week */}
            {weeks.map(w => {
                const sets = exercise.setsByWeek[w] || []
                // Una semana quitada por el coach no rompe la comparación: se salta hacia atrás.
                let prevWeek = w - 1
                while (prevWeek >= 1 && skippedWeeks.has(prevWeek) && (exercise.setsByWeek[prevWeek] || []).length === 0) prevWeek--
                const prevSets = prevWeek >= 1 ? (exercise.setsByWeek[prevWeek] || []) : []
                return (
                    <SetCell
                        key={w}
                        sets={sets}
                        prevSets={prevSets}
                        skipped={skippedWeeks.has(w)}
                    />
                )
            })}

            {/* Δ del bloque completo */}
            <td className="px-3 py-2 text-center align-middle">
                {blockDelta != null ? (
                    <Badge
                        variant="outline"
                        className={cn(
                            'gap-1 tabular-nums text-xs',
                            blockTrend === 'up' && 'border-green-500/25 bg-green-500/10 text-green-600',
                            blockTrend === 'down' && 'border-red-500/25 bg-red-500/10 text-red-500',
                            blockTrend === 'neutral' && 'border-border bg-muted/40 text-muted-foreground',
                        )}
                    >
                        {blockTrend === 'up' && <TrendingUp className="h-3 w-3" />}
                        {blockTrend === 'down' && <TrendingDown className="h-3 w-3" />}
                        {blockTrend === 'neutral' && <Minus className="h-3 w-3" />}
                        {formatDeltaPct(blockDelta)}
                    </Badge>
                ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                )}
            </td>
        </tr>
    )
}

// ============================================================================
// SET CELL
// ============================================================================

const TREND_STYLES: Record<Trend, string> = {
    up: 'bg-green-500/[0.08] dark:bg-green-500/[0.12]',
    down: 'bg-red-500/[0.07] dark:bg-red-500/[0.12]',
    neutral: '',
}

function SetCell({
    sets,
    prevSets,
    skipped = false,
}: {
    sets: ProgressExerciseSet[]
    prevSets: ProgressExerciseSet[]
    skipped?: boolean
}) {
    if (skipped && sets.length === 0) {
        return (
            <td
                className="nt-skipped-stripes bg-muted/30 px-2 py-2 text-center text-muted-foreground/60"
                title="Quitado por el coach esta semana"
            >
                <span className="line-through" aria-label="Quitado por el coach esta semana">—</span>
            </td>
        )
    }

    if (sets.length === 0) {
        return (
            <td className="text-center px-2 py-2 text-muted-foreground/40">
                —
            </td>
        )
    }

    const weekDelta = prevSets.length > 0 ? getWeekDeltaPct(sets, prevSets) : null
    const trend = deltaToTrend(weekDelta)
    const topSet = getTopSet(sets)
    const hasNotes = sets.some(s => s.notes)

    return (
        <td className={cn('px-2 py-2 align-top', TREND_STYLES[trend])}>
            <div className="flex items-start gap-1">
                <div className="space-y-0.5 flex-1 min-w-0">
                    {sets.map((s, i) => (
                        <div key={i} className="text-xs whitespace-nowrap leading-relaxed">
                            <span className="text-muted-foreground">S{s.setIndex + 1}:</span>{' '}
                            <span className={cn('font-medium', s === topSet && 'text-foreground font-semibold')}>
                                {s.weightKg != null ? `${s.weightKg}kg` : '—'}
                            </span>
                            {' × '}
                            <span className="font-medium">
                                {s.reps != null ? s.reps : '—'}
                            </span>
                            {s.rir != null && (
                                <span className="text-muted-foreground"> @{s.rir}</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Tendencia semanal por e1RM, con el % de cambio */}
                {trend !== 'neutral' && weekDelta != null && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={cn(
                                'flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums',
                                trend === 'up' ? 'text-green-600' : 'text-red-500'
                            )}>
                                {trend === 'up'
                                    ? <TrendingUp className="h-3 w-3" />
                                    : <TrendingDown className="h-3 w-3" />}
                                {formatDeltaPct(weekDelta)}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            1RM estimado vs semana anterior
                        </TooltipContent>
                    </Tooltip>
                )}

                {/* Notes tooltip */}
                {hasNotes && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="shrink-0 mt-0.5 cursor-help">
                                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[250px] text-xs">
                            {sets
                                .filter(s => s.notes)
                                .map((s, i) => (
                                    <p key={i}>
                                        <strong>S{s.setIndex + 1}:</strong> {s.notes}
                                    </p>
                                ))
                            }
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </td>
    )
}
