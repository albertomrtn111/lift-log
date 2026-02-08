'use client'

import { useState, useCallback } from 'react'
import { mockProgram, mockDays, mockColumns, mockExercises, generateMockCells } from '@/data/mockData'
import { WeekSelector } from '@/components/routine/WeekSelector'
import { DayTabs } from '@/components/routine/DayTabs'
import { ExerciseTable } from '@/components/routine/ExerciseTable'
import { MobileExerciseCards } from '@/components/routine/MobileExerciseCards'
import { TrainingCell } from '@/types/training'
import { useIsMobile } from '@/hooks/use-mobile'
import { Dumbbell } from 'lucide-react'

export default function RoutinePage() {
    const [selectedWeek, setSelectedWeek] = useState(1)
    const [selectedDayId, setSelectedDayId] = useState(mockDays[0].id)
    const [cells, setCells] = useState<TrainingCell[]>(generateMockCells())
    const isMobile = useIsMobile()

    const dayExercises = mockExercises.filter(e => e.dayId === selectedDayId)

    const handleCellChange = useCallback((exerciseId: string, columnId: string, value: string) => {
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
                    id: `${exerciseId}-${columnId}-${selectedWeek}`,
                    exerciseId,
                    columnId,
                    weekNumber: selectedWeek,
                    value
                }]
            }
        })
    }, [selectedWeek])

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
                            <h1 className="text-lg font-bold text-foreground">{mockProgram.name}</h1>
                            <p className="text-sm text-muted-foreground">
                                Programa de {mockProgram.totalWeeks} semanas
                            </p>
                        </div>
                    </div>
                </div>

                {/* Week selector */}
                <div className="px-4 pb-3">
                    <WeekSelector
                        totalWeeks={mockProgram.totalWeeks}
                        selectedWeek={selectedWeek}
                        onSelectWeek={setSelectedWeek}
                    />
                </div>

                {/* Day tabs */}
                <DayTabs
                    days={mockDays}
                    selectedDayId={selectedDayId}
                    onSelectDay={setSelectedDayId}
                />
            </header>

            {/* Content */}
            <div className="py-4">
                {isMobile ? (
                    <MobileExerciseCards
                        exercises={dayExercises}
                        columns={mockColumns}
                        cells={cells}
                        weekNumber={selectedWeek}
                        onCellChange={handleCellChange}
                    />
                ) : (
                    <ExerciseTable
                        exercises={dayExercises}
                        columns={mockColumns}
                        cells={cells}
                        weekNumber={selectedWeek}
                        onCellChange={handleCellChange}
                    />
                )}
            </div>
        </div>
    )
}
