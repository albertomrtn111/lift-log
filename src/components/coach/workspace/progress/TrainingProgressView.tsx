'use client'

import { useState, useEffect, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Dumbbell, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ProgramSelector } from './ProgramSelector'
import { ProgressionTable } from './ProgressionTable'
import { TrainingProgressAIAnalysisCard } from './TrainingProgressAIAnalysisCard'
import {
    analyzeTrainingProgressAction,
    getClientProgramsForSelector,
    getTrainingProgressData,
    type AnalyzeTrainingProgressResponse,
    type ProgramSummary,
    type TrainingProgressData,
} from '@/app/(coach)/coach/workspace/training-progress-actions'
import type { TrainingProgressAIAnalysis } from '@/lib/ai/analyze-training-progress'

interface TrainingProgressViewProps {
    clientId: string
    coachId: string
}

export function TrainingProgressView({ clientId, coachId }: TrainingProgressViewProps) {
    const { toast } = useToast()
    const [programs, setPrograms] = useState<ProgramSummary[]>([])
    const [selectedProgramId, setSelectedProgramId] = useState<string>('')
    const [progressData, setProgressData] = useState<TrainingProgressData | null>(null)
    const [loadingPrograms, setLoadingPrograms] = useState(true)
    const [loadingData, setLoadingData] = useState(false)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [coachInstruction, setCoachInstruction] = useState('')
    const [analysis, setAnalysis] = useState<TrainingProgressAIAnalysis | null>(null)
    const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string>('')
    const [analysisInstruction, setAnalysisInstruction] = useState('')
    const [analysisError, setAnalysisError] = useState<string | null>(null)
    const [analyzing, setAnalyzing] = useState(false)

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
            setAnalysis(null)
            setAnalysisGeneratedAt('')
            setAnalysisInstruction('')
            setAnalysisError(null)
            loadProgressData(selectedProgramId)
        }
    }, [selectedProgramId, loadProgressData])

    const hasTrackedTrainingData = !!progressData && progressData.days.some((day) =>
        day.exercises.some((exercise) =>
            Object.values(exercise.setsByWeek).some((sets) => sets.length > 0)
        )
    )

    const runAnalysis = useCallback(async (instruction?: string) => {
        if (!selectedProgramId) return

        setAnalyzing(true)
        setAnalysisError(null)

        const result: AnalyzeTrainingProgressResponse = await analyzeTrainingProgressAction({
            coachId,
            clientId,
            programId: selectedProgramId,
            coachInstruction: instruction?.trim() || undefined,
        })

        if (result.success && result.analysis) {
            setAnalysis(result.analysis)
            setAnalysisGeneratedAt(new Date().toISOString())
            setAnalysisInstruction(instruction?.trim() || '')
            setSheetOpen(false)
            toast({
                title: 'Análisis IA generado',
                description: 'Ya tienes una lectura del progreso del entrenamiento lista para revisar.',
            })
        } else {
            const message = result.error || 'No se pudo generar el análisis.'
            setAnalysisError(message)
            toast({
                title: 'Error al analizar',
                description: message,
                variant: 'destructive',
            })
        }

        setAnalyzing(false)
    }, [selectedProgramId, coachId, clientId, toast])

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
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <ProgramSelector
                    programs={programs}
                    selectedId={selectedProgramId}
                    onSelect={setSelectedProgramId}
                />

                <div className="flex items-center gap-2">
                    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                        <Button
                            onClick={() => setSheetOpen(true)}
                            disabled={!hasTrackedTrainingData || loadingData}
                            className="gap-2"
                        >
                            <Sparkles className="h-4 w-4" />
                            Analizar con IA
                        </Button>

                        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                            <SheetHeader>
                                <SheetTitle>Análisis IA del progreso</SheetTitle>
                                <SheetDescription>
                                    Lanza una lectura inteligente del programa actual. Puedes dejarlo general o añadir un foco concreto para orientar el análisis.
                                </SheetDescription>
                            </SheetHeader>

                            <div className="mt-6 space-y-5">
                                <div className="rounded-xl border bg-muted/30 p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/15">
                                            Programa seleccionado
                                        </Badge>
                                    </div>
                                    <p className="font-medium">{progressData?.program.name || 'Programa actual'}</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        La IA analizará semanas, ejercicios, sets, cargas, repeticiones y esfuerzo registrado del programa {progressData?.program.name ? `"${progressData.program.name}"` : 'seleccionado'}.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="training-ai-instruction">Instrucción opcional del coach</Label>
                                    <Textarea
                                        id="training-ai-instruction"
                                        value={coachInstruction}
                                        onChange={(event) => setCoachInstruction(event.target.value)}
                                        placeholder="Ej: Analiza especialmente si ha progresado en la sentadilla y si ya tocaría una descarga."
                                        className="min-h-[140px]"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Si no escribes nada, la IA hará un análisis general del bloque. Si escribes algo, lo tratará como prioridad explícita.
                                    </p>
                                </div>

                                {analysisError && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="h-4 w-4 mt-0.5" />
                                            <span>{analysisError}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <SheetFooter className="mt-6">
                                <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={analyzing}>
                                    Cancelar
                                </Button>
                                <Button onClick={() => runAnalysis(coachInstruction)} disabled={analyzing || !hasTrackedTrainingData}>
                                    {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    Generar análisis
                                </Button>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {analysis && analysisGeneratedAt && (
                <TrainingProgressAIAnalysisCard
                    analysis={analysis}
                    coachInstruction={analysisInstruction}
                    generatedAt={analysisGeneratedAt}
                    isRegenerating={analyzing}
                    onRegenerate={() => runAnalysis(analysisInstruction)}
                />
            )}

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
                                <p className="text-xs text-muted-foreground mt-3">
                                    Cuando haya semanas registradas, podrás lanzar un análisis IA del progreso desde aquí.
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
