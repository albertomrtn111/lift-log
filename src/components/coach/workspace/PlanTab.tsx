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
    Calendar,
    Utensils,
    Settings2,
    CalendarDays,
    MoreVertical,
    Archive,
    Loader2 as Loader2Icon,
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
            <TabsList className="flex w-full justify-start gap-8 mb-6 bg-transparent p-0 border-b border-zinc-800 overflow-x-auto pb-px">
                <TabsTrigger
                    value="schedule"
                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                >
                    <CalendarDays className="h-4 w-4" />
                    Planificación
                </TabsTrigger>
                <TabsTrigger
                    value="training"
                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                >
                    <Dumbbell className="h-4 w-4" />
                    Fuerza
                </TabsTrigger>
                <TabsTrigger
                    value="diet"
                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                >
                    <Utensils className="h-4 w-4" />
                    Nutrición
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
    const [existingExercises, setExistingExercises] = useState<Array<{
        dayName: string; exerciseName: string; sets?: number | null
        reps?: string | null; rir?: string | null; restSeconds?: number | null; notes?: string | null
    }>>([])

    // Load existing exercises for AI context when active program changes
    useEffect(() => {
        if (!activeProgram) { setExistingExercises([]); return }
        const supabase = createClient()
        Promise.all([
            supabase.from('training_days').select('id, name').eq('program_id', activeProgram.id),
            supabase.from('training_exercises').select('day_id, exercise_name, sets, reps, rir, rest_seconds, notes').eq('program_id', activeProgram.id).order('order_index'),
        ]).then(([{ data: days }, { data: exs }]) => {
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
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProgram?.id])

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
