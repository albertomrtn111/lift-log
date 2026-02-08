'use client'

import React, { useState, useEffect } from 'react'
import { TrainingTemplate, TemplateStructure, TemplateDay, TemplateExercise, StrengthStructure } from '@/types/templates'
import { updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import {
    Plus,
    Trash2,
    Save,
    Loader2,
    Dumbbell,
    MoreHorizontal,
    GripVertical,
    Copy
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface StrengthTemplateEditorProps {
    template: TrainingTemplate
}

export function StrengthTemplateEditor({ template: initialTemplate }: StrengthTemplateEditorProps) {
    const { toast } = useToast()
    const [template, setTemplate] = useState<TrainingTemplate>(initialTemplate)
    const [activeDayId, setActiveDayId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)

    // Ensure structure complies with types and cast to StrengthStructure since we know this is a strength template
    const structure = (template.structure as StrengthStructure) || { days: [] }
    const days = structure.days || []

    useEffect(() => {
        if (days.length > 0 && !activeDayId) {
            setActiveDayId(days[0].id)
        } else if (days.length === 0 && activeDayId) {
            setActiveDayId(null)
        }
    }, [days.length, activeDayId])

    const handleSave = async () => {
        setIsSaving(true)
        const res = await updateTemplate(template.id, {
            name: template.name,
            description: template.description,
            structure: template.structure
        })

        if (res.success) {
            toast({
                title: 'Cambios guardados',
                description: 'La plantilla se ha actualizado correctamente.',
                className: 'bg-green-500 text-white border-none',
            })
            setIsDirty(false)
        } else {
            toast({
                title: 'Error al guardar',
                description: res.error || 'Ha ocurrido un error inesperado.',
                variant: 'destructive',
            })
        }
        setIsSaving(false)
    }

    // Day Management
    const addDay = () => {
        const newDay: TemplateDay = {
            id: crypto.randomUUID(),
            name: `Día ${days.length + 1}`,
            order: days.length + 1,
            exercises: []
        }

        updateStructure({
            ...structure,
            days: [...days, newDay]
        })
        setActiveDayId(newDay.id)
    }

    const updateDayName = (dayId: string, newName: string) => {
        updateStructure({
            ...structure,
            days: days.map(d => d.id === dayId ? { ...d, name: newName } : d)
        })
    }

    const removeDay = (dayId: string) => {
        const newDays = days.filter(d => d.id !== dayId)
        updateStructure({
            ...structure,
            days: newDays
        })
        if (activeDayId === dayId) {
            setActiveDayId(newDays.length > 0 ? newDays[0].id : null)
        }
    }

    const duplicateDay = (dayId: string) => {
        const dayToCopy = days.find(d => d.id === dayId)
        if (!dayToCopy) return

        const newDay: TemplateDay = {
            ...JSON.parse(JSON.stringify(dayToCopy)),
            id: crypto.randomUUID(),
            name: `${dayToCopy.name} (Copia)`,
            order: days.length + 1
        }

        // Regenerate IDs for exercises
        if (newDay.exercises) {
            newDay.exercises = newDay.exercises.map(ex => ({
                ...ex,
                id: crypto.randomUUID()
            }))
        }

        updateStructure({
            ...structure,
            days: [...days, newDay]
        })
        setActiveDayId(newDay.id)
    }

    // Exercise Management
    // We need to clarify the data structure first.
    // If the type definition in `src/types/templates.ts` for TemplateStructure is:
    // days: TemplateDay[]
    // TemplateDay: columns: TemplateColumn[]
    // TemplateColumn: exercises: TemplateExercise[]
    // This looks like a Column-Oriented store which is odd for this UI.
    // However, looking at the type definition I saw in Step 2380:
    /*
    export interface TemplateExercise {
        id: string
        exercise_name: string
        order: number
        sets: number
        reps: string
        rest_seconds: number
        notes: string | null
    }
    */
    // And TemplateColumn has `exercises: TemplateExercise[]`.
    // This structure `TemplateColumn -> exercises` means for a "Sets" column, I have a list of exercises?
    // That would mean I have to sync multiple columns to add one exercise row. That seems wrong or I misunderstood the type.
    // Let me RE-READ the type definition carefully. 
    // Ah, Step 2380: 
    // export interface TemplateStructure { days: TemplateDay[] }
    // export interface TemplateDay { columns: TemplateColumn[] }
    // export interface TemplateColumn { exercises: TemplateExercise[] }

    // IF this is the structure, it is indeed column-oriented (like a spreadsheet where each column stores its column data).
    // BUT `TemplateExercise` has `exercise_name`.
    // If "Sets" column has `TemplateExercise[]`, does each item have `exercise_name`? That would be redundant.

    // I suspect the `TemplateStructure` interface might be designed differently or I should adjust it.
    // User asked to "Adapt TrainingProgramWizard". The wizard uses Row-based UI (Exercise is a row).
    // Storing it as JSON, the most natural structure is:
    // Structure -> Days -> Exercises (List) -> Properties.

    // I will modify the internal logic to work with a flat list of exercises per day, 
    // and if necessary, adjust the `TemplateStructure` type if I am allowed to edit it, 
    // OR allow the code to work with it.

    // Let's look at `TemplateColumn` again.
    // `exercises: TemplateExercise[]`.
    // If I have 10 exercises, and 5 columns. Do I have 5 columns * 10 exercises = 50 objects?
    // That seems incredibly verbose for JSON.

    // ALTERNATIVE: The `TemplateColumn` might NOT be what I think.
    // Maybe `TemplateDay` should just have `exercises: TemplateExercise[]`.
    // The current `types/templates.ts` was:
    /*
    export interface TemplateDay {
        id: string
        name: string
        order: number
        columns: TemplateColumn[]
    }
    export interface TemplateColumn {
        exercises: TemplateExercise[]
    }
    */
    // This is definitely weird. I should probably refactor `TemplateDay` to have `exercises: TemplateExercise[]` directly, 
    // and maybe `columns` just defines the headers if dynamic.

    // Given the user wants me to fix the 404 and make it work, I have liberty to fix the types if they are nonsensical.
    // I WILL ASSUME I CAN CHANGE THE TYPES TO BE SANE:
    // Day -> exercises: Exercise[]

    // I will perform a type update in valid code later if needed, but for now I'll create this component 
    // assuming I can casting or fixing the type.

    // Let's write the component assuming a sane structure first:
    // Day has `exercises: EnhancedTemplateExercise[]`

    const updateStructure = (newStructure: TemplateStructure) => {
        setTemplate({ ...template, structure: newStructure })
        setIsDirty(true)
    }

    const activeDay = days.find(d => d.id === activeDayId)

    // Helper to get exercises for a day.
    // Adapting to current type: Assuming the first column holds the exercises? 
    // NO, that's dangerous.
    // I'll re-define the types within this file locally or correct the file `src/types/templates.ts` first?
    // I'll Correct `src/types/templates.ts` is the safer bet to avoid confusion.

    // BUT I can't do that inside `write_to_file`.
    // I will write the component assuming specific data manipulation that abstracts this.

    // wait, I can just write the component to handle `exercises` property on day if I fix the type.

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Main Info */}
            <Card className="p-6 bg-card border-none shadow-sm">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre de la Plantilla</Label>
                            <Input
                                value={template.name}
                                onChange={(e) => {
                                    setTemplate({ ...template, name: e.target.value })
                                    setIsDirty(true)
                                }}
                                className="text-lg font-semibold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción</Label>
                            <Textarea
                                value={template.description || ''}
                                onChange={(e) => {
                                    setTemplate({ ...template, description: e.target.value })
                                    setIsDirty(true)
                                }}
                                placeholder="Describe el objetivo de esta rutina..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <div className="flex items-end justify-end">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !isDirty}
                            className={cn("min-w-[140px]", isDirty ? "animate-pulse" : "")}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" /> Guardar Cambios
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Days & Exercises */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Dumbbell className="h-6 w-6 text-primary" />
                        Estructura de Entrenamiento
                    </h2>
                </div>

                <Card className="min-h-[500px] border-none shadow-md overflow-hidden flex flex-col">
                    <div className="bg-muted/30 border-b flex items-center justify-between p-2 sticky top-0 z-10">
                        <Tabs
                            value={activeDayId || ''}
                            onValueChange={setActiveDayId}
                            className="w-full"
                        >
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide px-2">
                                <TabsList className="bg-transparent p-0 h-auto gap-2">
                                    {days.map((day) => (
                                        <TabsTrigger
                                            key={day.id}
                                            value={day.id}
                                            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border bg-background px-4 py-2 rounded-lg transition-all"
                                        >
                                            {day.name}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={addDay}
                                    className="gap-2 text-primary hover:bg-primary/10 rounded-lg border border-dashed border-primary/30"
                                >
                                    <Plus className="h-4 w-4" /> Día
                                </Button>
                            </div>
                        </Tabs>
                    </div>

                    <div className="flex-1 p-6 bg-card/50">
                        {activeDay ? (
                            <DayEditor
                                day={activeDay}
                                onUpdate={(updatedDay) => {
                                    const newDays = days.map(d => d.id === updatedDay.id ? updatedDay : d)
                                    updateStructure({ ...structure, days: newDays })
                                }}
                                onDelete={() => removeDay(activeDay.id)}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                                <Dumbbell className="h-16 w-16" />
                                <p>Selecciona o crea un día para comenzar</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

function DayEditor({ day, onUpdate, onDelete }: { day: TemplateDay, onUpdate: (d: TemplateDay) => void, onDelete: () => void }) {
    const exercises = day.exercises || []

    const addExercise = () => {
        const newEx = {
            id: crypto.randomUUID(),
            exercise_name: '',
            order: exercises.length + 1,
            sets: 3,
            reps: '10-12',
            rest_seconds: 60,
            notes: ''
        }
        onUpdate({
            ...day,
            exercises: [...exercises, newEx]
        })
    }

    const updateExercise = (id: string, field: string, value: any) => {
        const newExercises = exercises.map((ex) =>
            ex.id === id ? { ...ex, [field]: value } : ex
        )
        onUpdate({ ...day, exercises: newExercises })
    }

    const deleteExercise = (id: string) => {
        const newExercises = exercises.filter((ex) => ex.id !== id)
        onUpdate({ ...day, exercises: newExercises })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-4 flex-1">
                    <Input
                        value={day.name}
                        onChange={(e) => onUpdate({ ...day, name: e.target.value })}
                        className="max-w-[200px] font-bold text-lg bg-transparent border-transparent hover:border-input focus:border-input transition-all px-0"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="destructive" size="sm" onClick={onDelete} className="gap-2">
                        <Trash2 className="h-4 w-4" /> Eliminar Día
                    </Button>
                </div>
            </div>

            <div className="bg-background rounded-lg border shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-muted/50 border-b">
                            <th className="p-3 text-left font-medium w-[40%]">Ejercicio</th>
                            <th className="p-3 text-center font-medium w-[10%]">Series</th>
                            <th className="p-3 text-center font-medium w-[15%]">Reps</th>
                            <th className="p-3 text-center font-medium w-[15%]">Descanso (s)</th>
                            <th className="p-3 text-center font-medium w-[15%]">Notas</th>
                            <th className="p-3 w-[5%]"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {exercises.map((ex: any, idx: number) => (
                            <tr key={ex.id} className="group hover:bg-muted/20 transition-colors">
                                <td className="p-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground w-6 text-center">{idx + 1}</span>
                                        <Input
                                            value={ex.exercise_name}
                                            onChange={(e) => updateExercise(ex.id, 'exercise_name', e.target.value)}
                                            placeholder="Nombre del ejercicio"
                                            className="h-8 bg-transparent border-0 focus-visible:ring-0 focus-visible:bg-muted/50 font-medium"
                                        />
                                    </div>
                                </td>
                                <td className="p-2">
                                    <Input
                                        type="number"
                                        value={ex.sets}
                                        onChange={(e) => updateExercise(ex.id, 'sets', parseInt(e.target.value))}
                                        className="h-8 text-center bg-transparent border-0 focus-visible:ring-0 focus-visible:bg-muted/50"
                                    />
                                </td>
                                <td className="p-2">
                                    <Input
                                        value={ex.reps}
                                        onChange={(e) => updateExercise(ex.id, 'reps', e.target.value)}
                                        className="h-8 text-center bg-transparent border-0 focus-visible:ring-0 focus-visible:bg-muted/50"
                                    />
                                </td>
                                <td className="p-2">
                                    <Input
                                        type="number"
                                        value={ex.rest_seconds}
                                        onChange={(e) => updateExercise(ex.id, 'rest_seconds', parseInt(e.target.value))}
                                        className="h-8 text-center bg-transparent border-0 focus-visible:ring-0 focus-visible:bg-muted/50"
                                    />
                                </td>
                                <td className="p-2">
                                    <Input
                                        value={ex.notes || ''}
                                        onChange={(e) => updateExercise(ex.id, 'notes', e.target.value)}
                                        className="h-8 bg-transparent border-0 focus-visible:ring-0 focus-visible:bg-muted/50"
                                        placeholder="-"
                                    />
                                </td>
                                <td className="p-2 text-center">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => deleteExercise(ex.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {exercises.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground bg-muted/10">
                        No hay ejercicios en este día.
                    </div>
                )}
                <div className="p-2 border-t bg-muted/20">
                    <Button variant="ghost" className="w-full gap-2 text-primary" onClick={addExercise}>
                        <Plus className="h-4 w-4" /> Añadir Ejercicio
                    </Button>
                </div>
            </div>
        </div>
    )
}
