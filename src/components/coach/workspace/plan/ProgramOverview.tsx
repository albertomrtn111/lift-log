'use client'

import { useMemo, useState } from 'react'
import { BarChart3, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MUSCLE_GROUP_LABELS, normalizeMuscleGroup, type MuscleGroup } from '@/lib/training/muscle-groups'

// ---------------------------------------------------------------------------
// Datos del programa tal y como los guarda el editor
// ---------------------------------------------------------------------------

export type ProgramDetail = {
    days: Array<{ id: string; name: string; order_index: number | null }>
    exercises: Array<{
        id: string
        day_id: string
        exercise_name: string | null
        muscle_group?: string | null
        order_index: number | null
        sets?: number | null
        reps?: string | null
        rir?: number | string | null
        rest_seconds?: number | null
        notes?: string | null
    }>
    columns: Array<{ id: string; key?: string | null; label?: string | null; scope?: string | null }>
    cells: Array<{ exercise_id: string; column_id: string; week_index: number; value: unknown }>
    /** Series registradas por el atleta (training_exercise_sets) */
    loggedSets: Array<{ exercise_id: string; week_index: number; set_index: number; weight_kg: number | null; reps: number | null; completed: boolean | null }>
}

type ColumnKey = 'sets' | 'reps' | 'rir' | 'rest' | 'tips' | 'notes'

/** Etiquetas alternativas por si el programa usa columnas personalizadas (c2, c3…) */
const COLUMN_LABELS: Record<ColumnKey, string[]> = {
    sets: ['series'],
    reps: ['reps', 'repes', 'repeticiones'],
    rir: ['rir'],
    rest: ['descanso', 'descanso (s)'],
    tips: ['tips'],
    notes: ['notas'],
}

function scalar(value: unknown): string | number | null {
    if (value == null) return null
    if (Array.isArray(value)) {
        const parts = value.map(scalar).filter(part => part !== null && part !== '')
        return parts.length ? parts.join(' / ') : null
    }
    if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
        return scalar((value as Record<string, unknown>).value)
    }
    if (typeof value === 'string') return value.trim() || null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    return null
}

function toNumber(value: string | number | null) {
    if (value == null) return 0
    if (typeof value === 'number') return value
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
}

function formatRest(value: string | number | null) {
    if (value == null) return null
    const seconds = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : null
    if (seconds == null) return String(value)
    if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`
    if (seconds > 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`
    return `${seconds} s`
}

/**
 * Valores de cada ejercicio tal y como los ve el atleta: la app del atleta lee
 * los campos base del ejercicio (iguales todas las semanas). Las celdas por
 * semana del editor antiguo solo se usan si el campo base está vacío.
 */
function buildWeekReader(detail: ProgramDetail, week: number) {
    const columnByKey = new Map<ColumnKey, ProgramDetail['columns'][number]>()
    for (const key of Object.keys(COLUMN_LABELS) as ColumnKey[]) {
        const column = detail.columns.find(c => c.key === key)
            ?? detail.columns.find(c => COLUMN_LABELS[key].includes((c.label ?? '').trim().toLowerCase()))
        if (column) columnByKey.set(key, column)
    }

    const cellIndex = new Map<string, Map<number, unknown>>()
    for (const cell of detail.cells) {
        const id = `${cell.exercise_id}:${cell.column_id}`
        const byWeek = cellIndex.get(id) ?? new Map<number, unknown>()
        byWeek.set(cell.week_index, cell.value)
        cellIndex.set(id, byWeek)
    }

    const fromCells = (exercise: ProgramDetail['exercises'][number], key: ColumnKey) => {
        const column = columnByKey.get(key)
        const byWeek = column ? cellIndex.get(`${exercise.id}:${column.id}`) : undefined
        if (!byWeek) return null
        return scalar(byWeek.get(week)) ?? scalar(byWeek.get(Math.min(...byWeek.keys())))
    }

    return (exercise: ProgramDetail['exercises'][number], key: ColumnKey): string | number | null => {
        const base = key === 'sets' ? exercise.sets ?? null
            : key === 'reps' ? scalar(exercise.reps)
                : key === 'rir' ? (exercise.rir != null ? scalar(String(exercise.rir)) : null)
                    : key === 'rest' ? exercise.rest_seconds ?? null
                        : key === 'notes' ? scalar(exercise.notes)
                            : null
        return base ?? fromCells(exercise, key)
    }
}

type MuscleVolumeMetric = { group: MuscleGroup; totalSets: number; frequency: number }

