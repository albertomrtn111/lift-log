'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { WeekSelector } from '@/components/routine/WeekSelector'
import { DayTabs } from '@/components/routine/DayTabs'
import { ExerciseTable } from '@/components/routine/ExerciseTable'
import { MobileExerciseCards } from '@/components/routine/MobileExerciseCards'
import { TrainingCell, TrainingProgram, TrainingDay, TrainingColumn, TrainingExercise, ExerciseSet } from '@/types/training'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dumbbell } from 'lucide-react'
import { saveTrainingCell, autoMarkStrengthDayComplete } from '@/data/client-schedule'
import { generateOrApplySets, updateSingleSet, revertSetToBase, addSetFromBase, deleteExerciseSet } from '@/data/exercise-sets'

interface RoutinePageClientProps {
    clientId: string
    program: TrainingProgram
    days: TrainingDay[]
    columns: TrainingColumn[]
    exercises: TrainingExercise[]
    initialCells: TrainingCell[]
    initialSets: ExerciseSet[]
    initialWeek?: number
    initialDayId?: string
    initialSessionDate?: string
}

export default function RoutinePageClient({
    clientId,
    program,
    days,
    columns,
    exercises,
    initialCells,
    initialSets,
    initialWeek = 1,
    initialDayId,
    initialSessionDate,
}: RoutinePageClientProps) {
    const [selectedWeek, setSelectedWeek] = useState(initialWeek)
    const [selectedDayId, setSelectedDayId] = useState(initialDayId || days[0]?.id || '')
    const [cells, setCells] = useState<TrainingCell[]>(initialCells)
    const [sets, setSets] = useState<ExerciseSet[]>(initialSets)
    const markedDays = useRef<Set<string>>(new Set())
    const router = useRouter()

    const dayExercises = exercises.filter(e => e.dayId === selectedDayId)

    const getSessionDate = useCallback(() => {
        if (initialSessionDate && selectedDayId === initialDayId && selectedWeek === initialWeek) {
            return initialSessionDate
        }

        const selectedDay = days.find(day => day.id === selectedDayId)
        const defaultWeekday = selectedDay?.defaultWeekday ?? selectedDay?.default_weekday
        if (!defaultWeekday) return undefined

        const programStart = new Date(`${program.effectiveFrom}T12:00:00`)
        const weekStart = new Date(programStart)
        weekStart.setDate(weekStart.getDate() + ((selectedWeek - 1) * 7))
        const mondayOffset = (weekStart.getDay() + 6) % 7
        weekStart.setDate(weekStart.getDate() - mondayOffset)

        const sessionDate = new Date(weekStart)
        sessionDate.setDate(weekStart.getDate() + defaultWeekday - 1)
        const y = sessionDate.getFullYear()
        const m = String(sessionDate.getMonth() + 1).padStart(2, '0')
        const d = String(sessionDate.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }, [days, initialDayId, initialSessionDate, initialWeek, program.effectiveFrom, selectedDayId, selectedWeek])

    const markCurrentDayComplete = useCallback(async () => {
        if (!selectedDayId) return

        const sessionDate = getSessionDate()
        const markKey = `${selectedDayId}-${selectedWeek}-${sessionDate || 'today'}`
        if (markedDays.current.has(markKey)) return

        markedDays.current.add(markKey)
        const result = await autoMarkStrengthDayComplete(clientId, program.id, selectedDayId, sessionDate)
        if (!result.success) {
            console.error('[RoutinePageClient] Could not mark strength day complete:', result.error)
        }
        router.refresh()
    }, [clientId, getSessionDate, program.id, router, selectedDayId, selectedWeek])

    // ─── Cell handlers (legacy) ─────────────────────────────────
    const handleCellChange = useCallback(async (exerciseId: string, columnId: string, value: string) => {
        const existing = cells.find(
            c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === selectedWeek
        )

        setCells(prev => {
            const idx = prev.findIndex(
                c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === selectedWeek
            )
            if (idx >= 0) {
                const updated = [...prev]
                updated[idx] = { ...updated[idx], value }
                return updated
            }
            return [...prev, { id: `temp-${exerciseId}-${columnId}-${selectedWeek}`, exerciseId, columnId, weekNumber: selectedWeek, value }]
        })

        const result = await saveTrainingCell(exerciseId, columnId, selectedWeek, value, existing?.id?.startsWith('temp-') ? undefined : existing?.id)
        if (result.success) {
            await markCurrentDayComplete()
        }
    }, [selectedWeek, cells, markCurrentDayComplete])

    // ─── Base Block: Generate / Apply ───────────────────────────
    const handleGenerateSets = useCallback(async (
        exerciseId: string,
        baseSeries: number,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        const result = await generateOrApplySets(exerciseId, selectedWeek, baseSeries, baseWeight, baseReps, baseRir)
        if (result.success && result.sets) {
            setSets(prev => [
                ...prev.filter(s => !(s.exerciseId === exerciseId && s.weekNumber === selectedWeek)),
                ...result.sets!
            ])
            await markCurrentDayComplete()
        }
        return result
    }, [selectedWeek, markCurrentDayComplete])

    // ─── Single set update (marks override) ─────────────────────
    const handleSetUpdate = useCallback(async (
        setId: string,
        payload: { weightKg?: number | null; reps?: number | null; rir?: number | null }
    ) => {
        // Optimistic
        setSets(prev => prev.map(s => {
            if (s.id !== setId) return s
            return {
                ...s,
                ...(payload.weightKg !== undefined ? { weightKg: payload.weightKg } : {}),
                ...(payload.reps !== undefined ? { reps: payload.reps } : {}),
                ...(payload.rir !== undefined ? { rir: payload.rir } : {}),
                isOverride: true,
            }
        }))

        const result = await updateSingleSet(setId, payload)
        if (result.success) {
            await markCurrentDayComplete()
        }
    }, [markCurrentDayComplete])

    // ─── Revert override ────────────────────────────────────────
    const handleRevertSet = useCallback(async (
        setId: string,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        // Optimistic
        setSets(prev => prev.map(s => {
            if (s.id !== setId) return s
            return { ...s, weightKg: baseWeight, reps: baseReps, rir: baseRir, isOverride: false }
        }))

        await revertSetToBase(setId, baseWeight, baseReps, baseRir)
    }, [])

    // ─── Add one more set from base ─────────────────────────────
    const handleAddSet = useCallback(async (
        exerciseId: string,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        const result = await addSetFromBase(exerciseId, selectedWeek, baseWeight, baseReps, baseRir)
        if (result.success && result.set) {
            setSets(prev => [...prev, result.set!])
            await markCurrentDayComplete()
        }
        return result
    }, [selectedWeek, markCurrentDayComplete])

    // ─── Delete set ─────────────────────────────────────────────
    const handleDeleteSet = useCallback(async (setId: string) => {
        setSets(prev => prev.filter(s => s.id !== setId))
        await deleteExerciseSet(setId)
    }, [])

    const sharedProps = {
        exercises: dayExercises,
        columns,
        cells,
        sets,
        weekNumber: selectedWeek,
        onCellChange: handleCellChange,
        onGenerateSets: handleGenerateSets,
        onSetUpdate: handleSetUpdate,
        onRevertSet: handleRevertSet,
        onAddSet: handleAddSet,
        onDeleteSet: handleDeleteSet,
    }

    const selectedDay = days.find(day => day.id === selectedDayId)
    const sessionDate = getSessionDate()
    const sessionDateLabel = sessionDate
        ? capitalize(format(new Date(`${sessionDate}T12:00:00`), "EEEE d 'de' MMMM", { locale: es }))
        : undefined

    return (
        <div className="app-mobile-page min-h-screen">
            <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
                <div className="px-4 pb-3 pt-4">
                    <div className="flex min-h-10 items-end pr-24">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fuerza</p>
                            <h1 className="line-clamp-2 text-xl font-bold leading-tight tracking-tight text-foreground">{program.name}</h1>
                        </div>
                    </div>
                    <WeekSelector
                        className="mt-3"
                        totalWeeks={program.totalWeeks}
                        selectedWeek={selectedWeek}
                        onSelectWeek={setSelectedWeek}
                    />
                </div>
                <DayTabs days={days} selectedDayId={selectedDayId} onSelectDay={setSelectedDayId} />
            </header>

            <div className="pb-6 pt-4">
                {dayExercises.length > 0 ? (
                    <>
                        {/* Se decide por CSS (no con useIsMobile) para que en móvil no
                            se pinte primero la tabla de escritorio y luego salte */}
                        <div className="md:hidden">
                            <MobileExerciseCards {...sharedProps} dayName={selectedDay?.name} sessionDateLabel={sessionDateLabel} />
                        </div>
                        <div className="hidden md:block">
                            <ExerciseTable {...sharedProps} />
                        </div>
                    </>
                ) : (
                    <div className="mx-4 flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                            <Dumbbell className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-semibold">Sin ejercicios</p>
                        <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
                            Tu coach aún no ha añadido ejercicios a este día.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}
