'use client'

import { useState, useTransition, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrainingProgram } from '@/data/workspace'
import { TrainingProgramsHistory } from './plan/TrainingProgramsHistory'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Dumbbell,
    Plus,
    Utensils,
    FlaskConical,
    Settings2,
    CalendarDays,
    MoreVertical,
    Archive,
    Loader2 as Loader2Icon,
    BarChart3,
    Layers3,
} from 'lucide-react'
import { activateTrainingProgramAction, archiveTrainingProgramAction } from './actions'
import { createTrainingProgramClient } from './clientActions'
import { TrainingProgramWizard } from './plan/TrainingProgramWizard'
import { AITrainingDialog } from './plan/AITrainingDialog'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { PlanningTab } from './PlanningTab'
import { DietTab } from '../tabs/DietTab'
import type { StrengthStructure } from '@/types/templates'
import { SupplementsPanel } from './plan/SupplementsPanel'
import { MUSCLE_GROUP_LABELS, normalizeMuscleGroup, type MuscleGroup } from '@/lib/training/muscle-groups'

type ProgramSummaryDetail = {
    days: Array<{ id: string; name: string }>
    exercises: Array<{ id: string; day_id: string; muscle_group?: string | null; sets?: number | null }>
    columns: Array<{ id: string; key?: string | null; label?: string | null }>
    cells: Array<{ exercise_id: string; column_id: string; week_index: number; value: any }>
}

