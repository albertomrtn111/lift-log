'use client'

import { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Dumbbell, Loader2 } from 'lucide-react'
import { ProgramSelector } from './ProgramSelector'
import { ProgressionTable } from './ProgressionTable'
import {
    getClientProgramsForSelector,
    getTrainingProgressData,
    type ProgramSummary,
    type TrainingProgressData,
} from '@/app/(coach)/coach/workspace/training-progress-actions'

interface TrainingProgressViewProps {
    clientId: string
    coachId: string
}

export function TrainingProgressView({ clientId, coachId }: TrainingProgressViewProps) {
    const [programs, setPrograms] = useState<ProgramSummary[]>([])
    const [selectedProgramId, setSelectedProgramId] = useState<string>('')
    const [progressData, setProgressData] = useState<TrainingProgressData | null>(null)
    const [loadingPrograms, setLoadingPrograms] = useState(true)
    const [loadingData, setLoadingData] = useState(false)

    // Load programs on mount
    useEffect(() => {
        async function load() {
            setLoadingPrograms(true)
            const result = await getClientProgramsForSelector(clientId)
            if (result.success && result.programs) {
                setPrograms(result.programs)
                // Pre-select active program or first
                const active = result.programs.find(p => p.status === 'active')
                const first = result.programs[0]
                const toSelect = active || first
                if (toSelect) setSelectedProgramId(toSelect.id)
            }
            setLoadingPrograms(false)
        }
        load()
    }, [clientId])

    // Load progression data when program changes
    const loadProgressData = useCallback(async (programId: string) => {
        if (!programId) return
        setLoadingData(true)
        const result = await getTrainingProgressData(programId)
        if (result.success && result.data) {
            setProgressData(result.data)
        } else {
            setProgressData(null)
        }
        setLoadingData(false)
    }, [])

    useEffect(() => {
        if (selectedProgramId) {
            loadProgressData(selectedProgramId)
        }
    }, [selectedProgramId, loadProgressData])

    // --- Loading programs skeleton ---
    if (loadingPrograms) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-[320px]" />
                <Skeleton className="h-[300px] rounded-xl" />
            </div>
        )
    }

    // --- No programs ---
    if (programs.length === 0) {
        return (
            <Card className="p-8">
                <div className="flex flex-col items-center justify-center text-center py-8">
                    <Dumbbell className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold text-lg">Sin programas de entrenamiento</h3>
                    <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                        Cuando se cree un programa de entrenamiento para este cliente, la progresión aparecerá aquí.
                    </p>
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            {/* Program selector */}
            <ProgramSelector
                programs={programs}
                selectedId={selectedProgramId}
                onSelect={setSelectedProgramId}
            />

            {/* Loading data */}
            {loadingData && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Data loaded */}
            {!loadingData && progressData && (
                <>
                    {/* Check if any sets exist */}
                    {progressData.days.every(d =>
                        d.exercises.every(e => Object.keys(e.setsByWeek).length === 0)
                    ) ? (
                        <Card className="p-8">
                            <div className="flex flex-col items-center justify-center text-center py-8">
                                <Dumbbell className="h-12 w-12 text-muted-foreground/30 mb-4" />
                                <h3 className="font-semibold text-lg">Sin datos de entrenamiento</h3>
                                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                                    El atleta aún no ha registrado entrenamientos en este programa.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <ProgressionTable
                            days={progressData.days}
                            maxWeek={progressData.maxWeek}
                        />
                    )}
                </>
            )}
        </div>
    )
}
