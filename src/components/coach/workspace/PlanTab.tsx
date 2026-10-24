'use client'

import { useState, useTransition, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
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
    Copy,
    CalendarRange,
} from 'lucide-react'
import { activateTrainingProgramAction, archiveTrainingProgramAction, copyTrainingProgramToTemplateAction } from './actions'
import { createTrainingProgramClient } from './clientActions'
import { notifyClientPlanUpdatedAction } from '@/lib/notifications/plan-update-actions'
import { TrainingProgramWizard } from './plan/TrainingProgramWizard'
import { AITrainingDialog } from './plan/AITrainingDialog'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { PlanningTab } from './PlanningTab'
import { DietTab } from '../tabs/DietTab'
import type { StrengthStructure } from '@/types/templates'
import { SupplementsPanel } from './plan/SupplementsPanel'
import { SeasonTab } from './plan/season/SeasonTab'
import { ProgramOverview, type ProgramDetail } from './plan/ProgramOverview'
import { getAITrainingWizardConfig } from '@/lib/training/ai-training-flow'
import { FirstPlanChooser } from '@/components/coach/onboarding/FirstPlanChooser'
import { usePlanStartIntent, type PlanStartIntent } from '@/components/coach/onboarding/plan-start'

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

interface PlanTabProps {
    coachId: string
    clientId: string
    activeProgram: TrainingProgram | null
    programs: TrainingProgram[]
    onRefresh: () => void
}

type PlanSubTab = 'season' | 'schedule' | 'training' | 'diet' | 'supplements'

// Orden macro → micro: la temporada es la capa de arriba de la planificación
const PLAN_SUB_TABS = [
    { value: 'season', label: 'Temporada', shortLabel: 'Temporada', icon: CalendarRange },
    { value: 'schedule', label: 'Planificación', shortLabel: 'Planif.', icon: CalendarDays },
    { value: 'training', label: 'Fuerza', shortLabel: 'Fuerza', icon: Dumbbell },
    { value: 'diet', label: 'Nutrición', shortLabel: 'Nutrición', icon: Utensils },
    { value: 'supplements', label: 'Suplementación', shortLabel: 'Suplem.', icon: FlaskConical },
] as const

function normalizePlanSubTab(value: string | null): PlanSubTab {
    return PLAN_SUB_TABS.some(tab => tab.value === value)
        ? value as PlanSubTab
        : 'schedule'
}

