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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
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
    ArrowDown
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { TemplateImportDialog } from './TemplateImportDialog'
import { TrainingTemplate, StrengthStructure } from '@/types/templates'
import { saveTrainingDays } from '../clientActions'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { addExerciseAction, deleteExerciseAction, reorderExerciseAction } from '../actions'

interface TrainingProgramWizardProps {
    programId: string | null
    coachId?: string
    clientId?: string
    isOpen: boolean
    initialStep?: number
    onOpenChange: (open: boolean) => void
    onClose: () => void
}

import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'

export function TrainingProgramWizard({
    programId,
    coachId,
    clientId,
    isOpen,
    initialStep = 1,
    onOpenChange,
    onClose
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
                // Initialize for creation
                setProgram({
                    name: 'Nuevo Programa',
                    weeks: 4,
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

    const handleImportTemplate = async (template: TrainingTemplate) => {
        if (template.type !== 'strength') {
            toast({ title: 'Error', description: 'Solo se pueden importar plantillas de fuerza.', variant: 'destructive' })
            return
        }

        const structure = template.structure as StrengthStructure
        if (!structure.days || structure.days.length === 0) {
            toast({ title: 'Aviso', description: 'La plantilla está vacía.' })
            return
        }

        // Build new days + exercises with explicit UUIDs
        const newDays: any[] = []
        const newExercises: any[] = []

        structure.days.forEach((day, dIdx) => {
            const newDayId = crypto.randomUUID()
            newDays.push({
                id: newDayId,
                name: day.name,
                order_index: dIdx + 1,
            })

            if (day.exercises) {
                day.exercises.forEach((ex, eIdx) => {
                    newExercises.push({
                        id: crypto.randomUUID(),
                        day_id: newDayId,
                        exercise_name: ex.exercise_name || '',
                        order_index: ex.order ?? eIdx + 1,
                        sets: ex.sets ?? 3,
                        reps: ex.reps ?? '10',
                        rir: ex.rir != null ? Number(ex.rir) : null,
                        rest_seconds: ex.rest_seconds ?? 60,
                        notes: ex.notes || null,
                    })
                })
            }
        })

        // Update weeks if template provides them
        if (structure.weeks) {
            setProgram((prev: any) => ({ ...prev, weeks: structure.weeks }))
        }

        // If program already saved to DB (Step 1 done), persist directly and advance
        if (currentProgramId) {
            const supabase = createClient()

            // 1. Update weeks if template provides them
            if (structure.weeks) {
                await supabase.from('training_programs').update({ weeks: structure.weeks }).eq('id', currentProgramId)
            }

            // 2. Delete existing days (cascades exercises via FK)
            await supabase.from('training_exercises').delete().eq('program_id', currentProgramId)
            await supabase.from('training_days').delete().eq('program_id', currentProgramId)

            // 3. Insert new days (single insert, explicit IDs)
            const daysToInsert = newDays.map(d => ({
                id: d.id,
                program_id: currentProgramId,
                coach_id: program.coach_id,
                name: d.name,
                order_index: d.order_index,
                day_name: d.name,
                day_order: d.order_index,
            }))
            const { error: daysError } = await supabase.from('training_days').insert(daysToInsert)
            if (daysError) {
                toast({ title: 'Error al importar días', description: daysError.message, variant: 'destructive' })
                return
            }

            // 4. Insert exercises (explicit IDs, referencing new day IDs)
            if (newExercises.length > 0) {
                const exsToInsert = newExercises.map(e => ({
                    id: e.id,
                    program_id: currentProgramId,
                    coach_id: program.coach_id,
                    day_id: e.day_id,
                    exercise_name: e.exercise_name,
                    order_index: e.order_index,
                    sets: e.sets,
                    reps: e.reps,
                    rir: e.rir,
                    rest_seconds: e.rest_seconds,
                    notes: e.notes,
                }))
                const { error: exError } = await supabase.from('training_exercises').insert(exsToInsert)
                if (exError) {
                    toast({ title: 'Error al importar ejercicios', description: exError.message, variant: 'destructive' })
                    return
                }
            }

            toast({
                title: 'Plantilla Importada',
                description: `Se han cargado ${newDays.length} días y ${newExercises.length} ejercicios. Asigna el día de la semana a cada uno.`,
            })

            // Reload data and stay on Step 2 so user can assign weekdays
            await loadAllData(currentProgramId)
        } else {
            // Fallback: just update local state (unlikely — Step 1 should create the program first)
            setDays(newDays)
            setExercises(newExercises)
            toast({
                title: 'Plantilla Importada',
                description: `Se han cargado ${newDays.length} días y ${newExercises.length} ejercicios.`,
            })
        }
    }

    if (loading && isOpen) {
        return (
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl h-[80vh] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden gap-0 bg-background border-primary/20">
                <DialogHeader className="p-6 border-b shrink-0 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl flex items-center gap-2 font-bold tracking-tight">
                                <Settings2 className="h-5 w-5 text-primary" />
                                Configurar Programa: {program?.name}
                            </DialogTitle>
                            <div className="flex items-center gap-4 mt-1">
                                <p className="text-sm text-muted-foreground">
                                    Paso {step} de 3: {
                                        step === 1 ? 'Información General' :
                                            step === 2 ? 'Gestión de Días' :
                                                'Planificación Detallada'
                                    }
                                </p>
                                <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                                <p className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {program?.weeks} semanas
                                </p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
                            Cerrar
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 bg-muted/10 space-y-6">
                    {step === 1 && (
                        <StepInfo
                            ref={step1Ref}
                            program={program}
                            setProgram={setProgram}
                            programId={currentProgramId}
                            coachId={coachId}
                            clientId={clientId}
                            onCreated={(newId) => {
                                setCurrentProgramId(newId)
                                loadAllData(newId)
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
                            <Button onClick={onClose} className="gap-2 bg-success hover:bg-success/90 px-6 font-semibold shadow-sm shadow-success/10">
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
        <Card className="p-8 max-w-xl mx-auto shadow-md border-primary/10">
            <h4 className="text-lg font-semibold mb-6">Detalles del Programa</h4>
            <div className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Nombre del programa</Label>
                    <Input
                        id="name"
                        value={localProgram.name}
                        onChange={e => setLocalProgram({ ...localProgram, name: e.target.value })}
                        className="bg-muted/30 border-0 focus-visible:ring-primary h-12 text-lg"
                    />
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="weeks" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Semanas de duración</Label>
                        <Input
                            id="weeks"
                            type="number"
                            value={localProgram.weeks}
                            onChange={e => setLocalProgram({ ...localProgram, weeks: parseInt(e.target.value) || 0 })}
                            className="bg-muted/30 border-0 focus-visible:ring-primary h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="start" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fecha de inicio</Label>
                        <Input
                            id="start"
                            type="date"
                            value={localProgram.effective_from}
                            onChange={e => setLocalProgram({ ...localProgram, effective_from: e.target.value })}
                            className="bg-muted/30 border-0 focus-visible:ring-primary h-12"
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
        </Card>
    )
})
StepInfo.displayName = 'StepInfo'

const StepDays = React.forwardRef(({ days, setDays, programId, coachId, onImportRequest }: { days: any[], setDays: (d: any[]) => void, programId: string, coachId: string, onImportRequest: () => void }, ref) => {
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
            const result = await saveTrainingDays(programId, localDays)

            if (!result.success) {
                throw new Error(result.error || 'Error al guardar los días')
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
        <Card className="p-8 max-w-2xl mx-auto shadow-md border-primary/10">
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-semibold">Días del Programa</h4>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={onImportRequest} className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
                        <Download className="h-4 w-4" /> Importar Plantilla
                    </Button>
                    <Button size="sm" variant="outline" onClick={addDay} className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/5">
                        <Plus className="h-4 w-4" /> Añadir Día
                    </Button>
                </div>
            </div>
            <div className="space-y-3">
                {localDays.map((day, idx) => (
                    <div key={day.id} className="flex gap-3 items-center bg-muted/40 p-3 rounded-xl border border-transparent hover:border-primary/20 transition-all group">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                            {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                            <Input
                                value={day.name}
                                onChange={e => {
                                    const updated = [...localDays]
                                    updated[idx].name = e.target.value
                                    updateDays(updated)
                                }}
                                className="bg-background/50 border-0 focus-visible:ring-1 focus-visible:ring-primary h-10 flex-1"
                                placeholder="Nombre del día (ej: Torso)"
                            />
                            <Select
                                value={day.default_weekday?.toString() || "0"}
                                onValueChange={(val) => {
                                    const updated = [...localDays]
                                    updated[idx].default_weekday = val === "0" ? undefined : parseInt(val)
                                    updateDays(updated)
                                }}
                            >
                                <SelectTrigger className="w-[140px] h-10 bg-background/50 border-0">
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
                            className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 h-10 w-10 shrink-0"
                            onClick={() => removeDay(day.id)}
                        >
                            <Trash2 className="h-5 w-5" />
                        </Button>
                    </div>
                ))}
            </div>
            {isSaving && (
                <div className="flex items-center gap-2 text-primary animate-pulse mt-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Auto-agendando sesiones...</span>
                </div>
            )}
        </Card>
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
    const activeDayExercises = exercises
        .filter(e => e.day_id === activeDayId)
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

    async function addExercise() {
        if (!activeDayId) {
            toast({ title: 'Atención', description: 'Selecciona primero un día de entrenamiento.' })
            return
        }
        const order = activeDayExercises.length + 1
        const result = await addExerciseAction(activeDayId, 'Nuevo Ejercicio', order)
        if (!result.success) {
            toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else if (result.exercise) {
            setExercises([...exercises, result.exercise])
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center bg-background/50 p-4 rounded-2xl border border-primary/5">
                <div className="space-y-2 shrink-0">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Semana de planificación</Label>
                    <Tabs value={activeWeek.toString()} onValueChange={(v) => setActiveWeek(parseInt(v))} className="w-auto">
                        <TabsList className="bg-muted/50 p-1">
                            {Array.from({ length: program?.weeks || 4 }).map((_, i) => (
                                <TabsTrigger key={i + 1} value={(i + 1).toString()} className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
                                    W{i + 1}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                <div className="space-y-2 w-full xl:w-auto">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Día de entrenamiento</Label>
                    <Tabs value={activeDayId || ''} onValueChange={setActiveDayId} className="w-full xl:w-auto">
                        <TabsList className="w-full xl:w-auto bg-muted/50 p-1 overflow-x-auto flex-nowrap justify-start scrollbar-hide">
                            {days.map(day => (
                                <TabsTrigger key={day.id} value={day.id} className="data-[state=active]:bg-background data-[state=active]:shadow-sm min-w-[120px]">
                                    {day.name}
                                </TabsTrigger>
                            ))}
                            {days.length === 0 && (
                                <div className="px-4 py-2 text-xs italic opacity-50">Configura los días en el Paso 2</div>
                            )}
                        </TabsList>
                    </Tabs>
                </div>
            </div>

            <Card className="overflow-hidden border-0 shadow-2xl rounded-2xl bg-background outline outline-1 outline-primary/5">
                <div className="p-5 bg-gradient-to-r from-primary/5 via-transparent to-transparent border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Dumbbell className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h5 className="font-bold text-lg leading-none">Ejercicios</h5>
                            <p className="text-xs text-muted-foreground mt-1">
                                Planificando para <span className="text-primary font-bold">Semana {activeWeek}</span>
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        onClick={addExercise}
                        className="gap-2 font-bold px-4 rounded-xl shadow-lg shadow-primary/10 transition-all active:scale-95"
                        disabled={!activeDayId}
                    >
                        <Plus className="h-4 w-4" /> Añadir Ejercicio
                    </Button>
                </div>

                <div className="scrollbar-thin scrollbar-thumb-primary/10">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-muted/30 text-left text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                                <th className="p-5 border-b font-bold min-w-[250px]">Ejercicio</th>
                                <th className="p-5 border-b font-bold w-12 shrink-0"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeDayExercises.map(ex => (
                                <ExerciseRow
                                    key={`${ex.id}-${activeWeek}`}
                                    exercise={ex}
                                    programId={programId}
                                    coachId={program.coach_id}
                                    dayId={activeDayId!}
                                    weekIndex={activeWeek}
                                    columns={cols}
                                    allCells={cells}
                                    onUpdate={(updated) => {
                                        setExercises(exercises.map(e => e.id === updated.id ? updated : e))
                                    }}
                                    onDelete={() => {
                                        setExercises(exercises.filter(e => e.id !== ex.id))
                                    }}
                                    onCellUpdate={(columnId: string, value: string) => {
                                        const newCell = {
                                            exercise_id: ex.id,
                                            column_id: columnId,
                                            week_index: activeWeek,
                                            value: value
                                        }
                                        const updatedCells = [...cells.filter(c => !(c.exercise_id === ex.id && c.column_id === columnId && c.week_index === activeWeek)), newCell]
                                        setCells(updatedCells)
                                    }}
                                    onMoveUp={() => {
                                        const dayExs = exercises.filter((e: any) => e.day_id === activeDayId).sort((a: any, b: any) => a.order_index - b.order_index)
                                        const idx = dayExs.findIndex((e: any) => e.id === ex.id)
                                        if (idx <= 0) return
                                        const updated = [...exercises]
                                        const aIdx = updated.findIndex((e: any) => e.id === dayExs[idx].id)
                                        const bIdx = updated.findIndex((e: any) => e.id === dayExs[idx - 1].id)
                                        const tmpOrder = updated[aIdx].order_index
                                        updated[aIdx] = { ...updated[aIdx], order_index: updated[bIdx].order_index }
                                        updated[bIdx] = { ...updated[bIdx], order_index: tmpOrder }
                                        setExercises(updated)
                                    }}
                                    onMoveDown={() => {
                                        const dayExs = exercises.filter((e: any) => e.day_id === activeDayId).sort((a: any, b: any) => a.order_index - b.order_index)
                                        const idx = dayExs.findIndex((e: any) => e.id === ex.id)
                                        if (idx < 0 || idx >= dayExs.length - 1) return
                                        const updated = [...exercises]
                                        const aIdx = updated.findIndex((e: any) => e.id === dayExs[idx].id)
                                        const bIdx = updated.findIndex((e: any) => e.id === dayExs[idx + 1].id)
                                        const tmpOrder = updated[aIdx].order_index
                                        updated[aIdx] = { ...updated[aIdx], order_index: updated[bIdx].order_index }
                                        updated[bIdx] = { ...updated[bIdx], order_index: tmpOrder }
                                        setExercises(updated)
                                    }}
                                />
                            ))}
                            {activeDayExercises.length === 0 && activeDayId && (
                                <tr>
                                    <td colSpan={2} className="p-16 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-30">
                                            <Dumbbell className="h-10 w-10 mb-2" />
                                            <p className="text-lg font-semibold italic">No hay ejercicios para este día. ¡Añade el primero!</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!activeDayId && (
                                <tr>
                                    <td colSpan={2} className="p-16 text-center">
                                        <p className="text-lg font-semibold italic opacity-30">Selecciona un día de arriba para empezar a configurar</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

function ExerciseRow({ exercise, programId, coachId, dayId, weekIndex, columns, allCells, onUpdate, onDelete, onCellUpdate, onMoveUp, onMoveDown }: {
    exercise: any,
    programId: string,
    coachId: string,
    dayId: string,
    weekIndex: number,
    columns: any[],
    allCells: any[],
    onUpdate: (ex: any) => void,
    onDelete: () => void,
    onCellUpdate: (colId: string, val: string) => void,
    onMoveUp: () => void,
    onMoveDown: () => void
}) {
    const { toast } = useToast()
    const [rowCells, setRowCells] = useState<Record<string, string>>({})
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const cellMap: Record<string, string> = {}
        allCells.forEach(c => {
            if (c.exercise_id === exercise.id && c.week_index === weekIndex) {
                cellMap[c.column_id] = c.value?.value || c.value || ''
            }
        })
        setRowCells(cellMap)
    }, [exercise.id, weekIndex, allCells])

    async function handleCellUpdate(columnId: string, value: string) {
        setIsSaving(prev => ({ ...prev, [columnId]: true }))
        const supabase = createClient()

        // Optimistic update
        onCellUpdate(columnId, value)

        try {
            // 1. Session check
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast({ title: 'Error', description: 'Sesión expirada', variant: 'destructive' })
                return
            }

            const dbValue = value.trim() === '' ? null : value

            const { error } = await supabase
                .from('training_cells')
                .upsert({
                    program_id: programId,
                    coach_id: coachId,
                    day_id: dayId,
                    exercise_id: exercise.id,
                    column_id: columnId,
                    week_index: weekIndex,
                    value: dbValue,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'exercise_id,column_id,week_index'
                })

            if (error) {
                console.error('[DEBUG] Upsert error:', error)
                toast({ title: 'Error al persistir', description: error.message, variant: 'destructive' })
            }
        } catch (err: any) {
            console.error('[CRITICAL] Cell update failed:', err)
        } finally {
            setIsSaving(prev => ({ ...prev, [columnId]: false }))
        }
    }

    async function updateExerciseFields(fields: Partial<any>) {
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase
            .from('training_exercises')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', exercise.id)

        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' })
        } else {
            onUpdate({ ...exercise, ...fields })
        }
    }

    const [isProcessing, setIsProcessing] = useState(false)

    return (
        <tr className="hover:bg-primary/5 transition-all group border-b last:border-0 border-muted-foreground/10">
            <td className="p-4 px-5">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-6 bg-primary/20 rounded-full group-hover:bg-primary/50 transition-colors shrink-0" />
                        <Input
                            className="font-bold bg-transparent border-0 focus-visible:ring-1 focus-visible:ring-primary shadow-none h-11 px-2 text-md transition-all placeholder:italic"
                            value={exercise.exercise_name}
                            onChange={e => onUpdate({ ...exercise, exercise_name: e.target.value })}
                            onBlur={e => updateExerciseFields({ exercise_name: e.target.value })}
                            placeholder="Escribe el nombre del ejercicio..."
                        />
                    </div>
                    {/* Metrics Row */}
                    <div className="flex items-center gap-3 pl-4">
                        <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg border border-primary/5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Sets:</span>
                            <input
                                type="number"
                                className="w-8 bg-transparent text-xs font-bold focus:outline-none"
                                value={exercise.sets || ''}
                                onChange={e => onUpdate({ ...exercise, sets: parseInt(e.target.value) || 0 })}
                                onBlur={e => updateExerciseFields({ sets: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg border border-primary/5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Reps:</span>
                            <input
                                className="w-12 bg-transparent text-xs font-bold focus:outline-none"
                                value={exercise.reps || ''}
                                onChange={e => onUpdate({ ...exercise, reps: e.target.value })}
                                onBlur={e => updateExerciseFields({ reps: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg border border-primary/5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">RIR:</span>
                            <input
                                className="w-8 bg-transparent text-xs font-bold focus:outline-none"
                                value={exercise.rir || ''}
                                onChange={e => onUpdate({ ...exercise, rir: e.target.value })}
                                onBlur={e => updateExerciseFields({ rir: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-muted/30 px-2 py-1 rounded-lg border border-primary/5">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Rest:</span>
                            <input
                                type="number"
                                className="w-10 bg-transparent text-xs font-bold focus:outline-none"
                                value={exercise.rest_seconds || ''}
                                onChange={e => onUpdate({ ...exercise, rest_seconds: parseInt(e.target.value) || 0 })}
                                onBlur={e => updateExerciseFields({ rest_seconds: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                </div>
            </td>
            <td className="p-2 pr-5 text-right w-12 shrink-0">
                <div className="flex items-center gap-0.5 justify-end">
                    <button
                        disabled={isProcessing}
                        onClick={async () => {
                            setIsProcessing(true)
                            const result = await reorderExerciseAction(exercise.id, 'up', dayId)
                            if (result.success) onMoveUp()
                            else toast({ title: 'Error', description: result.error, variant: 'destructive' })
                            setIsProcessing(false)
                        }}
                        className="p-1 hover:bg-muted rounded transition-all text-muted-foreground hover:text-foreground disabled:opacity-40"
                        title="Subir ejercicio"
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        disabled={isProcessing}
                        onClick={async () => {
                            setIsProcessing(true)
                            const result = await reorderExerciseAction(exercise.id, 'down', dayId)
                            if (result.success) onMoveDown()
                            else toast({ title: 'Error', description: result.error, variant: 'destructive' })
                            setIsProcessing(false)
                        }}
                        className="p-1 hover:bg-muted rounded transition-all text-muted-foreground hover:text-foreground disabled:opacity-40"
                        title="Bajar ejercicio"
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={isProcessing}
                        className="text-destructive h-10 w-10 transition-opacity hover:bg-destructive/10 rounded-full active:scale-90 disabled:opacity-40"
                        onClick={async () => {
                            setIsProcessing(true)
                            const result = await deleteExerciseAction(exercise.id)
                            if (!result.success) {
                                toast({ title: 'Error al eliminar', description: result.error, variant: 'destructive' })
                            } else {
                                onDelete()
                            }
                            setIsProcessing(false)
                        }}
                        title="Eliminar ejercicio"
                    >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                    </Button>
                </div>
            </td>
        </tr>
    )
}
