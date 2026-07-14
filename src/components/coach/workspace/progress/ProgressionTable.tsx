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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ProgressDay, ProgressExercise, ProgressExerciseSet } from '@/app/(coach)/coach/workspace/training-progress-actions'

// ============================================================================
// PROGRESIÓN — helpers de 1RM estimado
// ============================================================================

/**
 * 1RM estimado (Epley). Compara mejor que "peso del top set" porque captura
 * el trade-off peso/reps: 100kg×5 > 102.5kg×1.
 */
function epley1RM(set: ProgressExerciseSet): number | null {
    if (set.weightKg == null) return null
    if (set.reps == null || set.reps <= 0) return set.weightKg
    return set.weightKg * (1 + set.reps / 30)
}

function getBestE1RM(sets: ProgressExerciseSet[]): number | null {
    let best: number | null = null
    for (const set of sets) {
        const value = epley1RM(set)
        if (value != null && (best == null || value > best)) best = value
    }
    return best
}

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

// Umbral del 1% para no marcar como cambio el ruido de redondeos
const TREND_THRESHOLD = 0.01

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

/** Δ del bloque: e1RM de la primera semana registrada vs la última */
function getBlockDeltaPct(exercise: ProgressExercise): number | null {
    const weeksWithData = Object.keys(exercise.setsByWeek)
        .map(Number)
        .filter(w => (exercise.setsByWeek[w] ?? []).length > 0)
        .sort((a, b) => a - b)

    if (weeksWithData.length < 2) return null

    const first = getBestE1RM(exercise.setsByWeek[weeksWithData[0]])
    const last = getBestE1RM(exercise.setsByWeek[weeksWithData[weeksWithData.length - 1]])
    if (first == null || last == null || first === 0) return null
    return (last - first) / first
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
}

export function ProgressionTable({ days, maxWeek }: ProgressionTableProps) {
    // Recortar las semanas futuras sin datos: la tabla termina en la última
    // semana con algo registrado (mínimo 1 columna).
    const lastWeekWithData = useMemo(() => {
        let last = 0
        for (const day of days) {
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
    const summary = useMemo(() => {
        const allExercises = days.flatMap(day => day.exercises)
        const deltas = allExercises
            .map(exercise => ({ exercise, delta: getBlockDeltaPct(exercise) }))
            .filter((entry): entry is { exercise: ProgressExercise; delta: number } => entry.delta != null)

        const improving = deltas.filter(d => d.delta > TREND_THRESHOLD).length
        const declining = deltas.filter(d => d.delta < -TREND_THRESHOLD).length
        const stable = deltas.length - improving - declining

        const best = deltas.length > 0
            ? deltas.reduce((a, b) => (b.delta > a.delta ? b : a))
            : null

        const weeksTracked = new Set<number>()
        for (const day of days) {
            for (const exercise of day.exercises) {
                for (const key of Object.keys(exercise.setsByWeek)) {
                    if ((exercise.setsByWeek[Number(key)] ?? []).length > 0) weeksTracked.add(Number(key))
                }
            }
        }

        return { improving, declining, stable, comparable: deltas.length, best, weeksTracked: weeksTracked.size }
    }, [days])

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
                            <span className="text-sm font-normal text-muted-foreground"> / {maxWeek}</span>
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
                                <span className={cn(
                                    'ml-2 tabular-nums',
                                    summary.best.delta > 0 ? 'text-green-600' : 'text-muted-foreground'
                                )}>
                                    {formatDeltaPct(summary.best.delta)} e1RM
                                </span>
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
}: {
    day: ProgressDay
    weeks: number[]
    isCollapsed: boolean
    onToggle: () => void
}) {
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
                {/* Empty cells for the week + delta columns */}
                {weeks.map(w => (
                    <td key={w} className="bg-muted/40" />
                ))}
                <td className="bg-muted/40" />
            </tr>

            {/* Exercise rows */}
            {!isCollapsed && day.exercises.map(exercise => (
                <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    weeks={weeks}
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
}: {
    exercise: ProgressExercise
    weeks: number[]
}) {
    const blockDelta = getBlockDeltaPct(exercise)
    const blockTrend = deltaToTrend(blockDelta)

    return (
        <tr className="border-b border-muted/30 hover:bg-muted/10 transition-colors">
            {/* Sticky exercise name */}
            <td className="sticky left-0 z-10 bg-background px-4 py-2 border-r border-muted/20">
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{exercise.name}</span>
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
                const prevSets = w > 1 ? (exercise.setsByWeek[w - 1] || []) : []
                return (
                    <SetCell
                        key={w}
                        sets={sets}
                        prevSets={prevSets}
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
}: {
    sets: ProgressExerciseSet[]
    prevSets: ProgressExerciseSet[]
}) {
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