export function buildMuscleVolumeMetrics(detail: ProgramDetail | null, week: number): MuscleVolumeMetric[] {
    if (!detail) return []
    const read = buildWeekReader(detail, week)
    const metricsMap = new Map<MuscleGroup, { totalSets: number; dayIds: Set<string> }>()

    for (const exercise of detail.exercises) {
        const totalSets = toNumber(read(exercise, 'sets'))
        if (totalSets <= 0) continue
        const group = normalizeMuscleGroup(exercise.muscle_group)
        const bucket = metricsMap.get(group) ?? { totalSets: 0, dayIds: new Set<string>() }
        bucket.totalSets += totalSets
        bucket.dayIds.add(exercise.day_id)
        metricsMap.set(group, bucket)
    }

    return Array.from(metricsMap.entries())
        .map(([group, value]) => ({ group, totalSets: value.totalSets, frequency: value.dayIds.size }))
        .sort((a, b) => b.totalSets - a.totalSets || MUSCLE_GROUP_LABELS[a.group].localeCompare(MUSCLE_GROUP_LABELS[b.group], 'es'))
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

type OverviewView = 'exercises' | 'volume'

interface ProgramOverviewProps {
    detail: ProgramDetail | null
    totalWeeks: number
    activeWeek: number
    onWeekChange: (week: number) => void
}

export function ProgramOverview({ detail, totalWeeks, activeWeek, onWeekChange }: ProgramOverviewProps) {
    const [view, setView] = useState<OverviewView>('exercises')
    const metrics = useMemo(() => buildMuscleVolumeMetrics(detail, activeWeek), [detail, activeWeek])
    const totalSets = metrics.reduce((sum, metric) => sum + metric.totalSets, 0)

    return (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
            <div className="space-y-2.5 border-b border-border/60 px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="grid grid-cols-2 rounded-full bg-muted p-1" role="tablist" aria-label="Vista del programa">
                        {([
                            { value: 'exercises', label: 'Ejercicios', icon: ListChecks },
                            { value: 'volume', label: 'Volumen', icon: BarChart3 },
                        ] as const).map(option => {
                            const Icon = option.icon
                            const isActive = view === option.value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setView(option.value)}
                                    className={cn(
                                        'flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all',
                                        isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>
                    {totalSets > 0 && (
                        <p className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground tabular-nums">{totalSets}</span> series · semana {activeWeek}
                        </p>
                    )}
                </div>
                {totalWeeks > 1 && (
                    <div className="flex max-w-full gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Semana del programa">
                        {Array.from({ length: totalWeeks }).map((_, index) => {
                            const week = index + 1
                            const isActive = activeWeek === week
                            return (
                                <button
                                    key={week}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-label={`Semana ${week}`}
                                    onClick={() => onWeekChange(week)}
                                    className={cn(
                                        'h-7 min-w-9 shrink-0 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors',
                                        isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    S{week}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {!detail ? (
                <div className="space-y-2 p-4" aria-label="Cargando programa">
                    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-muted/60" />)}
                </div>
            ) : view === 'exercises' ? (
                <ExercisesView detail={detail} week={activeWeek} />
            ) : (
                <VolumeView metrics={metrics} />
            )}
        </div>
    )
}

function ExercisesView({ detail, week }: { detail: ProgramDetail; week: number }) {
    const read = useMemo(() => buildWeekReader(detail, week), [detail, week])
    const loggedByExercise = useMemo(() => {
        const map = new Map<string, ProgramDetail['loggedSets']>()
        for (const set of detail.loggedSets) {
            if (set.week_index !== week) continue
            if (set.weight_kg == null && set.reps == null) continue
            const list = map.get(set.exercise_id) ?? []
            list.push(set)
            map.set(set.exercise_id, list)
        }
        for (const list of map.values()) list.sort((a, b) => a.set_index - b.set_index)
        return map
    }, [detail.loggedSets, week])
    const days = useMemo(
        () => [...detail.days].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
        [detail.days]
    )
    const exercisesByDay = useMemo(() => {
        const map = new Map<string, ProgramDetail['exercises']>()
        for (const exercise of [...detail.exercises].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
            const list = map.get(exercise.day_id) ?? []
            list.push(exercise)
            map.set(exercise.day_id, list)
        }
        return map
    }, [detail.exercises])

    if (detail.exercises.length === 0) {
        return (
            <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium">Este programa aún no tiene ejercicios</p>
                <p className="mt-1 text-xs text-muted-foreground">Añádelos desde «Editar ejercicios y series».</p>
            </div>
        )
    }

    return (
        <div className="divide-y divide-border/60">
            {days.map(day => {
                const exercises = exercisesByDay.get(day.id) ?? []
                if (exercises.length === 0) return null
                const daySets = exercises.reduce((sum, exercise) => sum + toNumber(read(exercise, 'sets')), 0)
                return (
                    <section key={day.id} className="px-3 py-3 sm:px-4">
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                            <h5 className="font-semibold">{day.name}</h5>
                            <p className="shrink-0 text-xs text-muted-foreground">
                                {exercises.length} ejercicios{daySets > 0 ? ` · ${daySets} series` : ''}
                            </p>
                        </div>
                        <ol className="space-y-1.5">
                            {exercises.map((exercise, index) => {
                                const sets = read(exercise, 'sets')
                                const reps = read(exercise, 'reps')
                                const rir = read(exercise, 'rir')
                                const rest = formatRest(read(exercise, 'rest'))
                                const tips = read(exercise, 'tips')
                                const notes = read(exercise, 'notes')
                                const logged = loggedByExercise.get(exercise.id) ?? []
                                const prescription = [sets, reps].every(value => value !== null)
                                    ? `${sets} × ${reps}`
                                    : sets !== null ? `${sets} series` : reps !== null ? `${reps} reps` : null
                                const details = [
                                    rir !== null && `RIR ${rir}`,
                                    rest && `${rest} descanso`,
                                ].filter(Boolean) as string[]
                                const group = exercise.muscle_group ? MUSCLE_GROUP_LABELS[normalizeMuscleGroup(exercise.muscle_group)] : null

                                return (
                                    <li key={exercise.id} className="flex gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5">
                                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold tabular-nums text-muted-foreground ring-1 ring-border/70">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="min-w-0 text-sm font-semibold leading-snug">{exercise.exercise_name || 'Ejercicio sin nombre'}</p>
                                                {group && <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{group}</span>}
                                            </div>
                                            {(prescription || details.length > 0) && (
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {prescription && <span className="font-bold tabular-nums text-foreground">{prescription}</span>}
                                                    {prescription && details.length > 0 && ' · '}
                                                    {details.join(' · ')}
                                                </p>
                                            )}
                                            {(notes || tips) && (
                                                <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{notes ?? tips}</p>
                                            )}
                                            {logged.length > 0 && (
                                                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-success/10 px-1.5 py-1 text-[11px] font-medium text-success">
                                                    <span>Hecho <span className="font-normal opacity-70">(kg×reps)</span>:</span>
                                                    {logged.map((set, setIndex) => (
                                                        <span key={set.set_index} className="tabular-nums">
                                                            {set.weight_kg != null ? `${Number(set.weight_kg).toLocaleString('es-ES')}` : '—'}
                                                            {set.reps != null && `×${set.reps}`}
                                                            {setIndex < logged.length - 1 && <span className="ml-1.5 opacity-50">·</span>}
                                                        </span>
                                                    ))}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                    </section>
                )
            })}
        </div>
    )
}

function VolumeView({ metrics }: { metrics: MuscleVolumeMetric[] }) {
    if (metrics.length === 0) {
        return (
            <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium">Sin volumen clasificable en esta semana</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    Esta semana no tiene series cargadas. Los ejercicios sin grupo muscular cuentan como «Otros».
                </p>
            </div>
        )
    }

    const maxSets = Math.max(1, ...metrics.map(metric => metric.totalSets))

    return (
        <>
            <div className="hidden grid-cols-[minmax(0,9rem)_1fr_4.5rem_3.5rem] gap-3 px-4 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
                <span>Grupo</span>
                <span />
                <span className="text-right">Series</span>
                <span className="text-right">Frec.</span>
            </div>
            <ul className="divide-y divide-border/50 px-4 pb-2 sm:divide-y-0">
                {metrics.map(metric => (
                    <li key={metric.group} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,9rem)_1fr_4.5rem_3.5rem] sm:py-2">
                        <span className="col-start-1 row-start-1 truncate text-sm font-medium sm:col-start-auto sm:row-start-auto">{MUSCLE_GROUP_LABELS[metric.group]}</span>
                        <span className="col-span-3 col-start-1 row-start-2 h-1.5 overflow-hidden rounded-full bg-muted sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (metric.totalSets / maxSets) * 100)}%` }} />
                        </span>
                        <span className="col-start-2 row-start-1 text-right text-sm sm:col-start-auto sm:row-start-auto">
                            <span className="font-bold tabular-nums">{metric.totalSets}</span>
                            <span className="ml-1 text-xs text-muted-foreground sm:hidden">series</span>
                        </span>
                        <span className="col-start-3 row-start-1 text-right text-xs font-semibold tabular-nums text-muted-foreground sm:col-start-auto sm:row-start-auto" title="Días diferentes por semana">
                            {metric.frequency}×/sem
                        </span>
                    </li>
                ))}
            </ul>
        </>
    )
}
