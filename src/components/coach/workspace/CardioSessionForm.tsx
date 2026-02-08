"use client"

import { useState, useTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Activity,
    Dumbbell,
    Plus,
    Trash2,
    Save,
    Footprints,
    Zap,
    Shuffle,
    Gauge,
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
import { Card, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'

import { CardioStructure, CardioBlock, CardioBlockType } from '@/types/templates'
import { cn } from '@/lib/utils'

// Schema Definition (Same as Builder)
const blockSchema = z.object({
    type: z.enum(['continuous', 'intervals', 'station']),
    notes: z.string().optional(),

    // Continuous
    duration: z.string().optional(),
    distance: z.string().optional(),
    intensity: z.string().optional(),
    targetPace: z.string().optional(),
    targetHR: z.string().optional(),

    // Intervals
    sets: z.string().optional(),
    workDistance: z.string().optional(),
    workDuration: z.string().optional(),
    workIntensity: z.string().optional(),
    workTargetPace: z.string().optional(),
    workTargetHR: z.string().optional(),
    restDuration: z.string().optional(),
    restDistance: z.string().optional(),
    restType: z.enum(['active', 'passive']).optional(),
})

const formSchema = z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    description: z.string().optional(),
    trainingType: z.string().optional(),
    blocks: z.array(blockSchema),
})

type FormValues = z.infer<typeof formSchema>

interface CardioSessionFormProps {
    initialData?: {
        name?: string;
        description?: string;
        structure?: CardioStructure;
    };
    onSubmit: (data: { name: string; description?: string; structure: CardioStructure }) => Promise<void>;
    isSubmitting?: boolean;
    onCancel?: () => void;
}

const SESSION_TYPES = [
    { id: 'rodaje', label: 'Rodaje', icon: Footprints, color: 'text-green-500', bg: 'bg-green-500/10' },
    { id: 'series', label: 'Series', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { id: 'tempo', label: 'Tempo', icon: Gauge, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'hybrid', label: 'Híbrido', icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { id: 'progressive', label: 'Progresivos', icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { id: 'fartlek', label: 'Fartlek', icon: Shuffle, color: 'text-pink-500', bg: 'bg-pink-500/10' },
]

export function CardioSessionForm({ initialData, onSubmit, isSubmitting, onCancel }: CardioSessionFormProps) {

    // Parse initial blocks from structure
    const initialBlocks = (initialData?.structure?.blocks || []).map((b: any) => ({
        ...b,
        type: ['continuous', 'intervals', 'station'].includes(b.type) ? b.type : 'continuous',
        distance: b.distance?.toString() || '',
        duration: b.duration?.toString() || '',
        sets: b.sets?.toString() || '',
        workDistance: b.workDistance?.toString() || '',
        workDuration: b.workDuration?.toString() || '',
        restDuration: b.restDuration?.toString() || '',
        restDistance: b.restDistance?.toString() || '',
        targetPace: b.targetPace || b.intensity || '',
        targetHR: b.targetHR || '',
        workTargetPace: b.workTargetPace || b.workIntensity || '',
        workTargetHR: b.workTargetHR || '',
    }))

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: initialData?.name || '',
            description: initialData?.description || '',
            trainingType: initialData?.structure?.trainingType || 'rodaje',
            blocks: initialBlocks,
        },
    })

    const { fields, append, remove, move } = useFieldArray({
        control: form.control,
        name: 'blocks',
    })

    const handleSubmit = async (values: FormValues) => {
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

        await onSubmit({
            name: values.name,
            description: values.description,
            structure: {
                blocks: cleanBlocks,
                trainingType: values.trainingType,
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

    // Helper for block styles (Reused)
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
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

                {/* Basic Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre de la Sesión</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ej: Rodaje Suave" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Descripción (Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ej: Recuperación activa" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
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

                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Bloques de Trabajo</h3>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                                <Plus className="mr-2 h-4 w-4" />
                                Añadir Bloque
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => addBlock('continuous')} className="cursor-pointer py-2">
                                <span className="mr-2">🏃</span> Continuo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => addBlock('intervals')} className="cursor-pointer py-2">
                                <span className="mr-2">⚡</span> Intervalos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => addBlock('station')} className="cursor-pointer py-2">
                                <span className="mr-2">🏋️</span> Estación
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Blocks List - Condensed Version */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {fields.map((field, index) => {
                        const type = form.watch(`blocks.${index}.type`)
                        return (
                            <Card key={field.id} className={cn("transition-all border-l-4 shadow-sm relative group", getBlockStyle(type))}>
                                <CardContent className="p-3">
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center justify-center min-w-[24px]">
                                            <span className="text-xs font-bold text-muted-foreground">{index + 1}</span>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    {getBlockIcon(type)}
                                                    <span className="text-xs font-bold uppercase opacity-70">{getBlockLabel(type)}</span>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => remove(index)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            {/* Simplified Block Form Fields */}
                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                                {type === 'continuous' && (
                                                    <>
                                                        <Input placeholder="Dist (km)" {...form.register(`blocks.${index}.distance`)} className="h-8 text-xs bg-white/50" />
                                                        <Input placeholder="Tiempo (min)" {...form.register(`blocks.${index}.duration`)} className="h-8 text-xs bg-white/50" />
                                                        <Input placeholder="Ritmo" {...form.register(`blocks.${index}.targetPace`)} className="h-8 text-xs bg-white/50" />
                                                        <Input placeholder="Pulsaciones" {...form.register(`blocks.${index}.targetHR`)} className="h-8 text-xs bg-white/50" />
                                                    </>
                                                )}
                                                {type === 'intervals' && (
                                                    <>
                                                        <div className="col-span-2 grid grid-cols-2 gap-2">
                                                            <Input placeholder="Reps" {...form.register(`blocks.${index}.sets`)} className="h-8 text-xs bg-white/50 border-orange-200" />
                                                            <Input placeholder="Dist/Tiempo" {...form.register(`blocks.${index}.workDistance`)} className="h-8 text-xs bg-white/50 border-orange-200" />
                                                        </div>
                                                        <Input placeholder="Ritmo" {...form.register(`blocks.${index}.workTargetPace`)} className="h-8 text-xs bg-white/50 border-orange-200" />
                                                        <Input placeholder="Recu (min)" {...form.register(`blocks.${index}.restDuration`)} className="h-8 text-xs bg-white/50" />
                                                    </>
                                                )}
                                            </div>

                                            <div className="w-full">
                                                <Input
                                                    placeholder="Notas / Descripción del ejercicio..."
                                                    {...form.register(`blocks.${index}.notes`)}
                                                    className="h-8 text-xs bg-white/50 w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}

                    {fields.length === 0 && (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/5">
                            <span className="text-sm text-muted-foreground">Añade bloques de trabajo para diseñar la sesión.</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting || fields.length === 0}>
                        {isSubmitting ? "Guardando..." : "Guardar Sesión"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
