'use client'

import { useState, useCallback } from 'react'
import { WeekSelector } from '@/components/routine/WeekSelector'
import { DayTabs } from '@/components/routine/DayTabs'
import { ExerciseTable } from '@/components/routine/ExerciseTable'
import { MobileExerciseCards } from '@/components/routine/MobileExerciseCards'
import { TrainingCell, TrainingProgram, TrainingDay, TrainingColumn, TrainingExercise } from '@/types/training'
import { useIsMobile } from '@/hooks/use-mobile'
import { Dumbbell } from 'lucide-react'
import { saveTrainingCell } from '@/data/client-schedule'

interface RoutinePageClientProps {
    program: TrainingProgram
    days: TrainingDay[]
    columns: TrainingColumn[]
    exercises: TrainingExercise[]
    initialCells: TrainingCell[]
    initialWeek?: number
    initialDayId?: string
}

export default function RoutinePageClient({
    program,
    days,
    columns,
    exercises,
    initialCells,
    initialWeek = 1,
    initialDayId,
}: RoutinePageClientProps) {
    const [selectedWeek, setSelectedWeek] = useState(initialWeek)
    const [selectedDayId, setSelectedDayId] = useState(initialDayId || days[0]?.id || '')
    const [cells, setCells] = useState<TrainingCell[]>(initialCells)
    const isMobile = useIsMobile()

    const dayExercises = exercises.filter(e => e.dayId === selectedDayId)

    const handleCellChange = useCallback(async (exerciseId: string, columnId: string, value: string) => {
        // Find existing cell
        const existing = cells.find(
            c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === selectedWeek
        )

        // Optimistic update
        setCells(prev => {
            const existingIndex = prev.findIndex(
                c => c.exerciseId === exerciseId && c.columnId === columnId && c.weekNumber === selectedWeek
            )

            if (existingIndex >= 0) {
                const updated = [...prev]
                updated[existingIndex] = { ...updated[existingIndex], value }
                return updated
            } else {
                return [...prev, {
                    id: `temp-${exerciseId}-${columnId}-${selectedWeek}`,
                    exerciseId,
                    columnId,
                    weekNumber: selectedWeek,
                    value
                }]
            }
        })

        // Save to DB
        await saveTrainingCell(
            exerciseId,
            columnId,
            selectedWeek,
            value,
            existing?.id?.startsWith('temp-') ? undefined : existing?.id
        )
    }, [selectedWeek, cells])

    return (
        <div className="min-h-screen">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Dumbbell className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">{program.name}</h1>
                            <p className="text-sm text-muted-foreground">
                                Programa de {program.totalWeeks} semanas
                            </p>
                        </div>
                    </div>
                </div>

                {/* Week selector */}
                <div className="px-4 pb-3">
                    <WeekSelector
                        totalWeeks={program.totalWeeks}
                        selectedWeek={selectedWeek}
                        onSelectWeek={setSelectedWeek}
                    />
                </div>

                {/* Day tabs */}
                <DayTabs
                    days={days}
                    selectedDayId={selectedDayId}
                    onSelectDay={setSelectedDayId}
                />
            </header>

            {/* Content */}
            <div className="py-4">
                {dayExercises.length > 0 ? (
                    isMobile ? (
                        <MobileExerciseCards
                            exercises={dayExercises}
                            columns={columns}
                            cells={cells}
                            weekNumber={selectedWeek}
                            onCellChange={handleCellChange}
                        />
                    ) : (
                        <ExerciseTable
                            exercises={dayExercises}
                            columns={columns}
                            cells={cells}
                            weekNumber={selectedWeek}
                            onCellChange={handleCellChange}
                        />
                    )
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <p className="text-sm text-muted-foreground">
                            No hay ejercicios para este día.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
