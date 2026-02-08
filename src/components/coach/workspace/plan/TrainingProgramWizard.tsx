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
    Settings2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface TrainingProgramWizardProps {
    programId: string | null
    coachId?: string
    clientId?: string
    isOpen: boolean
    initialStep?: number
    onOpenChange: (open: boolean) => void
    onClose: () => void
}

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
                const defaults = [
                    { program_id: idToLoad, coach_id: prog.coach_id, key: 'sets', label: 'Series', order_index: 1, data_type: 'text', editable_by: 'coach' },
                    { program_id: idToLoad, coach_id: prog.coach_id, key: 'reps', label: 'Reps', order_index: 2, data_type: 'text', editable_by: 'coach' },
                    { program_id: idToLoad, coach_id: prog.coach_id, key: 'rir', label: 'RIR', order_index: 3, data_type: 'text', editable_by: 'coach' },
                    { program_id: idToLoad, coach_id: prog.coach_id, key: 'rest', label: 'Descanso', order_index: 4, data_type: 'text', editable_by: 'coach' },
                    { program_id: idToLoad, coach_id: prog.coach_id, key: 'notes', label: 'Notas', order_index: 5, data_type: 'text', editable_by: 'coach' },
                ]
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
                // INSERT
                const { data, error } = await supabase
                    .from('training_programs')
                    .insert(payload)
                    .select()
                    .single()

                if (error) throw error
                toast({ title: 'Programa creado', description: 'Ahora puedes gestionar los días.' })
                if (onCreated) onCreated(data.id)
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

