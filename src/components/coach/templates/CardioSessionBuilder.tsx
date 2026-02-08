'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Activity,
    Dumbbell,
    Pause,
    Plus,
    Trash2,
    Save,
    Footprints,
    Clock,
    Zap,
    Shuffle,
    Gauge,
    Timer,
    Repeat,
    TrendingUp
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'

import { updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { TrainingTemplate, CardioStructure, CardioBlock, CardioBlockType } from '@/types/templates'
import { cn } from '@/lib/utils'

// Schema Definition
const blockSchema = z.object({
    type: z.enum(['continuous', 'intervals', 'station']),
    notes: z.string().optional(),

    // Continuous
    duration: z.string().optional(), // numeric string
    distance: z.string().optional(), // numeric string
    intensity: z.string().optional(), // Deprecated
    targetPace: z.string().optional(),
    targetHR: z.string().optional(),

    // Intervals
    sets: z.string().optional(), // numeric string
    workDistance: z.string().optional(), // numeric string
    workDuration: z.string().optional(), // numeric string
    workIntensity: z.string().optional(), // Deprecated
    workTargetPace: z.string().optional(),
    workTargetHR: z.string().optional(),
    restDuration: z.string().optional(), // numeric string
    restDistance: z.string().optional(), // numeric string
    restType: z.enum(['active', 'passive']).optional(),
})

const formSchema = z.object({
    trainingType: z.string().optional(),
    blocks: z.array(blockSchema),
})

type FormValues = z.infer<typeof formSchema>

interface CardioSessionBuilderProps {
    template: TrainingTemplate
}

const SESSION_TYPES = [
    { id: 'rodaje', label: 'Rodaje', icon: Footprints, color: 'text-green-500', bg: 'bg-green-500/10' },
    { id: 'series', label: 'Series', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { id: 'tempo', label: 'Tempo', icon: Gauge, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'hybrid', label: 'Híbrido', icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { id: 'progressive', label: 'Progresivos', icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { id: 'fartlek', label: 'Fartlek', icon: Shuffle, color: 'text-pink-500', bg: 'bg-pink-500/10' },
]

export function CardioSessionBuilder({ template }: CardioSessionBuilderProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    // Parse initial blocks from template structure
    const initialStructure = (template.structure as any)
    const initialBlocks = (initialStructure?.blocks || []).map((b: any) => ({
        ...b,
        type: ['continuous', 'intervals', 'station'].includes(b.type) ? b.type : 'continuous',
        distance: b.distance?.toString() || '',
        duration: b.duration?.toString() || '',
        sets: b.sets?.toString() || '',
        workDistance: b.workDistance?.toString() || '',
        workDuration: b.workDuration?.toString() || '',
        restDuration: b.restDuration?.toString() || '',
        restDistance: b.restDistance?.toString() || '',
        targetPace: b.targetPace || b.intensity || '', // Try to recover from old intensity
        targetHR: b.targetHR || '',
        workTargetPace: b.workTargetPace || b.workIntensity || '',
        workTargetHR: b.workTargetHR || '',
    }))

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            trainingType: initialStructure?.trainingType || 'rodaje',
            blocks: initialBlocks,
        },
    })

    const { fields, append, remove, move } = useFieldArray({
        control: form.control,
        name: 'blocks',
    })

    const onSubmit = (values: FormValues) => {
        startTransition(async () => {
            // Transform form values back to strictly typed CardioBlock[]
            const cleanBlocks: CardioBlock[] = values.blocks.map((block) => {
                const base = {
                    id: crypto.randomUUID(),
                    type: block.type as CardioBlockType,
                    notes: block.notes || undefined,
                }

                if (block.type === 'continuous') {
                    return {
                        ...base,
                        duration: block.duration ? parseFloat(block.duration) : undefined,
                        distance: block.distance ? parseFloat(block.distance) : undefined,
                        targetPace: block.targetPace || undefined,
                        targetHR: block.targetHR || undefined,
                    }
                }

                if (block.type === 'intervals') {
                    return {
                        ...base,
                        sets: block.sets ? parseInt(block.sets) : undefined,
                        workDistance: block.workDistance ? parseFloat(block.workDistance) : undefined,
                        workDuration: block.workDuration ? parseFloat(block.workDuration) : undefined,
                        workTargetPace: block.workTargetPace || undefined,
                        workTargetHR: block.workTargetHR || undefined,
                        restDuration: block.restDuration ? parseFloat(block.restDuration) : undefined,
                        restDistance: block.restDistance ? parseFloat(block.restDistance) : undefined,
                        restType: block.restType as 'active' | 'passive' || undefined,
                    }
                }

                if (block.type === 'station') {
                    return {
                        ...base,
                        duration: block.duration ? parseFloat(block.duration) : undefined,
                    }
                }

                return base
            })

            const result = await updateTemplate(template.id, {
                structure: {
                    blocks: cleanBlocks,
                    trainingType: values.trainingType,
                }
            })

            if (result.success) {
                toast({
                    title: 'Sesión guardada',
                    description: 'Los cambios se han guardado correctamente.',
                    className: 'bg-green-500 text-white border-none',
                })
                router.refresh()
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'No se pudo guardar la sesión.',
                    variant: 'destructive',
                })
            }
        })
    }

    const addBlock = (type: CardioBlockType) => {
        append({
            type,
            notes: '',
            duration: '',
            distance: '',
            intensity: '',
            sets: '',
            workDistance: '',
            workDuration: '',
            workIntensity: '',
            restDuration: '',
            restDistance: '',
            restType: 'passive',
        })
    }

    // Helper for block styles
    const getBlockStyle = (type: string) => {
        switch (type) {
            case 'continuous':
                return 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
            case 'intervals':
                return 'border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20'
            case 'station':
                return 'border-purple-200 bg-slate-50 dark:border-purple-900 dark:bg-slate-900/50'
            default:
                return 'border-border bg-card'
        }
    }

    const getBlockLabel = (type: string) => {
        switch (type) {
            case 'continuous': return 'Continuo / Rodaje'
            case 'intervals': return 'Intervalos / Series'
            case 'station': return 'Estación / Funcional'
            default: return 'Bloque'
        }
    }

    const getBlockIcon = (type: string) => {
        switch (type) {
            case 'continuous': return <Activity className="h-5 w-5" />
            case 'intervals': return <Repeat className="h-5 w-5" />
            case 'station': return <Dumbbell className="h-5 w-5" />
            default: return <Activity className="h-5 w-5" />
        }
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-24">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                    {/* Header Controls */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight">Diseñador de Sesión</h2>
                                <p className="text-muted-foreground">
                                    Configura el tipo de sesión y añade los bloques de trabajo.
                                </p>
                            </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button className="w-full sm:w-auto">
                                        <Plus className="mr-2 h-4 w-4" />
                                        Añadir Bloque
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem onClick={() => addBlock('continuous')} className="cursor-pointer py-3">
                                        <span className="mr-2 text-xl">🏃</span>
                                        <div className="flex flex-col">
                                            <span className="font-medium">Continuo</span>
                                            <span className="text-xs text-muted-foreground">Rodaje, Calentamiento</span>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => addBlock('intervals')} className="cursor-pointer py-3">
                                        <span className="mr-2 text-xl">⚡</span>
                                        <div className="flex flex-col">
                                            <span className="font-medium">Intervalos</span>
                                            <span className="text-xs text-muted-foreground">Series, Repeticiones</span>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => addBlock('station')} className="cursor-pointer py-3">
                                        <span className="mr-2 text-xl">🏋️</span>
                                        <div className="flex flex-col">
                                            <span className="font-medium">Estación</span>
                                            <span className="text-xs text-muted-foreground">Hyrox, Fuerza, Funcional</span>
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Session Type Selector */}
                        <Card className="border-none shadow-sm bg-muted/30">
                            <CardContent className="p-4">
                                <FormField
                                    control={form.control}
                                    name="trainingType"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel className="text-base font-semibold">Tipo de Sesión</FormLabel>
                                            <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value}
                                                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
                                                >
                                                    {SESSION_TYPES.map((type) => {
                                                        const Icon = type.icon
                                                        return (
                                                            <div key={type.id}>
                                                                <RadioGroupItem
                                                                    value={type.id}
                                                                    id={type.id}
                                                                    className="peer sr-only"
                                                                />
                                                                <FormLabel
                                                                    htmlFor={type.id}
                                                                    className={cn(
                                                                        "flex flex-col items-center justify-between rounded-md border-2 bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all h-full",
                                                                        "border-transparent",
                                                                        type.bg
                                                                    )}
                                                                >
                                                                    <Icon className={cn("mb-2 h-6 w-6", type.color)} />
                                                                    <span className="text-xs font-semibold text-center">{type.label}</span>
                                                                </FormLabel>
                                                            </div>
                                                        )
                                                    })}
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Blocks List */}
                    <div className="space-y-3">
                        {fields.map((field, index) => {
                            const type = form.watch(`blocks.${index}.type`)

                            return (
                                <Card key={field.id} className={cn("transition-all border-l-4 shadow-sm", getBlockStyle(type))}>
                                    <CardContent className="p-4">
                                        <div className="flex gap-4 items-start">
                                            {/* Index Column */}
                                            <div className="flex flex-col items-center gap-2 pt-2 min-w-[32px]">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-full flex items-center justify-center border shadow-sm font-bold text-sm",
                                                    "bg-white dark:bg-zinc-800"
                                                )}>
                                                    {index + 1}
                                                </div>
                                            </div>

                                            {/* Main Content */}
                                            <div className="flex-1 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-md bg-white/50 dark:bg-black/20 shrink-0">
                                                            {getBlockIcon(type)}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-[10px] uppercase tracking-wider opacity-60">
                                                                {getBlockLabel(type)}
                                                            </span>
                                                            <span className="text-sm font-bold tracking-tight">
                                                                {type === 'continuous' && (
                                                                    <>
                                                                        {form.watch(`blocks.${index}.distance`) && `${form.watch(`blocks.${index}.distance`)}km`}
                                                                        {form.watch(`blocks.${index}.duration`) && ` ${form.watch(`blocks.${index}.duration`)} min`}
                                                                        {(form.watch(`blocks.${index}.targetPace`) || form.watch(`blocks.${index}.targetHR`)) && " @ "}
                                                                        {form.watch(`blocks.${index}.targetPace`)}
                                                                        {form.watch(`blocks.${index}.targetHR`) && ` [${form.watch(`blocks.${index}.targetHR`)}]`}
                                                                    </>
                                                                )}
                                                                {type === 'intervals' && (
                                                                    <>
                                                                        {form.watch(`blocks.${index}.sets`)}x{" "}
                                                                        {form.watch(`blocks.${index}.workDistance`) && `${form.watch(`blocks.${index}.workDistance`)}km`}
                                                                        {form.watch(`blocks.${index}.workDuration`) && `${form.watch(`blocks.${index}.workDuration`)}min`}
                                                                        {(form.watch(`blocks.${index}.workTargetPace`) || form.watch(`blocks.${index}.workTargetHR`)) && " @ "}
                                                                        {form.watch(`blocks.${index}.workTargetPace`)}
                                                                        {form.watch(`blocks.${index}.workTargetHR`) && ` [${form.watch(`blocks.${index}.workTargetHR`)}]`}
                                                                        {form.watch(`blocks.${index}.restDuration`) && (
                                                                            <span className="ml-2 text-xs font-medium opacity-60">
                                                                                | Recu: {form.watch(`blocks.${index}.restDuration`)}'
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <div className="grid gap-4 sm:grid-cols-12">

                                                    {/* CONTINUOUS BLOCK */}
                                                    {type === 'continuous' && (
                                                        <>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.distance`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Distancia (km)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 5" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.duration`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Tiempo (min)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 30" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.targetPace`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Ritmo Objetivo</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 5:00/km" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.targetHR`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Pulsaciones / Zona</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 140-150 ppm o Z2" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* INTERVALS BLOCK */}
                                                    {type === 'intervals' && (
                                                        <>
                                                            <div className="sm:col-span-12">
                                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                                    {/* 1. Reps */}
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`blocks.${index}.sets`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-xs font-medium text-muted-foreground">Reps</FormLabel>
                                                                                <FormControl>
                                                                                    <Input placeholder="Ej: 6" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-bold border-orange-200" />
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />

                                                                    {/* 2. Effort (Distance or Time) */}
                                                                    <div className="space-y-1">
                                                                        <label className="text-xs font-medium text-muted-foreground">Dist / Tiempo</label>
                                                                        <div className="grid grid-cols-2 gap-1">
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`blocks.${index}.workDistance`}
                                                                                render={({ field }) => (
                                                                                    <FormControl>
                                                                                        <Input placeholder="km" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium border-orange-200 p-2" />
                                                                                    </FormControl>
                                                                                )}
                                                                            />
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`blocks.${index}.workDuration`}
                                                                                render={({ field }) => (
                                                                                    <FormControl>
                                                                                        <Input placeholder="min" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium border-orange-200 p-2" />
                                                                                    </FormControl>
                                                                                )}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. Pace */}
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`blocks.${index}.workTargetPace`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-xs font-medium text-muted-foreground">Ritmo</FormLabel>
                                                                                <FormControl>
                                                                                    <Input placeholder="Ej: 3:50/km" {...field} className="bg-white/80 dark:bg-black/20 font-medium border-orange-200" />
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />

                                                                    {/* 4. HR */}
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`blocks.${index}.workTargetHR`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-xs font-medium text-muted-foreground">Pulsaciones</FormLabel>
                                                                                <FormControl>
                                                                                    <Input placeholder="Ej: 170 ppm" {...field} className="bg-white/80 dark:bg-black/20 font-medium border-orange-200" />
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />

                                                                    {/* 5. Recovery */}
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`blocks.${index}.restDuration`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-xs font-medium text-muted-foreground">Recu (min)</FormLabel>
                                                                                <FormControl>
                                                                                    <Input placeholder="Ej: 2" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                                </FormControl>
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <Separator className="sm:col-span-12 my-2 bg-orange-200/50" />

                                                            <div className="sm:col-span-12 pt-2">
                                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo de Recuperación</p>
                                                                <div className="grid grid-cols-3 gap-4">
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`blocks.${index}.restType`}
                                                                        render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel className="text-xs font-medium text-muted-foreground">Tipo</FormLabel>
                                                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                                    <FormControl>
                                                                                        <SelectTrigger className="bg-white/80 dark:bg-black/20 font-medium h-10">
                                                                                            <SelectValue placeholder="Tipo" />
                                                                                        </SelectTrigger>
                                                                                    </FormControl>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="active">Activo (Trote/Andar)</SelectItem>
                                                                                        <SelectItem value="passive">Pasivo (Parado)</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </FormItem>
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* STATION BLOCK */}
                                                    {type === 'station' && (
                                                        <>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.duration`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Tiempo Est. (min)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Opcional" type="number" {...field} className="bg-white/80 dark:bg-black/20 font-medium" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-9">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.notes`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs font-medium text-muted-foreground">Descripción del Ejercicio</FormLabel>
                                                                            <FormControl>
                                                                                <Textarea
                                                                                    placeholder="Ej: 100 Wall Balls (6kg) + 50 Burpees"
                                                                                    {...field}
                                                                                    className="bg-white/80 dark:bg-black/20 min-h-[80px] text-base font-medium resize-y"
                                                                                />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}

                        {fields.length === 0 && (
                            <div className="text-center py-16 border-2 border-dashed rounded-xl bg-muted/10 hover:bg-muted/20 transition-colors">
                                <div className="text-muted-foreground mb-4">
                                    No hay bloques en esta sesión.
                                </div>
                                <Button variant="outline" onClick={() => addBlock('continuous')}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Añadir bloque
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Floating Save Button */}
                    <div className="sticky bottom-4 flex justify-end">
                        <Button
                            type="submit"
                            disabled={isPending || fields.length === 0}
                            size="lg"
                            className="shadow-lg"
                        >
                            {isPending ? (
                                <>Guardando...</>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar Sesión
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
