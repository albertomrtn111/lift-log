'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { WeekSelector } from '@/components/routine/WeekSelector'
import { DayTabs } from '@/components/routine/DayTabs'
import { ExerciseTable } from '@/components/routine/ExerciseTable'
import { MobileExerciseCards } from '@/components/routine/MobileExerciseCards'
import { TrainingCell, TrainingProgram, TrainingDay, TrainingColumn, TrainingExercise, ExerciseSet } from '@/types/training'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarX2, Dumbbell } from 'lucide-react'
import { autoMarkStrengthDayComplete } from '@/data/client-schedule'
import { programDayDate } from '@/lib/training/strength-week-skips'
import { isAthleteNotesColumn } from '@/lib/training/exercise-notes'
import { tempSetId } from '@/lib/training/strength-save-queue'
import { ClientEmptyState } from '@/components/ui/client-empty-state'
import { PendingSaveBanner } from '@/components/routine/PendingSaveBanner'
import { useAthleteLiveRefresh } from '@/hooks/useAthleteLiveRefresh'
import { useStrengthSaveQueue, type StrengthMarkDay } from '@/hooks/useStrengthSaveQueue'

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
    const markedDays = useRef<Set<string>>(new Set())
    const router = useRouter()

    /** El servidor confirmó algo que cuenta como entrenar: el día se da por hecho. */
    const markDayComplete = useCallback(async (markDay: StrengthMarkDay) => {
        const markKey = `${markDay.dayId}-${markDay.week}-${markDay.sessionDate || 'today'}`
        if (markedDays.current.has(markKey)) return
        markedDays.current.add(markKey)
        try {
            const result = await autoMarkStrengthDayComplete(clientId, markDay.programId, markDay.dayId, markDay.sessionDate)
            if (!result.success) {
                console.error('[RoutinePageClient] Could not mark strength day complete:', result.error)
            }
            router.refresh()
        } catch (error) {
            // Sin conexión: se vuelve a intentar con el próximo guardado
            markedDays.current.delete(markKey)
            console.error('[RoutinePageClient] Could not mark strength day complete:', error)
        }
    }, [clientId, router])

    // Series y casillas: lo del servidor con lo pendiente (sin conexión) encima
    const saveQueue = useStrengthSaveQueue({ clientId, initialSets, initialCells, onSaved: markDayComplete })
    const { sets, cells, enqueue, flush, refreshSets } = saveQueue

    const exerciseIdsKey = exercises.map(e => e.id).join(',')

    /** Relee las series de la BD; lo pendiente de guardar sigue encima. */
    const reloadSets = useCallback(async () => {
        await refreshSets(exerciseIdsKey ? exerciseIdsKey.split(',') : [])
    }, [exerciseIdsKey, refreshSets])

    // Al volver con atrás/adelante Next reutiliza la página que tenía en memoria,
    // con las series de entonces: se releen al entrar (y si el coach cambia los
    // ejercicios) para no perder lo apuntado.
    useEffect(() => { void reloadSets() }, [reloadSets])

    // Vuelta a la app, vuelta de la red o cambios del coach: primero se envía lo
    // pendiente y después se relee. Sin red no se pide la página al servidor (si
    // falla, Next recarga la página entera).
    useAthleteLiveRefresh(() => {
        void flush().finally(() => {
            if (typeof navigator === 'undefined' || navigator.onLine !== false) router.refresh()
            void reloadSets()
        })
    }, ['training'])

    // Días que el coach quitó en la semana elegida: esa semana no aparecen.
    const skippedThisWeek = new Set(
        (program.skippedDays ?? []).filter(skip => skip.week === selectedWeek).map(skip => skip.dayId)
    )
    const weekDays = days.filter(day => !skippedThisWeek.has(day.id))
    const weekDayIds = weekDays.map(day => day.id).join(',')
    const visibleDayId = weekDays.some(day => day.id === selectedDayId) ? selectedDayId : (weekDays[0]?.id ?? '')

    // Si el día elegido está quitado esa semana, pasa al primero que sí toca.
    useEffect(() => {
        if (visibleDayId && visibleDayId !== selectedDayId) setSelectedDayId(visibleDayId)
    }, [visibleDayId, selectedDayId, weekDayIds])

    const dayExercises = weekDays.length > 0 ? exercises.filter(e => e.dayId === visibleDayId) : []

    const getSessionDate = useCallback(() => {
        if (initialSessionDate && selectedDayId === initialDayId && selectedWeek === initialWeek) {
            return initialSessionDate
        }

        const selectedDay = days.find(day => day.id === selectedDayId)
        const defaultWeekday = selectedDay?.defaultWeekday ?? selectedDay?.default_weekday
        // Misma cuenta que el servidor, con fechas sin hora.
        return programDayDate(program.effectiveFrom, selectedWeek, defaultWeekday) ?? undefined
    }, [days, initialDayId, initialSessionDate, initialWeek, program.effectiveFrom, selectedDayId, selectedWeek])

    /** Día que se dará por hecho cuando el servidor confirme el cambio */
    const currentMarkDay = useCallback((): StrengthMarkDay | undefined => {
        if (!selectedDayId) return undefined
        return { programId: program.id, dayId: selectedDayId, week: selectedWeek, sessionDate: getSessionDate() }
    }, [getSessionDate, program.id, selectedDayId, selectedWeek])

    // Cada cambio se ve al momento y entra en la cola: si no hay cobertura se
    // queda pendiente y se envía solo al volver la red (useStrengthSaveQueue).

    // ─── Cell handlers (legacy y notas) ─────────────────────────
    const handleCellChange = useCallback(async (exerciseId: string, columnId: string, value: string): Promise<boolean> => {
        // Una nota no es haber entrenado: no da el día por hecho
        const column = columns.find(c => c.id === columnId)
        enqueue({
            kind: 'cell', exerciseId, columnId, week: selectedWeek, value,
            markDay: isAthleteNotesColumn(column) ? undefined : currentMarkDay(),
        })
        return true
    }, [columns, currentMarkDay, enqueue, selectedWeek])

    // ─── Base Block: Generate / Apply ───────────────────────────
    const handleGenerateSets = useCallback(async (
        exerciseId: string,
        baseSeries: number,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        enqueue({
            kind: 'generate', exerciseId, week: selectedWeek, series: baseSeries,
            weightKg: baseWeight, reps: baseReps, rir: baseRir, markDay: currentMarkDay(),
        })
        return { success: true }
    }, [currentMarkDay, enqueue, selectedWeek])

    // ─── Single set update (marks override) ─────────────────────
    const handleSetUpdate = useCallback(async (
        setId: string,
        payload: { weightKg?: number | null; reps?: number | null; rir?: number | null }
    ) => {
        const target = sets.find(s => s.id === setId)
        enqueue({
            kind: 'set', setId, exerciseId: target?.exerciseId, week: target?.weekNumber,
            values: payload, override: true, markDay: currentMarkDay(),
        })
    }, [currentMarkDay, enqueue, sets])

    // ─── Revert override ────────────────────────────────────────
    const handleRevertSet = useCallback(async (
        setId: string,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        const target = sets.find(s => s.id === setId)
        enqueue({
            kind: 'set', setId, exerciseId: target?.exerciseId, week: target?.weekNumber,
            values: { weightKg: baseWeight, reps: baseReps, rir: baseRir }, override: false,
        })
    }, [enqueue, sets])

    // ─── Add one more set from base ─────────────────────────────
    const handleAddSet = useCallback(async (
        exerciseId: string,
        baseWeight: number | null,
        baseReps: number | null,
        baseRir: number | null
    ) => {
        // Número fijo: si el envío se repite, el servidor no crea otra serie
        const mine = sets.filter(s => s.exerciseId === exerciseId && s.weekNumber === selectedWeek)
        const setIndex = mine.reduce((max, s) => Math.max(max, s.setIndex), -1) + 1
        enqueue({
            kind: 'add', exerciseId, week: selectedWeek, setIndex,
            tempId: tempSetId(exerciseId, selectedWeek, setIndex),
            weightKg: baseWeight, reps: baseReps, rir: baseRir, markDay: currentMarkDay(),
        })
        return { success: true }
    }, [currentMarkDay, enqueue, selectedWeek, sets])

    // ─── Delete set ─────────────────────────────────────────────
    const handleDeleteSet = useCallback(async (setId: string) => {
        enqueue({ kind: 'delete', setId })
    }, [enqueue])

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

    const selectedDay = days.find(day => day.id === visibleDayId)
    const sessionDate = getSessionDate()
    const sessionDateLabel = sessionDate
        ? capitalize(format(new Date(`${sessionDate}T12:00:00`), "EEEE d 'de' MMMM", { locale: es }))
        : undefined

    return (
        <div className="app-mobile-page min-h-screen">
            <header className="app-mobile-title">
                <div className="px-4 pt-4">
                    <div className="flex min-h-10 items-end pr-24">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fuerza</p>
                            <h1 className="line-clamp-2 text-xl font-bold leading-tight tracking-tight text-foreground">{program.name}</h1>
                        </div>
                    </div>
                </div>
            </header>

            <div className="app-mobile-header app-mobile-header--below-title border-b border-border/60">
                <div className="px-4 pb-3 pt-3">
                    <WeekSelector
                        totalWeeks={program.totalWeeks}
                        selectedWeek={selectedWeek}
                        onSelectWeek={setSelectedWeek}
                    />
                </div>
                {weekDays.length > 0 && (
                    <DayTabs days={weekDays} selectedDayId={visibleDayId} onSelectDay={setSelectedDayId} />
                )}
            </div>

            {/* Con el aviso flotante, hueco abajo para que no tape la última serie */}
            <div className={saveQueue.pendingCount > 0 ? 'pb-28 pt-4 md:pb-6' : 'pb-6 pt-4'}>
                <PendingSaveBanner
                    status={saveQueue.status}
                    pendingCount={saveQueue.pendingCount}
                    onRetry={() => { void flush() }}
                    className="md:mx-4 md:mb-3"
                />
                {weekDays.length === 0 ? (
                    <ClientEmptyState
                        icon={CalendarX2}
                        title="Semana sin fuerza"
                        description="Tu coach ha quitado los entrenos de fuerza de esta semana."
                        className="mx-4"
                    />
                ) : dayExercises.length > 0 ? (
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
                    <ClientEmptyState
                        icon={Dumbbell}
                        title="Sin ejercicios"
                        description="Tu coach aún no ha añadido ejercicios a este día."
                        className="mx-4"
                    />
                )}
            </div>
        </div>
    )
}

function capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1)
}
