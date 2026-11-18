'use client'

import React, { useState, useEffect, useRef, useImperativeHandle } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    ChevronRight,
    ChevronLeft,
    Save,
    Plus,
    Trash2,
    Loader2,
    Dumbbell,
    Settings2,
    Download,
    ArrowUp,
    ArrowDown,
    GripVertical,
    MoreHorizontal,
} from 'lucide-react'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { TemplateImportDialog } from './TemplateImportDialog'
import { TrainingTemplate, StrengthStructure } from '@/types/templates'
import { saveTrainingDays } from '../clientActions'
import { notifyClientPlanUpdatedAction } from '@/lib/notifications/plan-update-actions'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { addExerciseAction, deleteExerciseAction, reorderExerciseAction, reorderExercisesAction } from '../actions'
import { applyStrengthStructureAction } from '../strength-structure-actions'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    LoggedResultsDialog,
    describeWeeks,
    type LoggedResultsDecision,
    type LoggedResultsPrompt,
} from './LoggedResultsDialog'
import type { StrengthResultConflict } from '@/lib/training/strength-results-data'
import { MUSCLE_GROUP_LABELS, normalizeMuscleGroup } from '@/lib/training/muscle-groups'
import { ExerciseCatalogPicker } from '@/components/training/ExerciseCatalogPicker'
import { ExerciseLibraryDialog } from '@/components/training/ExerciseLibraryDialog'
import { useExerciseCatalog } from '@/hooks/use-exercise-catalog'
import { loadExerciseCatalog } from '@/lib/training/exercise-catalog-client'
import { catalogGroupToMuscleGroup, type CatalogExercise } from '@/lib/training/exercise-catalog'
import { resolveStrengthStructure } from '@/lib/training/strength-catalog'
import { cn } from '@/lib/utils'

interface TrainingProgramWizardProps {
    programId: string | null
    coachId?: string
    clientId?: string
    isOpen: boolean
    initialStep?: number
    onOpenChange: (open: boolean) => void
    onClose: () => void
    /** When set, the wizard auto-imports this structure into Step 2 after the program is created in Step 1 */
    pendingAIStructure?: import('@/types/templates').StrengthStructure | null
    pendingAIName?: string | null
    /** Primer plan "desde plantilla": al llegar a los días se abre el selector de plantillas */
    autoOpenTemplateImport?: boolean
}

import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'