function MuscleVolumeSummary({
    totalWeeks,
    activeWeek,
    onWeekChange,
    metrics,
}: {
    totalWeeks: number
    activeWeek: number
    onWeekChange: (week: number) => void
    metrics: MuscleVolumeMetric[]
}) {
    return (
        <div className="space-y-4 rounded-2xl border border-primary/10 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5">
                        <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                        <h4 className="font-semibold">Volumen muscular semanal</h4>
                        <p className="text-sm text-muted-foreground">
                            Series y frecuencia por grupo muscular en la semana activa del programa.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Semana visible
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: Math.max(totalWeeks, 1) }).map((_, index) => {
                            const week = index + 1
                            return (
                                <Button
                                    key={week}
                                    type="button"
                                    variant={activeWeek === week ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-8 rounded-full px-3"
                                    onClick={() => onWeekChange(week)}
                                >
                                    W{week}
                                </Button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {metrics.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {metrics.map((metric) => (
                        <Card key={metric.group} className="border-primary/10 shadow-sm">
                            <div className="flex items-start justify-between gap-3 p-4">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Grupo muscular
                                    </p>
                                    <h5 className="mt-2 text-lg font-semibold">{MUSCLE_GROUP_LABELS[metric.group]}</h5>
                                </div>
                                <div className="rounded-xl bg-primary/10 p-2">
                                    <Layers3 className="h-4 w-4 text-primary" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 border-t px-4 py-4">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Series
                                    </p>
                                    <p className="mt-2 text-2xl font-bold tabular-nums">{metric.totalSets}</p>
                                    <p className="text-xs text-muted-foreground">Totales en la semana</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                        Frecuencia
                                    </p>
                                    <p className="mt-2 text-2xl font-bold tabular-nums">{metric.frequency}x</p>
                                    <p className="text-xs text-muted-foreground">Días diferentes / semana</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Sin volumen clasificable en esta semana</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Si esta semana no tiene series cargadas, el bloque se mantiene limpio. Los ejercicios sin grupo se normalizan como “Otros”.
                    </p>
                </div>
            )}
        </div>
    )
}

type MuscleVolumeMetric = {
    group: MuscleGroup
    totalSets: number
    frequency: number
}

function getDerivedProgramWeek(effectiveFrom: string | null | undefined, totalWeeks: number) {
    if (!effectiveFrom || totalWeeks <= 1) return 1

    const start = new Date(`${effectiveFrom}T12:00:00`)
    const now = new Date()
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset)

    const today = new Date(now)
    const todayOffset = (today.getDay() + 6) % 7
    today.setDate(today.getDate() - todayOffset)

    const diffMs = today.getTime() - start.getTime()
    const week = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7)) + 1
    return Math.min(Math.max(week, 1), totalWeeks)
}

function getCellScalarValue(value: any) {
    if (value == null) return null
    if (typeof value === 'object' && 'value' in value) return value.value
    return value
}

function parseSeriesValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim()
        if (!normalized) return 0
        const parsed = Number(normalized)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function buildMuscleVolumeMetrics(detail: ProgramSummaryDetail | null, weekIndex: number): MuscleVolumeMetric[] {
    if (!detail) return []

    const setsColumn = detail.columns.find((column) => column.key === 'sets')
        ?? detail.columns.find((column) => column.label?.toLowerCase() === 'series')

    const cellsByExercise = new Map<string, Map<string, any>>()
    for (const cell of detail.cells) {
        if (cell.week_index !== weekIndex) continue
        const current = cellsByExercise.get(cell.exercise_id) || new Map<string, any>()
        current.set(cell.column_id, getCellScalarValue(cell.value))
        cellsByExercise.set(cell.exercise_id, current)
    }

    const metricsMap = new Map<MuscleGroup, { totalSets: number; dayIds: Set<string> }>()

    for (const exercise of detail.exercises) {
        const group = normalizeMuscleGroup(exercise.muscle_group)
        const cellValue = setsColumn ? cellsByExercise.get(exercise.id)?.get(setsColumn.id) : null
        const totalSets = parseSeriesValue(cellValue ?? exercise.sets ?? 0)

        if (totalSets <= 0) continue

        const bucket = metricsMap.get(group) || { totalSets: 0, dayIds: new Set<string>() }
        bucket.totalSets += totalSets
        bucket.dayIds.add(exercise.day_id)
        metricsMap.set(group, bucket)
    }

    return Array.from(metricsMap.entries())
        .map(([group, value]) => ({
            group,
            totalSets: value.totalSets,
            frequency: value.dayIds.size,
        }))
        .sort((a, b) => {
            if (b.totalSets !== a.totalSets) return b.totalSets - a.totalSets
            return MUSCLE_GROUP_LABELS[a.group].localeCompare(MUSCLE_GROUP_LABELS[b.group], 'es')
        })
}

interface PlanTabProps {
    coachId: string
    clientId: string
    activeProgram: TrainingProgram | null
    programs: TrainingProgram[]
    onRefresh: () => void
}

export function PlanTab({
    coachId,
    clientId,
    activeProgram,
    programs,
    onRefresh
}: PlanTabProps) {
    const [activeSubTab, setActiveSubTab] = useState('schedule')

    return (
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
            <TabsList className="workspace-tabs-list gap-3 sm:gap-4 pb-px">
                <TabsTrigger
                    value="schedule"
                    className="workspace-tab-trigger sm:min-w-[9.5rem]"
                >
                    <CalendarDays className="h-4 w-4" />
                    Planificación
                </TabsTrigger>
                <TabsTrigger
                    value="training"
                    className="workspace-tab-trigger sm:min-w-[8rem]"
                >
                    <Dumbbell className="h-4 w-4" />
                    Fuerza
                </TabsTrigger>
                <TabsTrigger
                    value="diet"
                    className="workspace-tab-trigger sm:min-w-[8.5rem]"
                >
                    <Utensils className="h-4 w-4" />
                    Nutrición
                </TabsTrigger>
                <TabsTrigger
                    value="supplements"
                    className="workspace-tab-trigger sm:min-w-[10rem]"
                >
                    <FlaskConical className="h-4 w-4" />
                    Suplementación
                </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule" className="mt-0">
                <PlanningTab
                    clientId={clientId}
                    coachId={coachId}
                    onEditProgram={() => setActiveSubTab('training')}
                />
            </TabsContent>

            <TabsContent value="training" className="mt-0">
                <EntrenoSubtab
                    coachId={coachId}
                    clientId={clientId}
                    activeProgram={activeProgram}
                    allPrograms={programs}
                    onRefresh={onRefresh}
                />
            </TabsContent>

            <TabsContent value="diet" className="mt-0">
                <DietTab clientId={clientId} coachId={coachId} />
            </TabsContent>

            <TabsContent value="supplements" className="mt-0">
                <SupplementsPanel clientId={clientId} coachId={coachId} />
            </TabsContent>
        </Tabs>
    )
}

// ============================================================================
// ENTRENO SUBTAB (Logic reused from previous PlanTab)
// ============================================================================

function EntrenoSubtab({
    coachId,
    clientId,
    activeProgram,
    allPrograms,
    onRefresh
}: {
    coachId: string
    clientId: string
    activeProgram: TrainingProgram | null
    allPrograms: TrainingProgram[]
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [showCreate, setShowCreate] = useState(false)
    const [wizardConfig, setWizardConfig] = useState<{ isOpen: boolean, programId: string | null, step: number }>({
        isOpen: false,
        programId: null,
        step: 1
    })
    const [lastError, setLastError] = useState<string | null>(null)
    const [newProgram, setNewProgram] = useState<{
        name: string
        weeks: number
        daysInput: string
    }>({
        name: '',
        weeks: 4,
        daysInput: 'Día 1, Día 2, Día 3, Día 4',
    })
    const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
    const [isArchiving, setIsArchiving] = useState(false)

    // AI state
    const [pendingAIStructure, setPendingAIStructure] = useState<StrengthStructure | null>(null)
    const [pendingAIName, setPendingAIName] = useState<string | null>(null)
    const [programSummaryDetail, setProgramSummaryDetail] = useState<ProgramSummaryDetail | null>(null)
    const [summaryWeek, setSummaryWeek] = useState(1)
    const [existingExercises, setExistingExercises] = useState<Array<{
        dayName: string; exerciseName: string; sets?: number | null
        reps?: string | null; rir?: string | null; restSeconds?: number | null; notes?: string | null
    }>>([])

    // Load existing exercises for AI context when active program changes
    useEffect(() => {
        if (!activeProgram) {
            setExistingExercises([])
            setProgramSummaryDetail(null)
            setSummaryWeek(1)
            return
        }
        const supabase = createClient()
        Promise.all([
            supabase.from('training_days').select('id, name').eq('program_id', activeProgram.id),
            supabase.from('training_exercises').select('day_id, exercise_name, sets, reps, rir, rest_seconds, notes').eq('program_id', activeProgram.id).order('order_index'),
            supabase.from('training_exercises').select('id, day_id, muscle_group, sets').eq('program_id', activeProgram.id).order('order_index'),
            supabase.from('training_columns').select('id, key, label').eq('program_id', activeProgram.id),
            supabase.from('training_cells').select('exercise_id, column_id, week_index, value').eq('program_id', activeProgram.id),
        ]).then(([{ data: days }, { data: exs }, { data: exerciseSummary }, { data: columns }, { data: cells }]) => {
            if (!days || !exs) return
            const dayMap = new Map(days.map((d: any) => [d.id, d.name]))
            setExistingExercises(exs.map((e: any) => ({
                dayName: dayMap.get(e.day_id) ?? 'Día',
                exerciseName: e.exercise_name,
                sets: e.sets,
                reps: e.reps,
                rir: e.rir != null ? String(e.rir) : null,
                restSeconds: e.rest_seconds,
                notes: e.notes,
            })))
            setProgramSummaryDetail({
                days: (days || []).map((day: any) => ({ id: day.id, name: day.name || 'Día' })),
                exercises: (exerciseSummary || []).map((exercise: any) => ({
                    id: exercise.id,
                    day_id: exercise.day_id,
                    muscle_group: exercise.muscle_group,
                    sets: exercise.sets,
                })),
                columns: (columns || []).map((column: any) => ({
                    id: column.id,
                    key: column.key,
                    label: column.label,
                })),
                cells: (cells || []).map((cell: any) => ({
                    exercise_id: cell.exercise_id,
                    column_id: cell.column_id,
                    week_index: cell.week_index,
                    value: cell.value,
                })),
            })
            setSummaryWeek(getDerivedProgramWeek(activeProgram.effective_from, activeProgram.total_weeks))
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProgram?.id])

    const clampedSummaryWeek = Math.min(Math.max(summaryWeek, 1), Math.max(activeProgram?.total_weeks || 1, 1))
    const muscleVolumeMetrics = buildMuscleVolumeMetrics(programSummaryDetail, clampedSummaryWeek)

    function handleAIConfirm(structure: StrengthStructure, name: string, weeks: number) {
        setPendingAIStructure({ ...structure, weeks })
        setPendingAIName(name)
        setWizardConfig({ isOpen: true, programId: null, step: 1 })
    }

    const handleCreate = async () => {
        setLastError(null)

        if (!coachId) {
            toast({ title: 'Error', description: 'No se detectó la sesión.', variant: 'destructive' })
            return
        }
        if (!newProgram.name.trim()) return

        const validDays = newProgram.daysInput.split(',').map(d => d.trim()).filter(Boolean)
        const payload = { coach_id: coachId, client_id: clientId, name: newProgram.name, total_weeks: newProgram.weeks, days: validDays }

        startTransition(async () => {
            try {
                const result = await createTrainingProgramClient(payload)
                if (!result.success) {
                    toast({ title: 'Error', description: result.error || 'Error al crear', variant: 'destructive' })
                    return
                }

                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] }),
                    queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", clientId] })
                ])

                toast({ title: 'Programa creado correctamente' })
                setShowCreate(false)
                setWizardConfig({ isOpen: true, programId: result.programId ?? null, step: 3 })
                onRefresh()
            } catch (error: any) {
                toast({ title: 'Error', description: error?.message, variant: 'destructive' })
            }
        })
    }

    const handleArchive = async () => {
        if (!activeProgram) return
        setIsArchiving(true)
        try {
            const result = await archiveTrainingProgramAction(activeProgram.id)
            if (result.success) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] }),
                    queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", clientId] })
                ])
                toast({ title: 'Programa archivado' })
                onRefresh()
            } else {
                toast({ title: 'Error al archivar', description: result.error, variant: 'destructive' })
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error?.message || 'Error inesperado', variant: 'destructive' })
        } finally {
            setIsArchiving(false)
            setArchiveDialogOpen(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Active Program */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Dumbbell className="h-5 w-5 text-primary" />
                        Programa activo
                    </h3>
                    <div className="flex items-center gap-2">
                        <AITrainingDialog
                            existingProgram={activeProgram && existingExercises.length > 0
                                ? { name: activeProgram.name, weeks: activeProgram.total_weeks, exercises: existingExercises }
                                : null
                            }
                            onConfirm={handleAIConfirm}
                            trigger={
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/5 hover:border-primary transition-colors font-medium"
                                >
                                    ✦ Generar con IA
                                </button>
                            }
                        />
                        <Button
                            size="sm"
                            onClick={() => setWizardConfig({ isOpen: true, programId: null, step: 1 })}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo programa
                        </Button>
                    </div>
                </div>

                {activeProgram ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                            <div>
                                <h4 className="font-medium">{activeProgram.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                    {activeProgram.total_weeks} semanas
                                </p>
                                {activeProgram.effective_from && (
                                    <p className="text-xs text-muted-foreground">
                                        Inicio: {activeProgram.effective_from}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-success/10 text-success border-0">Activo</Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                            onClick={() => setWizardConfig({ isOpen: true, programId: activeProgram.id, step: 3 })}
                                        >
                                            <Settings2 className="h-4 w-4 mr-2" />
                                            Configurar plan
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => setArchiveDialogOpen(true)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Archive className="h-4 w-4 mr-2" />
                                            Archivar
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        <MuscleVolumeSummary
                            totalWeeks={activeProgram.total_weeks}
                            activeWeek={clampedSummaryWeek}
                            onWeekChange={setSummaryWeek}
                            metrics={muscleVolumeMetrics}
                        />

                        <Button
                            variant="outline"
                            className="w-full gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5"
                            onClick={() => setWizardConfig({ isOpen: true, programId: activeProgram.id, step: 3 })}
                        >
                            <Settings2 className="h-4 w-4 text-primary" />
                            Configurar plan detallado
                        </Button>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <Dumbbell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p>Sin programa de entrenamiento activo</p>
                        <Button className="mt-4" onClick={() => setWizardConfig({ isOpen: true, programId: null, step: 1 })}>
                            <Plus className="h-4 w-4 mr-2" />
                            Crear programa
                        </Button>
                    </div>
                )}
            </Card>

            {/* All Programs */}
            <TrainingProgramsHistory
                clientId={clientId}
                programs={allPrograms.filter(p => p.id !== activeProgram?.id)}
                onRefresh={onRefresh}
            />

            {wizardConfig.isOpen && (
                <TrainingProgramWizard
                    programId={wizardConfig.programId}
                    coachId={coachId}
                    clientId={clientId}
                    isOpen={wizardConfig.isOpen}
                    initialStep={wizardConfig.step}
                    pendingAIStructure={pendingAIStructure}
                    pendingAIName={pendingAIName}
                    onOpenChange={(open) => setWizardConfig(prev => ({ ...prev, isOpen: open }))}
                    onClose={() => {
                        setWizardConfig({ isOpen: false, programId: null, step: 1 })
                        setPendingAIStructure(null)
                        setPendingAIName(null)
                        onRefresh()
                    }}
                />
            )}

            {/* Archive Confirmation */}
            <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Archivar programa?</AlertDialogTitle>
                        <AlertDialogDescription>
                            El programa &quot;{activeProgram?.name}&quot; se archivará y dejará de estar activo.
                            Podrás reactivarlo desde el historial en cualquier momento.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isArchiving}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleArchive}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isArchiving}
                        >
                            {isArchiving ? (
                                <>
                                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                    Archivando...
                                </>
                            ) : (
                                'Archivar'
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    )
}