const StepDays = React.forwardRef(({ days, setDays, programId, coachId }: { days: any[], setDays: (d: any[]) => void, programId: string, coachId: string }, ref) => {
    const { toast } = useToast()
    const [localDays, setLocalDays] = useState([...days])
    const [isSaving, setIsSaving] = useState(false)

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

            // Sync days (delete all and re-insert)
            await supabase.from('training_days').delete().eq('program_id', programId)

            const daysToInsert = localDays.map((day, idx) => ({
                program_id: programId,
                coach_id: coachId,
                name: day.name,
                order_index: idx + 1,
                day_name: day.name,
                day_order: idx + 1
            }))

            if (daysToInsert.length > 0) {
                const { error: insError } = await supabase
                    .from('training_days')
                    .insert(daysToInsert)
                if (insError) throw insError
            }

            // Fetch fresh
            const { data: freshData, error: refreshError } = await supabase
                .from('training_days')
                .select('*')
                .eq('program_id', programId)
                .order('order_index', { ascending: true })

            if (refreshError) throw refreshError

            const mappedFresh = (freshData || []).map(d => ({
                ...d,
                name: d.name || d.day_name,
                order_index: d.order_index ?? d.day_order
            }))

            setDays(mappedFresh)
            setLocalDays(mappedFresh)
            toast({ title: 'Días sincronizados', description: 'La estructura ha sido actualizada.' })
            return true
        } catch (error: any) {
            toast({ title: 'Error al actualizar días', description: error.message, variant: 'destructive' })
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const addDay = () => setLocalDays([...localDays, { id: `new-${Date.now()}`, name: 'Nuevo Día' }])
    const removeDay = (id: string) => setLocalDays(localDays.filter(d => d.id !== id))

    return (
        <Card className="p-8 max-w-2xl mx-auto shadow-md border-primary/10">
            <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-semibold">Días del Programa</h4>
                <Button size="sm" variant="outline" onClick={addDay} className="gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/5">
                    <Plus className="h-4 w-4" /> Añadir Día
                </Button>
            </div>
            <div className="space-y-3">
                {localDays.map((day, idx) => (
                    <div key={day.id} className="flex gap-3 items-center bg-muted/40 p-3 rounded-xl border border-transparent hover:border-primary/20 transition-all group">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                            {idx + 1}
                        </div>
                        <Input
                            value={day.name}
                            onChange={e => {
                                const updated = [...localDays]
                                updated[idx].name = e.target.value
                                setLocalDays(updated)
                            }}
                            className="bg-background/50 border-0 focus-visible:ring-1 focus-visible:ring-primary h-12 text-md"
                        />
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
                    <span className="text-sm font-medium">Sincronizando estructura de días...</span>
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
    const activeDayExercises = exercises.filter(e => e.day_id === activeDayId)

    async function addExercise() {
        if (!activeDayId) {
            toast({ title: 'Atención', description: 'Selecciona primero un día de entrenamiento.' })
            return
        }

        const supabase = createClient()

        // 1. Session check
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
            toast({ title: 'Error', description: 'Sesión expirada', variant: 'destructive' })
            return
        }

        const order = activeDayExercises.length + 1

        const { data, error } = await supabase
            .from('training_exercises')
            .insert({
                program_id: programId,
                coach_id: program.coach_id,
                day_id: activeDayId,
                exercise_name: 'Nuevo Ejercicio',
                order_index: order,
                sets: 3,
                reps: '10',
                rir: '2',
                rest_seconds: 60,
                notes: ''
            })
            .select()
            .single()

        if (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' })
        } else {
            setExercises([...exercises, data])
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

                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-primary/10">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-muted/30 text-left text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                                <th className="p-5 border-b font-bold min-w-[250px]">Ejercicio</th>
                                {cols.map(col => (
                                    <th key={col.id} className="p-5 border-b font-bold text-center min-w-[100px]">{col.label}</th>
                                ))}
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
                                        // Update state immediately for UI
                                        const newCell = {
                                            exercise_id: ex.id,
                                            column_id: columnId,
                                            week_index: activeWeek,
                                            value: value
                                        }
                                        const updatedCells = [...cells.filter(c => !(c.exercise_id === ex.id && c.column_id === columnId && c.week_index === activeWeek)), newCell]
                                        setCells(updatedCells)
                                    }}
                                />
                            ))}
                            {activeDayExercises.length === 0 && activeDayId && (
                                <tr>
                                    <td colSpan={cols.length + 2} className="p-16 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-30">
                                            <Dumbbell className="h-10 w-10 mb-2" />
                                            <p className="text-lg font-semibold italic">No hay ejercicios para este día. ¡Añade el primero!</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!activeDayId && (
                                <tr>
                                    <td colSpan={cols.length + 2} className="p-16 text-center">
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

function ExerciseRow({ exercise, programId, coachId, dayId, weekIndex, columns, allCells, onUpdate, onDelete, onCellUpdate }: {
    exercise: any,
    programId: string,
    coachId: string,
    dayId: string,
    weekIndex: number,
    columns: any[],
    allCells: any[],
    onUpdate: (ex: any) => void,
    onDelete: () => void,
    onCellUpdate: (colId: string, val: string) => void
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

    async function deleteExercise() {
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { error } = await supabase
            .from('training_exercises')
            .delete()
            .eq('id', exercise.id)

        if (error) {
            toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' })
        } else {
            onDelete()
        }
    }

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
            {columns.map(col => (
                <td key={col.id} className="p-2 px-4 relative">
                    <Input
                        className={`text-center font-medium bg-muted/20 border-0 focus-visible:ring-1 focus-visible:ring-primary h-11 rounded-xl placeholder:opacity-30 transition-all ${isSaving[col.id] ? 'opacity-50 grayscale' : ''
                            }`}
                        value={rowCells[col.id] || ''}
                        onChange={e => setRowCells(prev => ({ ...prev, [col.id]: e.target.value }))}
                        onBlur={e => handleCellUpdate(col.id, e.target.value)}
                        placeholder="-"
                        disabled={isSaving[col.id]}
                    />
                    {isSaving[col.id] && (
                        <div className="absolute right-6 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        </div>
                    )}
                </td>
            ))}
            <td className="p-2 pr-5 text-right w-12 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 rounded-full active:scale-90"
                    onClick={deleteExercise}
                    title="Eliminar ejercicio"
                >
                    <Trash2 className="h-5 w-5" />
                </Button>
            </td>
        </tr>
    )
}