export function TrainingProgramWizard({
    programId,
    coachId,
    clientId,
    isOpen,
    initialStep = 1,
    onOpenChange,
    onClose,
    pendingAIStructure,
    pendingAIName,
    autoOpenTemplateImport = false,
}: TrainingProgramWizardProps) {
    const { toast } = useToast()
    const [step, setStep] = useState(initialStep)
    const [loading, setLoading] = useState(true)
    const [program, setProgram] = useState<any>(null)
    const [days, setDays] = useState<any[]>([])
    const [exercises, setExercises] = useState<any[]>([])
    const [columns, setColumns] = useState<any[]>([])
    const [cells, setCells] = useState<any[]>([])
    const [activeDayId, setActiveDayId] = useState<string | null>(null)
    const [activeWeek, setActiveWeek] = useState(1)
    const [currentProgramId, setCurrentProgramId] = useState<string | null>(programId)
    const [isStepping, setIsStepping] = useState(false)
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
    const [autoImportShown, setAutoImportShown] = useState(false)
    useEffect(() => {
        if (autoOpenTemplateImport && step === 2 && !autoImportShown) {
            setAutoImportShown(true)
            setIsImportDialogOpen(true)
        }
    }, [autoOpenTemplateImport, step, autoImportShown])
    const appliedPendingAIKeyRef = useRef<string | null>(null)
    const [loggedResultsPrompt, setLoggedResultsPrompt] = useState<LoggedResultsPrompt | null>(null)
    const loggedResultsResolveRef = useRef<((decision: LoggedResultsDecision) => void) | null>(null)

    // Refs for imperative save
    const step1Ref = useRef<{ handleSave: () => Promise<boolean> }>(null)
    const step2Ref = useRef<{ handleSave: () => Promise<boolean> }>(null)

    useEffect(() => {
        setCurrentProgramId(programId)
    }, [programId])

    useEffect(() => {
        if (isOpen) {
            if (currentProgramId) {
                loadAllData(currentProgramId)
            } else {
                // Initialize for creation — pre-fill with AI name/weeks if provided
                setProgram({
                    name: pendingAIName ?? 'Nuevo Programa',
                    weeks: pendingAIStructure?.weeks ?? 4,
                    effective_from: new Date().toISOString().split('T')[0],
                    coach_id: coachId,
                    client_id: clientId,
                    status: 'active'
                })
                setDays([])
                setExercises([])
                setColumns([])
                setCells([])
                setLoading(false)
            }
        }
    }, [isOpen, programId])

    useEffect(() => {
        if (!isOpen || !programId || !currentProgramId || !pendingAIStructure) return

        const applyKey = `${currentProgramId}:${pendingAIName ?? ''}:${pendingAIStructure.weeks ?? ''}:${pendingAIStructure.days.length}`
        if (appliedPendingAIKeyRef.current === applyKey) return
        appliedPendingAIKeyRef.current = applyKey

        ;(async () => {
            setLoading(true)
            try {
                const structure = await resolveAIStructure(pendingAIStructure)
                const result = await applyStructureToDB(currentProgramId, structure, pendingAIName)
                await loadAllData(currentProgramId)
                setStep(2)
                if (!result) {
                    toast({ title: 'No se ha cambiado el programa', description: 'Has cancelado la propuesta de la IA.' })
                    return
                }
                toast({
                    title: 'Programa actualizado con IA',
                    description: keptMessage(result) ?? 'Revisa los días antes de finalizar para confirmar la planificación semanal.',
                })
            } catch {
                await loadAllData(currentProgramId)
            }
        })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, programId, currentProgramId, pendingAIStructure])

    async function loadAllData(idToLoad: string) {
        setLoading(true)
        const supabase = createClient()

        try {
            // 1. Fetch program
            const { data: prog, error: pError } = await supabase
                .from('training_programs')
                .select('*')
                .eq('id', idToLoad)
                .single()

            if (pError) throw pError
            setProgram(prog)

            // 2. Fetch or Create columns
            const { data: cData, error: cError } = await supabase
                .from('training_columns')
                .select('*')
                .eq('program_id', idToLoad)
                .order('order_index', { ascending: true })

            if (cError) throw cError

            let finalCols = cData || []
            if (finalCols.length === 0) {
                const defaults = getDefaultTrainingColumns().map(col => ({
                    ...col,
                    program_id: idToLoad,
                    coach_id: prog.coach_id
                }))
                const { data: insertedCols } = await supabase.from('training_columns').insert(defaults).select()
                if (insertedCols) finalCols = insertedCols
            }
            setColumns(finalCols)

            // 3. Fetch days
            const { data: dData, error: dError } = await supabase
                .from('training_days')
                .select('*')
                .eq('program_id', idToLoad)
                .order('order_index', { ascending: true })

            if (dError) throw dError

            const mappedDays = (dData || []).map((d: any) => ({
                ...d,
                name: d.name || d.day_name || 'Día',
                order_index: d.order_index ?? d.day_order ?? 1
            }))

            setDays(mappedDays)
            // Ensure activeDayId is valid
            if (mappedDays.length > 0) {
                const dayExists = mappedDays.some(d => d.id === activeDayId)
                if (!activeDayId || !dayExists) {
                    setActiveDayId(mappedDays[0].id)
                }
            } else {
                setActiveDayId(null)
            }

            // 4. Fetch exercises
            const { data: eData, error: eError } = await supabase
                .from('training_exercises')
                .select('*')
                .eq('program_id', idToLoad)
                .order('order_index', { ascending: true })

            if (eError) throw eError
            setExercises(eData || [])

            // 5. Fetch ALL cells for this program
            const { data: clData, error: clError } = await supabase
                .from('training_cells')
                .select('*')
                .eq('program_id', idToLoad)

            if (clError) throw clError
            setCells(clData || [])

        } catch (error: any) {
            toast({
                title: 'Error al cargar datos',
                description: error.message,
                variant: 'destructive'
            })
        } finally {
            setLoading(false)
        }
    }

    async function handleNext() {
        if (step === 1) {
            setIsStepping(true)
            const success = await step1Ref.current?.handleSave()
            setIsStepping(false)
            if (success) setStep(2)
        } else if (step === 2) {
            // Validate all days have a weekday assigned
            const missingWeekday = days.some(d => !d.default_weekday)
            if (missingWeekday) {
                toast({ title: 'Asigna día de la semana', description: 'Cada día del programa debe tener un día predeterminado (L-D) antes de continuar.', variant: 'destructive' })
                return
            }
            setIsStepping(true)
            const success = await step2Ref.current?.handleSave()
            setIsStepping(false)
            if (success) {
                // Ensure days are updated in Step 3
                await loadAllData(currentProgramId!)
                setStep(3)
            }
        } else {
            setStep(s => Math.min(s + 1, 3))
        }
    }

    const prevStep = () => setStep(s => Math.max(s - 1, 1))

    function handleFinish() {
        const targetClientId = clientId || program?.client_id
        if (currentProgramId && targetClientId) {
            void notifyClientPlanUpdatedAction({ clientId: targetClientId, kind: 'training', planId: currentProgramId })
        }
        onClose()
    }

    /** Aviso de NXT-124: el coach decide qué hacer con lo que el atleta ya ha registrado. */
    function askLoggedResults(conflicts: StrengthResultConflict[], context: LoggedResultsPrompt['context']) {
        return new Promise<LoggedResultsDecision>(resolve => {
            loggedResultsResolveRef.current = resolve
            setLoggedResultsPrompt({ conflicts, context })
        })
    }

    function resolveLoggedResults(decision: LoggedResultsDecision) {
        const resolve = loggedResultsResolveRef.current
        loggedResultsResolveRef.current = null
        setLoggedResultsPrompt(null)
        resolve?.(decision)
    }

    function keptMessage(result: { keptExercises: number; keptDays: number }) {
        const parts: string[] = []
        if (result.keptExercises > 0) parts.push(`${result.keptExercises} ${result.keptExercises === 1 ? 'ejercicio' : 'ejercicios'} al final de su día`)
        if (result.keptDays > 0) parts.push(`${result.keptDays} ${result.keptDays === 1 ? 'día' : 'días'} al final del programa`)
        return parts.length > 0 ? `Se ha conservado lo que el atleta ya había registrado: ${parts.join(' y ')}.` : null
    }

    /**
     * Aplica la estructura (IA o plantilla) sin recrear el programa (NXT-124): lo que
     * sigue conserva su id y, con él, las series del atleta. Si algo que sobra tiene
     * registros, pregunta antes. Devuelve null si el coach cancela y lanza si falla.
     */
    async function applyStructureToDB(
        programId: string,
        structure: StrengthStructure,
        programName?: string | null,
        { regenerateSchedule = true }: { regenerateSchedule?: boolean } = {},
    ) {
        const input = { programId, structure, programName }
        let result = await applyStrengthStructureAction(input)
        while (!result.success && result.needsDecision) {
            const conflicts = result.conflicts
            const decision = await askLoggedResults(conflicts, 'structure')
            if (decision === 'cancel') return null
            result = await applyStrengthStructureAction({
                ...input,
                decision,
                confirmedDeleteIds: decision === 'delete' ? conflicts.map(conflict => conflict.id) : undefined,
            })
        }
        if (!result.success) {
            const message = 'error' in result ? result.error : 'No se pudieron aplicar los cambios.'
            toast({ title: 'No se pudieron aplicar los cambios', description: message, variant: 'destructive' })
            throw new Error(message)
        }

        // Vuelve a agendar las sesiones con los días que tengan día de la semana.
        if (regenerateSchedule) await saveTrainingDays(programId, result.days)
        return result
    }

    /** Liga cada ejercicio de la IA a la biblioteca; lanza si alguno no está. */
    async function resolveAIStructure(structure: StrengthStructure) {
        const resolved = resolveStrengthStructure(structure, await loadExerciseCatalog())
        if (resolved.unresolved.length > 0) {
            const message = `Elige de la biblioteca: ${resolved.unresolved.slice(0, 3).join(', ')}`
            toast({ title: 'Ejercicios sin identificar', description: message, variant: 'destructive' })
            throw new Error(message)
        }
        return resolved.structure
    }

    const handleImportTemplate = async (template: TrainingTemplate) => {
        if (template.type !== 'strength') {
            toast({ title: 'Error', description: 'Solo se pueden importar plantillas de fuerza.', variant: 'destructive' })
            return
        }

        const catalog = await loadExerciseCatalog().catch(() => null)
        if (!catalog) {
            toast({ title: 'Error', description: 'No se pudo cargar la biblioteca de ejercicios.', variant: 'destructive' })
            return
        }
        const resolved = resolveStrengthStructure(template.structure as StrengthStructure, catalog)
        if (resolved.unresolved.length > 0) {
            toast({
                title: 'Plantilla pendiente de vincular',
                description: `Edita la plantilla y elige de la biblioteca: ${resolved.unresolved.slice(0, 3).join(', ')}`,
                variant: 'destructive',
            })
            return
        }
        const structure = resolved.structure
        if (!structure.days || structure.days.length === 0) {
            toast({ title: 'Aviso', description: 'La plantilla está vacía.' })
            return
        }

        // Programa ya guardado (paso 1 hecho): se aplica en su sitio, sin borrar lo registrado.
        if (currentProgramId) {
            let result: Awaited<ReturnType<typeof applyStructureToDB>>
            try {
                result = await applyStructureToDB(currentProgramId, structure, null, { regenerateSchedule: false })
            } catch {
                await loadAllData(currentProgramId)
                return
            }
            if (!result) {
                toast({ title: 'No se ha cambiado el programa', description: 'Has cancelado la plantilla.' })
                return
            }

            const kept = keptMessage(result)
            toast({
                title: 'Plantilla importada',
                description: `Se han cargado ${result.dayCount} días y ${result.exerciseCount} ejercicios. ${kept ?? 'Asigna el día de la semana a cada uno.'}`,
            })

            // Recarga y se queda en el paso 2 para asignar los días de la semana
            await loadAllData(currentProgramId)
            return
        }

        // Sin programa guardado (no debería pasar: el paso 1 lo crea): solo estado local.
        const newDays: any[] = []
        const newExercises: any[] = []
        structure.days.forEach((day, dIdx) => {
            const newDayId = crypto.randomUUID()
            newDays.push({ id: newDayId, name: day.name, order_index: dIdx + 1 })
            ;(day.exercises ?? []).forEach((ex, eIdx) => {
                newExercises.push({
                    id: crypto.randomUUID(),
                    day_id: newDayId,
                    exercise_name: ex.exercise_name || '',
                    catalog_exercise_id: ex.catalog_exercise_id ?? null,
                    muscle_group: normalizeMuscleGroup(ex.muscle_group),
                    order_index: ex.order ?? eIdx + 1,
                    sets: ex.sets ?? 3,
                    reps: ex.reps ?? '10',
                    rir: ex.rir != null ? Number(ex.rir) : null,
                    rest_seconds: ex.rest_seconds ?? 60,
                    notes: ex.notes || null,
                })
            })
        })
        if (structure.weeks) {
            setProgram((prev: any) => ({ ...prev, weeks: structure.weeks }))
        }
        setDays(newDays)
        setExercises(newExercises)
        toast({
            title: 'Plantilla importada',
            description: `Se han cargado ${newDays.length} días y ${newExercises.length} ejercicios.`,
        })
    }

    const loggedResultsDialog = (
        <LoggedResultsDialog prompt={loggedResultsPrompt} onResolve={resolveLoggedResults} />
    )

    if (loading && isOpen) {
        return (
            <>
                <Dialog open={isOpen} onOpenChange={onOpenChange}>
                    <DialogContent className="max-w-4xl h-[80vh] flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </DialogContent>
                </Dialog>
                {loggedResultsDialog}
            </>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[90dvh] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-4 py-3 pr-14 text-left sm:px-6 sm:py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Paso {step} de 3 · {step === 1 ? 'Información general' : step === 2 ? 'Días' : 'Ejercicios'}
                    </p>
                    <DialogTitle className="truncate text-lg font-bold leading-tight tracking-tight sm:text-xl">
                        {program?.name || 'Programa de fuerza'}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">{program?.weeks} semanas</p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/10 space-y-6">
                    {step === 1 && (
                        <StepInfo
                            ref={step1Ref}
                            program={program}
                            setProgram={setProgram}
                            programId={currentProgramId}
                            coachId={coachId}
                            clientId={clientId}
                            onCreated={async (newId) => {
                                setCurrentProgramId(newId)

                                // Auto-import AI structure BEFORE loadAllData so Step 2 shows the exercises.
                                // If applyStructureToDB throws, loadAllData still runs (program exists)
                                // but the step stays on 1 — user sees the error toast and can retry.
                                if (pendingAIStructure) {
                                    try {
                                        const structure = await resolveAIStructure(pendingAIStructure)
                                        await applyStructureToDB(newId, structure, pendingAIName)
                                    } catch {
                                        // Error already shown via toast inside applyStructureToDB.
                                        // Load the (empty) program so the wizard is usable.
                                        await loadAllData(newId)
                                        return
                                    }
                                }

                                await loadAllData(newId)
                            }}
                        />
                    )}
                    {step === 2 && (
                        <StepDays
                            ref={step2Ref}
                            days={days}
                            setDays={setDays}
                            programId={currentProgramId!}
                            coachId={program?.coach_id}
                            onImportRequest={() => setIsImportDialogOpen(true)}
                            onLoggedResults={askLoggedResults}
                        />
                    )}
                    {step === 3 && (
                        <StepProgramTable
                            program={program}
                            days={days}
                            columns={columns}
                            exercises={exercises}
                            setExercises={setExercises}
                            cells={cells}
                            setCells={setCells}
                            activeDayId={activeDayId}
                            setActiveDayId={setActiveDayId}
                            activeWeek={activeWeek}
                            setActiveWeek={setActiveWeek}
                            programId={currentProgramId!}
                        />
                    )}
                </div>

                <div className="p-4 border-t bg-background flex items-center justify-between shrink-0">
                    <Button
                        variant="ghost"
                        onClick={prevStep}
                        disabled={step === 1}
                        className="gap-2 font-medium"
                    >
                        <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>

                    <div className="flex gap-2">
                        {step < 3 ? (
                            <Button
                                onClick={handleNext}
                                className="gap-2 px-6 font-semibold shadow-sm min-w-[120px]"
                                disabled={isStepping}
                            >
                                {isStepping ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        Siguiente <ChevronRight className="h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        ) : (
                            <Button onClick={handleFinish} className="gap-2 bg-success hover:bg-success/90 px-6 font-semibold shadow-sm shadow-success/10">
                                <Save className="h-4 w-4" /> Finalizar
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>

            <TemplateImportDialog
                open={isImportDialogOpen}
                onOpenChange={setIsImportDialogOpen}
                onSelect={handleImportTemplate}
            />
            {loggedResultsDialog}
        </Dialog>
    )
}

const StepInfo = React.forwardRef(({
    program,
    setProgram,
    programId,
    coachId,
    clientId,
    onCreated
}: {
    program: any,
    setProgram: (p: any) => void,
    programId: string | null,
    coachId?: string,
    clientId?: string,
    onCreated?: (id: string) => void
}, ref) => {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [localProgram, setLocalProgram] = useState(program)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        setLocalProgram(program)
    }, [program])

    useImperativeHandle(ref, () => ({
        handleSave
    }))

    async function handleSave() {
        const supabase = createClient()
        setIsSaving(true)

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast({ title: 'Sesión expirada', variant: 'destructive' })
                return false
            }

            const payload = {
                name: localProgram.name,
                weeks: localProgram.weeks,
                effective_from: localProgram.effective_from,
                status: localProgram.status || 'active',
                coach_id: coachId || localProgram.coach_id,
                client_id: clientId || localProgram.client_id,
            }

            if (!programId) {
                // INSERT using RPC to ensure archiving of old active programs

                // Default columns matching clientActions.ts
                const defaultColumns = getDefaultTrainingColumns()

                const { data: newProgramId, error } = await supabase.rpc('create_program_and_archive_old', {
                    p_coach_id: coachId || localProgram.coach_id,
                    p_client_id: clientId || localProgram.client_id,
                    p_name: localProgram.name,
                    p_weeks: localProgram.weeks,
                    p_effective_from: localProgram.effective_from,
                    p_days: [], // Days added in Step 2
                    p_columns: defaultColumns
                })

                if (error) throw error
                toast({ title: 'Programa creado', description: 'Ahora puedes gestionar los días.' })
                if (onCreated && newProgramId) onCreated(newProgramId)
                return true
            } else {
                // UPDATE
                const { error } = await supabase
                    .from('training_programs')
                    .update({ ...payload, updated_at: new Date().toISOString() })
                    .eq('id', programId)

                if (error) throw error
                setProgram({ ...program, ...payload })
                toast({ title: 'Información guardada', description: 'Cambios sincronizados correctamente.' })
                return true
            }

            if (clientId || localProgram.client_id) {
                const cid = clientId || localProgram.client_id
                await queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", cid] })
                await queryClient.invalidateQueries({ queryKey: ["trainingPrograms", cid] })
            }
        } catch (err: any) {
            toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' })
            return false
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="mx-auto max-w-xl space-y-5">
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="name" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nombre del programa</Label>
                    <Input
                        id="name"
                        value={localProgram.name}
                        onChange={e => setLocalProgram({ ...localProgram, name: e.target.value })}
                        className="h-11 rounded-xl border-border/70 bg-muted/30 text-base font-semibold"
                        placeholder="Ej: Bloque de fuerza · Fase 1"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="weeks" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Semanas</Label>
                        <Input
                            id="weeks"
                            type="number"
                            value={localProgram.weeks}
                            onChange={e => setLocalProgram({ ...localProgram, weeks: parseInt(e.target.value) || 0 })}
                            inputMode="numeric"
                            className="h-11 rounded-xl border-border/70 bg-muted/30 font-semibold tabular-nums"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="start" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fecha de inicio</Label>
                        <Input
                            id="start"
                            type="date"
                            value={localProgram.effective_from}
                            onChange={e => setLocalProgram({ ...localProgram, effective_from: e.target.value })}
                            className="h-11 rounded-xl border-border/70 bg-muted/30"
                        />
                    </div>
                </div>
                {isSaving && (
                    <div className="flex items-center gap-2 text-primary animate-pulse py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm font-medium">Sincronizando cambios...</span>
                    </div>
                )}
            </div>
        </div>
    )
})
StepInfo.displayName = 'StepInfo'

/** Vuelve a poner en la lista los días que el coach decide conservar, en su posición. */
function restoreKeptDays(list: any[], conflicts: StrengthResultConflict[]) {
    const restored = [...list]
    const keptDays = conflicts
        .flatMap(conflict => conflict.kind === 'day' ? [conflict] : [])
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    for (const day of keptDays) {
        if (restored.some(item => item.id === day.id)) continue
        const position = Math.min(Math.max((day.order_index ?? restored.length + 1) - 1, 0), restored.length)
        restored.splice(position, 0, { id: day.id, name: day.name, default_weekday: day.default_weekday ?? undefined, order_index: day.order_index })
    }
    return restored
}

const StepDays = React.forwardRef(({ days, setDays, programId, coachId, onImportRequest, onLoggedResults }: {
    days: any[],
    setDays: (d: any[]) => void,
    programId: string,
    coachId: string,
    onImportRequest: () => void,
    onLoggedResults: (conflicts: StrengthResultConflict[], context: LoggedResultsPrompt['context']) => Promise<LoggedResultsDecision>,
}, ref) => {
    const { toast } = useToast()
    const [localDays, setLocalDays] = useState([...days])
    const [isSaving, setIsSaving] = useState(false)

    // Sync localDays when parent days change (e.g. after template import reload)
    useEffect(() => {
        setLocalDays([...days])
    }, [days])

    // Helper: update localDays AND sync to parent in one go
    const updateDays = (updated: any[]) => {
        setLocalDays(updated)
        setDays(updated)
    }

    useImperativeHandle(ref, () => ({
        handleSave,
    }))

    async function handleSave() {
        setIsSaving(true)

        try {
            let daysToSave = localDays
            let result = await saveTrainingDays(programId, daysToSave)
            // NXT-124: un día quitado con entrenamientos del atleta no se borra sin preguntar.
            while (!result.success && result.needsDecision) {
                const conflicts = result.conflicts
                const decision = await onLoggedResults(conflicts, 'days')
                if (decision === 'cancel') return false
                if (decision === 'keep') {
                    daysToSave = restoreKeptDays(daysToSave, conflicts)
                    updateDays(daysToSave)
                    result = await saveTrainingDays(programId, daysToSave)
                } else {
                    result = await saveTrainingDays(programId, daysToSave, {
                        confirmedDeleteDayIds: conflicts.map(conflict => conflict.id),
                    })
                }
            }

            if (!result.success) {
                throw new Error(('error' in result && result.error) || 'Error al guardar los días')
            }

            toast({ title: 'Días sincronizados', description: 'La estructura y el calendario han sido actualizados.' })
            return true
        } catch (error: any) {
            toast({ title: 'Error al actualizar días', description: error.message, variant: 'destructive' })
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const addDay = () => updateDays([...localDays, { id: `new-${Date.now()}`, name: 'Nuevo Día', default_weekday: undefined }])
    const removeDay = (id: string) => updateDays(localDays.filter(d => d.id !== id))

    const weekdays = [
        { value: 1, label: 'Lunes' },
        { value: 2, label: 'Martes' },
        { value: 3, label: 'Miércoles' },
        { value: 4, label: 'Jueves' },
        { value: 5, label: 'Viernes' },
        { value: 6, label: 'Sábado' },
        { value: 7, label: 'Domingo' },
    ]

    return (
        <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    {localDays.length} {localDays.length === 1 ? 'día' : 'días'} de entrenamiento por semana
                </p>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={onImportRequest} className="gap-1.5 rounded-full">
                        <Download className="h-4 w-4" /> Plantilla
                    </Button>
                    <Button size="sm" onClick={addDay} className="gap-1.5 rounded-full">
                        <Plus className="h-4 w-4" /> Día
                    </Button>
                </div>
            </div>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-background">
                {localDays.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">Añade el primer día o importa una plantilla.</p>
                )}
                {localDays.map((day, idx) => (
                    <div key={day.id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary">
                            {idx + 1}
                        </span>
                        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
                            <Input
                                value={day.name}
                                onChange={e => {
                                    const updated = [...localDays]
                                    updated[idx].name = e.target.value
                                    updateDays(updated)
                                }}
                                className="h-10 rounded-xl border-border/70 bg-muted/30 font-medium"
                                placeholder="Nombre (ej: Torso)"
                                aria-label={`Nombre del día ${idx + 1}`}
                            />
                            <Select
                                value={day.default_weekday?.toString() || "0"}
                                onValueChange={(val) => {
                                    const updated = [...localDays]
                                    updated[idx].default_weekday = val === "0" ? undefined : parseInt(val)
                                    updateDays(updated)
                                }}
                            >
                                <SelectTrigger className="h-10 rounded-xl border-border/70 bg-muted/30" aria-label={`Día habitual de ${day.name}`}>
                                    <SelectValue placeholder="Día habitual" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Sin día fijo</SelectItem>
                                    {weekdays.map(wd => (
                                        <SelectItem key={wd.value} value={wd.value.toString()}>
                                            {wd.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeDay(day.id)}
                            aria-label={`Quitar ${day.name || 'día'}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
            </div>
            <p className="px-1 text-xs text-muted-foreground">El día habitual sirve para agendar las sesiones en el calendario del atleta al guardar.</p>
            {isSaving && (
                <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Agendando sesiones…</span>
                </div>
            )}
        </div>
    )
})
StepDays.displayName = 'StepDays'

function StepProgramTable({
    program,
    days,
    columns: cols,
    exercises,
    setExercises,
    cells,
    setCells,
    activeDayId,
    setActiveDayId,
    activeWeek,
    setActiveWeek,
    programId
}: {
    program: any,
    days: any[],
    columns: any[],
    exercises: any[],
    setExercises: (e: any[]) => void,
    cells: any[],
    setCells: (c: any[]) => void,
    activeDayId: string | null,
    setActiveDayId: (id: string) => void,
    activeWeek: number,
    setActiveWeek: (w: number) => void,
    programId: string
}) {
    const { toast } = useToast()
    const [isReorderingExercises, setIsReorderingExercises] = useState(false)
    const [libraryOpen, setLibraryOpen] = useState(false)
    const { exercises: catalog, loading: catalogLoading, error: catalogError } = useExerciseCatalog()
    const exerciseSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    )
    const activeDayExercises = exercises
        .filter(e => e.day_id === activeDayId)
        .sort((a, b) => {
            const orderDiff = (a.order_index ?? 0) - (b.order_index ?? 0)
            if (orderDiff !== 0) return orderDiff
            return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
        })

    function openLibrary() {
        if (!activeDayId) {
            toast({ title: 'Atención', description: 'Selecciona primero un día de entrenamiento.' })
            return
        }
        setLibraryOpen(true)
    }

    async function addExercise(selected: CatalogExercise) {
        if (!activeDayId) return
        const order = activeDayExercises.length + 1
        const result = await addExerciseAction(activeDayId, selected.id, order)
        if (!result.success) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else if (result.exercise) {
            setExercises([...exercises, result.exercise])
        }
    }

    function moveExerciseLocally(exerciseId: string, direction: 'up' | 'down') {
        if (!activeDayId) return

        const orderedDayExercises = exercises
            .filter((exercise: any) => exercise.day_id === activeDayId)
            .sort((a: any, b: any) => {
                const orderDiff = (a.order_index ?? 0) - (b.order_index ?? 0)
                if (orderDiff !== 0) return orderDiff
                return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
            })

        const currentIndex = orderedDayExercises.findIndex((exercise: any) => exercise.id === exerciseId)
        if (currentIndex === -1) return

        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (nextIndex < 0 || nextIndex >= orderedDayExercises.length) return

        const reorderedDayExercises = [...orderedDayExercises]
        const [movedExercise] = reorderedDayExercises.splice(currentIndex, 1)
        reorderedDayExercises.splice(nextIndex, 0, movedExercise)

        const orderByExerciseId = new Map(
            reorderedDayExercises.map((exercise: any, index: number) => [exercise.id, index + 1])
        )

        setExercises(exercises.map((exercise: any) => {
            const nextOrder = orderByExerciseId.get(exercise.id)
            return nextOrder ? { ...exercise, order_index: nextOrder } : exercise
        }))
    }

    async function handleExerciseDragEnd(event: DragEndEvent) {
        if (!activeDayId || !event.over || event.active.id === event.over.id) return

        const activeExerciseId = event.active.data.current?.exerciseId as string | undefined
        const overExerciseId = event.over.data.current?.exerciseId as string | undefined
        if (!activeExerciseId || !overExerciseId) return

        const currentIndex = activeDayExercises.findIndex(exercise => exercise.id === activeExerciseId)
        const targetIndex = activeDayExercises.findIndex(exercise => exercise.id === overExerciseId)
        if (currentIndex === -1 || targetIndex === -1) return

        const previousExercises = exercises
        const reorderedDayExercises = [...activeDayExercises]
        const [movedExercise] = reorderedDayExercises.splice(currentIndex, 1)
        reorderedDayExercises.splice(targetIndex, 0, movedExercise)

        const orderByExerciseId = new Map(
            reorderedDayExercises.map((exercise, index) => [exercise.id, index + 1])
        )
        setExercises(exercises.map(exercise => {
            const nextOrder = orderByExerciseId.get(exercise.id)
            return nextOrder ? { ...exercise, order_index: nextOrder } : exercise
        }))

        setIsReorderingExercises(true)
        try {
            const result = await reorderExercisesAction(
                activeDayId,
                reorderedDayExercises.map(exercise => exercise.id)
            )

            if (result.success) return

            setExercises(previousExercises)
            toast({
                title: 'No se pudo guardar el orden',
                description: result.error,
                variant: 'destructive',
            })
        } catch (error) {
            setExercises(previousExercises)
            toast({
                title: 'No se pudo guardar el orden',
                description: error instanceof Error ? error.message : 'Error inesperado al reordenar los ejercicios.',
                variant: 'destructive',
            })
        } finally {
            setIsReorderingExercises(false)
        }
    }

    const activeDay = days.find(day => day.id === activeDayId)
    const daySets = activeDayExercises.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0)

    return (
        <div className="space-y-4">
            {/* Días: los valores se aplican a todas las semanas (la app del atleta lee los datos base del ejercicio) */}
            <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Día de entrenamiento</p>
                {days.length === 0 ? (
                    <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">Configura los días en el paso 2.</p>
                ) : (
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide" role="tablist" aria-label="Día de entrenamiento">
                        {days.map(day => {
                            const isActive = day.id === activeDayId
                            const count = exercises.filter(exercise => exercise.day_id === day.id).length
                            return (
                                <button
                                    key={day.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setActiveDayId(day.id)}
                                    className={cn(
                                        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                                        isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {day.name}
                                    <span className={cn('text-xs tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>{count}</span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            <DndContext sensors={exerciseSensors} onDragEnd={handleExerciseDragEnd}>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
                    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                        <div className="min-w-0">
                            <h5 className="truncate font-semibold leading-tight">{activeDay?.name ?? 'Ejercicios'}</h5>
                            <p className="text-xs text-muted-foreground">
                                {activeDayExercises.length} ejercicios{daySets > 0 ? ` · ${daySets} series` : ''} · igual en todas las semanas
                            </p>
                        </div>
                        <Button
                            size="sm"
                            onClick={openLibrary}
                            className="shrink-0 gap-1.5 rounded-full"
                            disabled={!activeDayId}
                        >
                            <Plus className="h-4 w-4" />
                            Añadir
                        </Button>
                    </div>

                    {activeDayExercises.length > 0 ? (
                        <div className="divide-y divide-border/60">
                            {activeDayExercises.map((ex, index) => (
                                <ExerciseRow
                                    key={ex.id}
                                    index={index}
                                    total={activeDayExercises.length}
                                    exercise={ex}
                                    dayId={activeDayId!}
                                    onUpdate={(updated) => {
                                        setExercises(exercises.map(e => e.id === updated.id ? updated : e))
                                    }}
                                    onDelete={() => {
                                        setExercises(exercises.filter(e => e.id !== ex.id))
                                    }}
                                    onMoveUp={() => moveExerciseLocally(ex.id, 'up')}
                                    onMoveDown={() => moveExerciseLocally(ex.id, 'down')}
                                    dragDisabled={isReorderingExercises}
                                    catalog={catalog}
                                    catalogLoading={catalogLoading}
                                    catalogError={catalogError}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="px-6 py-12 text-center">
                            <Dumbbell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                            <p className="text-sm font-medium">{activeDayId ? 'Este día aún no tiene ejercicios' : 'Selecciona un día para empezar'}</p>
                            {activeDayId && (
                                <Button size="sm" variant="outline" className="mt-3 gap-1.5 rounded-full" onClick={openLibrary}>
                                    <Plus className="h-4 w-4" />
                                    Añadir el primero
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </DndContext>

            <ExerciseLibraryDialog
                open={libraryOpen}
                onOpenChange={setLibraryOpen}
                exercises={catalog}
                onSelect={addExercise}
                loading={catalogLoading}
                error={catalogError}
            />
        </div>
    )
}

function ExerciseRow({ exercise, index, total, dayId, onUpdate, onDelete, onMoveUp, onMoveDown, dragDisabled, catalog, catalogLoading, catalogError }: {
    exercise: any,
    index: number,
    total: number,
    dayId: string,
    onUpdate: (ex: any) => void,
    onDelete: () => void,
    onMoveUp: () => void,
    onMoveDown: () => void,
    dragDisabled: boolean,
    catalog: CatalogExercise[],
    catalogLoading: boolean,
    catalogError: string | null,
}) {
    const { toast } = useToast()
    const {
        attributes,
        listeners,
        setNodeRef: setDraggableRef,
        transform,
        isDragging,
    } = useDraggable({
        id: `exercise-${exercise.id}`,
        data: { exerciseId: exercise.id },
        disabled: dragDisabled,
    })
    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: `exercise-${exercise.id}`,
        data: { exerciseId: exercise.id },
        disabled: dragDisabled,
    })
    const [isProcessing, setIsProcessing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<{ sets: number; weeks: number[] } | null>(null)

    async function updateExerciseFields(fields: Partial<any>) {
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const normalizedFields = {
            ...fields,
            muscle_group: normalizeMuscleGroup(fields.muscle_group ?? exercise.muscle_group),
        }

        const { error } = await supabase
            .from('training_exercises')
            .update({ ...normalizedFields, updated_at: new Date().toISOString() })
            .eq('id', exercise.id)

        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' })
        } else {
            onUpdate({ ...exercise, ...normalizedFields })
        }
    }

    function parseOptionalInteger(value: string) {
        const trimmed = value.trim()
        if (trimmed === '') return null
        const parsed = Number.parseInt(trimmed, 10)
        return Number.isFinite(parsed) ? parsed : null
    }

    function parseOptionalNumber(value: string) {
        const trimmed = value.trim()
        if (trimmed === '') return null
        const parsed = Number.parseFloat(trimmed.replace(',', '.'))
        return Number.isFinite(parsed) ? parsed : null
    }

    async function move(direction: 'up' | 'down') {
        setIsProcessing(true)
        const result = await reorderExerciseAction(exercise.id, direction, dayId)
        if (result.success) {
            if (direction === 'up') onMoveUp()
            else onMoveDown()
        } else {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        }
        setIsProcessing(false)
    }

    async function remove(confirmResults = false) {
        setIsProcessing(true)
        const result = await deleteExerciseAction(exercise.id, { confirmResults })
        setIsProcessing(false)
        if (result.success) {
            setConfirmDelete(null)
            onDelete()
            return
        }
        // NXT-124: con series registradas, se pregunta antes de borrarlas.
        if (result.needsConfirmation) {
            setConfirmDelete({ sets: result.sets, weeks: result.weeks })
            return
        }
        setConfirmDelete(null)
        toast({ title: 'Error al eliminar', description: result.error, variant: 'destructive' })
    }

    const setRowRef = (node: HTMLDivElement | null) => {
        setDraggableRef(node)
        setDroppableRef(node)
    }

    const fieldClass = 'h-9 w-full rounded-lg border border-border/70 bg-muted/30 px-2.5 text-sm font-semibold tabular-nums transition-colors focus:border-primary/50 focus:bg-background focus:outline-none'

    return (
        <div
            ref={setRowRef}
            style={{ transform: CSS.Translate.toString(transform) }}
            className={cn(
                'space-y-2.5 bg-background px-3 py-3 transition-colors sm:px-4',
                isDragging && 'relative z-10 opacity-40',
                isOver && !isDragging && 'bg-primary/5 ring-2 ring-inset ring-primary/20'
            )}
        >
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    disabled={dragDisabled || isProcessing}
                    className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Reordenar ${exercise.exercise_name || 'ejercicio'}`}
                    title="Arrastrar para reordenar"
                    {...listeners}
                    {...attributes}
                >
                    <GripVertical className="h-4 w-4" />
                </button>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums text-muted-foreground">
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <ExerciseCatalogPicker
                        exercises={catalog}
                        value={exercise.catalog_exercise_id}
                        legacyName={exercise.exercise_name}
                        loading={catalogLoading}
                        error={catalogError}
                        className="border-transparent bg-transparent px-2 text-[15px] shadow-none hover:border-border/70"
                        onSelect={selected => updateExerciseFields({
                            catalog_exercise_id: selected.id,
                            exercise_name: selected.name,
                            muscle_group: catalogGroupToMuscleGroup(selected.primary_group),
                        })}
                    />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={isProcessing} aria-label="Más acciones">
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={index === 0} onClick={() => move('up')}>
                            <ArrowUp className="mr-2 h-4 w-4" />
                            Subir
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={index === total - 1} onClick={() => move('down')}>
                            <ArrowDown className="mr-2 h-4 w-4" />
                            Bajar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void remove()}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar ejercicio
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-2 sm:pl-[3.25rem] sm:grid-cols-[5rem_7rem_5rem_6rem_minmax(0,1fr)]">
                <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Series</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        className={fieldClass}
                        value={exercise.sets ?? ''}
                        onChange={e => onUpdate({ ...exercise, sets: e.target.value })}
                        onBlur={e => updateExerciseFields({ sets: parseOptionalInteger(e.target.value) })}
                    />
                </label>
                <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reps</span>
                    <input
                        className={fieldClass}
                        value={exercise.reps ?? ''}
                        placeholder="8-10"
                        onChange={e => onUpdate({ ...exercise, reps: e.target.value })}
                        onBlur={e => updateExerciseFields({ reps: e.target.value })}
                    />
                </label>
                <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">RIR</span>
                    <input
                        inputMode="decimal"
                        className={fieldClass}
                        value={exercise.rir ?? ''}
                        onChange={e => onUpdate({ ...exercise, rir: e.target.value })}
                        onBlur={e => updateExerciseFields({ rir: parseOptionalNumber(e.target.value) })}
                    />
                </label>
                <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Desc. (s)</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        className={fieldClass}
                        value={exercise.rest_seconds ?? ''}
                        placeholder="90"
                        onChange={e => onUpdate({ ...exercise, rest_seconds: e.target.value })}
                        onBlur={e => updateExerciseFields({ rest_seconds: parseOptionalInteger(e.target.value) })}
                    />
                </label>
                <label className="col-span-4 min-w-0 space-y-1 sm:col-span-1">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grupo muscular</span>
                    <span className="flex h-9 items-center rounded-lg border border-border/70 bg-muted/30 px-2.5 text-sm text-muted-foreground" title="Lo define el ejercicio de la biblioteca">
                        {MUSCLE_GROUP_LABELS[normalizeMuscleGroup(exercise.muscle_group)]}
                    </span>
                </label>
                <label className="col-span-4 min-w-0 space-y-1 sm:col-span-5">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notas para el atleta</span>
                    <input
                        className={cn(fieldClass, 'font-normal')}
                        value={exercise.notes ?? ''}
                        placeholder="Técnica, tempo, alternativa…"
                        onChange={e => onUpdate({ ...exercise, notes: e.target.value })}
                        onBlur={e => updateExerciseFields({ notes: e.target.value.trim() || null })}
                    />
                </label>
            </div>

            <AlertDialog open={!!confirmDelete} onOpenChange={open => { if (!open && !isProcessing) setConfirmDelete(null) }}>
                <AlertDialogContent className="max-w-md rounded-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar {exercise.exercise_name || 'este ejercicio'}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDelete && `El atleta tiene ${confirmDelete.sets} ${confirmDelete.sets === 1 ? 'serie registrada' : 'series registradas'} en este ejercicio${describeWeeks(confirmDelete.weeks) ? ` (${describeWeeks(confirmDelete.weeks)})` : ''}. Si lo eliminas, se borran y no se pueden recuperar.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:space-x-0">
                        <Button variant="ghost" disabled={isProcessing} onClick={() => setConfirmDelete(null)}>Cancelar</Button>
                        <Button variant="destructive" disabled={isProcessing} onClick={() => void remove(true)} className="gap-2">
                            {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                            Eliminar y borrar {confirmDelete?.sets} {confirmDelete?.sets === 1 ? 'serie' : 'series'}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