export function PlanTab({
    coachId,
    clientId,
    activeProgram,
    programs,
    onRefresh
}: PlanTabProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [activeSubTab, setActiveSubTab] = useState<PlanSubTab>(() => normalizePlanSubTab(searchParams.get('plan')))

    useEffect(() => {
        const nextSubTab = normalizePlanSubTab(searchParams.get('plan'))
        setActiveSubTab(previous => previous === nextSubTab ? previous : nextSubTab)
    }, [searchParams])

    const handleSubTabChange = (value: string) => {
        const nextSubTab = normalizePlanSubTab(value)
        const params = new URLSearchParams(searchParams.toString())
        setActiveSubTab(nextSubTab)
        params.set('tab', 'plan')
        params.set('plan', nextSubTab)
        params.delete('week')
        router.replace(`/coach/clients?${params.toString()}`)
    }

    // Desde la temporada: abrir Planificación en una semana concreta
    const openPlanningWeek = (weekStart: string) => {
        const params = new URLSearchParams(searchParams.toString())
        setActiveSubTab('schedule')
        params.set('tab', 'plan')
        params.set('plan', 'schedule')
        params.set('week', weekStart)
        router.replace(`/coach/clients?${params.toString()}`, { scroll: false })
    }

    // Paso 4 de "Primeros pasos": elegir cómo empezar el primer plan
    const showFirstPlanChooser = searchParams.get('guide') === 'first-plan'
    const handleFirstPlan = (intent: PlanStartIntent | null) => {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('guide')
        params.set('tab', 'plan')
        if (intent) {
            const nextSubTab = intent === 'csv' ? 'diet' : 'training'
            setActiveSubTab(nextSubTab)
            params.set('plan', nextSubTab)
            params.set('start', intent)
        }
        router.replace(`/coach/clients?${params.toString()}`, { scroll: false })
    }

    return (
        <>
        {showFirstPlanChooser && (
            <FirstPlanChooser onChoose={handleFirstPlan} onDismiss={() => handleFirstPlan(null)} />
        )}
        <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="w-full min-w-0">
            {/* Segundo nivel de navegación: pastillas siempre visibles (antes desplegable en móvil) */}
            <div
                role="tablist"
                aria-label="Secciones del plan"
                className="mb-4 flex gap-1 rounded-full bg-muted p-1 sm:inline-grid sm:w-auto sm:min-w-[42rem] sm:grid-cols-5"
            >
                {PLAN_SUB_TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeSubTab === tab.value
                    return (
                        <button
                            key={tab.value}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => handleSubTabChange(tab.value)}
                            className={cn(
                                'flex h-9 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-full px-1 text-[11px] font-semibold tracking-tight transition-all min-[400px]:text-xs sm:px-2 sm:text-sm sm:tracking-normal',
                                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
                            <span className="truncate sm:hidden">{tab.shortLabel}</span>
                            <span className="hidden truncate sm:inline">{tab.label}</span>
                        </button>
                    )
                })}
            </div>

            <TabsContent value="season" className="mt-0">
                <SeasonTab clientId={clientId} coachId={coachId} onOpenWeek={openPlanningWeek} />
            </TabsContent>

            <TabsContent value="schedule" className="mt-0">
                <PlanningTab
                    clientId={clientId}
                    coachId={coachId}
                    onEditProgram={() => handleSubTabChange('training')}
                    onOpenSeason={() => handleSubTabChange('season')}
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
        </>
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
    const [isCopyingTemplate, setIsCopyingTemplate] = useState(false)

    // AI state
    const [pendingAIStructure, setPendingAIStructure] = useState<StrengthStructure | null>(null)
    // Primer plan desde "Primeros pasos": abrir directamente plantilla o IA
    const [autoOpenTemplateImport, setAutoOpenTemplateImport] = useState(false)
    const [autoOpenAI, setAutoOpenAI] = useState(false)
    usePlanStartIntent('template', () => {
        setAutoOpenTemplateImport(true)
        setWizardConfig({ isOpen: true, programId: null, step: 1 })
    })
    usePlanStartIntent('ai', () => setAutoOpenAI(true))
    const [pendingAIName, setPendingAIName] = useState<string | null>(null)
    const [programSummaryDetail, setProgramSummaryDetail] = useState<ProgramDetail | null>(null)
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
        setProgramSummaryDetail(null)
        Promise.all([
            supabase.from('training_days').select('id, name, order_index').eq('program_id', activeProgram.id),
            supabase.from('training_exercises').select('id, day_id, exercise_name, muscle_group, order_index, sets, reps, rir, rest_seconds, notes').eq('program_id', activeProgram.id).order('order_index'),
            supabase.from('training_columns').select('id, key, label, scope').eq('program_id', activeProgram.id),
            supabase.from('training_cells').select('exercise_id, column_id, week_index, value').eq('program_id', activeProgram.id),
        ]).then(([{ data: days }, { data: exs }, { data: columns }, { data: cells }]) => {
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
            const detail: ProgramDetail = {
                days: days.map((day: any) => ({ id: day.id, name: day.name || 'Día', order_index: day.order_index ?? null })),
                exercises: exs as ProgramDetail['exercises'],
                columns: (columns || []) as ProgramDetail['columns'],
                cells: (cells || []) as ProgramDetail['cells'],
                loggedSets: [],
            }
            setProgramSummaryDetail(detail)

            // Lo que el atleta ha registrado: se carga después para no retrasar la vista
            const exerciseIds = exs.map((exercise: any) => exercise.id)
            if (exerciseIds.length > 0) {
                supabase
                    .from('training_exercise_sets')
                    .select('exercise_id, week_index, set_index, weight_kg, reps, completed')
                    .in('exercise_id', exerciseIds)
                    .then(({ data: loggedSets }) => {
                        if (!loggedSets?.length) return
                        setProgramSummaryDetail(current => current === detail
                            ? { ...detail, loggedSets: loggedSets as ProgramDetail['loggedSets'] }
                            : current)
                    })
            }
            setSummaryWeek(getDerivedProgramWeek(activeProgram.effective_from, activeProgram.total_weeks))
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProgram?.id])

    const clampedSummaryWeek = Math.min(Math.max(summaryWeek, 1), Math.max(activeProgram?.total_weeks || 1, 1))

    function handleAIConfirm(structure: StrengthStructure, name: string, weeks: number, mode: 'generate' | 'modify') {
        setPendingAIStructure({ ...structure, weeks })
        setPendingAIName(name)
        const config = getAITrainingWizardConfig({
            mode,
            activeProgramId: activeProgram?.id ?? null,
        })
        setWizardConfig({ isOpen: true, ...config })
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

                if (result.programId) {
                    void notifyClientPlanUpdatedAction({ clientId, kind: 'training', planId: result.programId })
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

    const handleCopyToTemplate = async () => {
        if (!activeProgram || isCopyingTemplate) return

        setIsCopyingTemplate(true)
        try {
            const result = await copyTrainingProgramToTemplateAction(activeProgram.id, clientId)
            if (!result.success) {
                toast({
                    title: 'Error al copiar a plantillas',
                    description: result.error || 'No se pudo crear la plantilla.',
                    variant: 'destructive',
                })
                return
            }

            toast({
                title: 'Plantilla creada',
                description: `"${result.template?.name ?? activeProgram.name}" ya está disponible en Plantillas.`,
            })
        } catch (error: any) {
            toast({
                title: 'Error al copiar a plantillas',
                description: error?.message || 'Error inesperado',
                variant: 'destructive',
            })
        } finally {
            setIsCopyingTemplate(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Active Program */}
            <Card className="rounded-2xl border-border/70 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-semibold">
                        <Dumbbell className="h-5 w-5 text-primary" />
                        Programa activo
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <AITrainingDialog
                            clientId={clientId}
                            existingProgram={activeProgram && existingExercises.length > 0
                                ? { name: activeProgram.name, weeks: activeProgram.total_weeks, exercises: existingExercises }
                                : null
                            }
                            onConfirm={handleAIConfirm}
                            autoOpen={autoOpenAI}
                            onAutoOpened={() => setAutoOpenAI(false)}
                            trigger={
                                <AIActionButton size="sm" className="rounded-full">
                                    Generar con IA
                                </AIActionButton>
                            }
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => setWizardConfig({ isOpen: true, programId: null, step: 1 })}
                        >
                            <Plus className="mr-1.5 h-4 w-4" />
                            Nuevo
                        </Button>
                    </div>
                </div>

                {activeProgram ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="break-words font-semibold leading-snug">{activeProgram.name}</h4>
                                        <Badge className="border-0 bg-success/10 text-success">Activo</Badge>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {activeProgram.total_weeks} {activeProgram.total_weeks === 1 ? 'semana' : 'semanas'}
                                        {activeProgram.effective_from && ` · desde el ${new Date(`${activeProgram.effective_from}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                    </p>
                                </div>
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
                                            onClick={handleCopyToTemplate}
                                            disabled={isCopyingTemplate}
                                        >
                                            {isCopyingTemplate ? (
                                                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                            ) : (
                                                <Copy className="h-4 w-4 mr-2" />
                                            )}
                                            Copiar a plantillas
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
                            <Button
                                size="sm"
                                className="mt-3 w-full gap-2 sm:w-auto"
                                onClick={() => setWizardConfig({ isOpen: true, programId: activeProgram.id, step: 3 })}
                            >
                                <Settings2 className="h-4 w-4" />
                                Editar ejercicios y series
                            </Button>
                        </div>

                        <ProgramOverview
                            detail={programSummaryDetail}
                            totalWeeks={activeProgram.total_weeks}
                            activeWeek={clampedSummaryWeek}
                            onWeekChange={setSummaryWeek}
                        />

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
                    autoOpenTemplateImport={autoOpenTemplateImport}
                    onOpenChange={(open) => setWizardConfig(prev => ({ ...prev, isOpen: open }))}
                    onClose={() => {
                        setAutoOpenTemplateImport(false)
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
