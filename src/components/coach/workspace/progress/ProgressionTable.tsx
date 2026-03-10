'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import {
    ChevronDown,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    MessageCircle,
    Dumbbell,
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
// MAIN TABLE
// ============================================================================

interface ProgressionTableProps {
    days: ProgressDay[]
    maxWeek: number
}

export function ProgressionTable({ days, maxWeek }: ProgressionTableProps) {
    const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1)

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
            </Card>
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
                {/* Empty cells for the week columns */}
                {weeks.map(w => (
                    <td key={w} className="bg-muted/40" />
                ))}
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
        </tr>
    )
}

// ============================================================================
// SET CELL
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

function getTrend(current: ProgressExerciseSet[], prev: ProgressExerciseSet[]): Trend {
    const topCurr = getTopSet(current)
    const topPrev = getTopSet(prev)
    if (!topCurr || !topPrev) return 'neutral'

    const wCurr = topCurr.weightKg ?? 0
    const wPrev = topPrev.weightKg ?? 0

    if (wCurr > wPrev) return 'up'
    if (wCurr < wPrev) return 'down'

    // Same weight → compare reps
    const rCurr = topCurr.reps ?? 0
    const rPrev = topPrev.reps ?? 0
    if (rCurr > rPrev) return 'up'
    if (rCurr < rPrev) return 'down'

    return 'neutral'
}

const TREND_STYLES: Record<Trend, string> = {
    up: 'bg-[#E8F5E9]',
    down: 'bg-[#FFEBEE]',
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

    const trend = prevSets.length > 0 ? getTrend(sets, prevSets) : 'neutral'
    const hasNotes = sets.some(s => s.notes)

    return (
        <td className={cn('px-2 py-2 align-top', TREND_STYLES[trend])}>
            <div className="flex items-start gap-1">
                <div className="space-y-0.5 flex-1 min-w-0">
                    {sets.map((s, i) => (
                        <div key={i} className="text-xs whitespace-nowrap leading-relaxed">
                            <span className="text-muted-foreground">S{s.setIndex + 1}:</span>{' '}
                            <span className="font-medium">
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

                {/* Trend indicator */}
                {trend === 'up' && (
                    <TrendingUp className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                )}
                {trend === 'down' && (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
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
