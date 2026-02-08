'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Dumbbell,
    Heart,
    Timer,
    Plus,
    Trash2,
    Save,
    MoreVertical,
    Activity,
    Pause,
    Play
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
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

import { updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { TrainingTemplate, CardioStructure, CardioBlock } from '@/types/templates'
import { cn } from '@/lib/utils'

// Schema Definition
const blockSchema = z.object({
    type: z.enum(['warmup', 'work', 'rest', 'cooldown', 'station']),
    distance: z.string().optional(), // Keeping as string for input flexible parsing, or coerce to number
    duration: z.string().optional(), // Minutes as string for now to handle empty states better, or number
    intensity: z.string().optional(),
    notes: z.string().optional(),
})

const formSchema = z.object({
    blocks: z.array(blockSchema),
})

type FormValues = z.infer<typeof formSchema>

interface CardioSessionBuilderProps {
    template: TrainingTemplate
}

export function CardioSessionBuilder({ template }: CardioSessionBuilderProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    // Parse initial blocks from template structure
    const initialBlocks = (template.structure as CardioStructure)?.blocks || []

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            blocks: initialBlocks.map(block => ({
                type: block.type,
                distance: block.distance?.toString() || '',
                duration: block.duration?.toString() || '',
                intensity: block.intensity || '',
                notes: block.notes || '',
            })),
        },
    })

    const { fields, append, remove, move } = useFieldArray({
        control: form.control,
        name: 'blocks',
    })

    const onSubmit = (values: FormValues) => {
        startTransition(async () => {
            // Transform form values back to strictly typed CardioBlock[]
            const cleanBlocks: CardioBlock[] = values.blocks.map((block) => ({
                id: crypto.randomUUID(), // Generate new ID for consistency or keep existing if mapped
                type: block.type as any,
                distance: block.distance ? parseFloat(block.distance) : undefined,
                duration: block.duration ? parseFloat(block.duration) : undefined,
                intensity: block.intensity || undefined,
                notes: block.notes || undefined,
            }))

            const result = await updateTemplate(template.id, {
                structure: {
                    blocks: cleanBlocks,
                    // Preserve other CardioStructure fields if they existed, 
                    // or add inputs for totalDistance/Duration if requested later.
                    // For now, simple blocks update.
                    trainingType: (template.structure as CardioStructure)?.trainingType,
                }
            })

            if (result.success) {
                toast({
                    title: 'Sesión guardada',
                    description: 'Los cambios se han guardado correctamente.',
                    variant: 'default',
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

    const addBlock = (type: 'work' | 'station' | 'rest') => {
        append({
            type,
            distance: '',
            duration: '',
            intensity: '',
            notes: '',
        })
    }

    // Helper to render block icon based on type
    const getBlockIcon = (type: string) => {
        switch (type) {
            case 'work':
            case 'warmup':
            case 'cooldown':
                return <Activity className="h-5 w-5" />
            case 'station':
                return <Dumbbell className="h-5 w-5" />
            case 'rest':
                return <Pause className="h-5 w-5" />
            default:
                return <Activity className="h-5 w-5" />
        }
    }

    // Helper for block styles
    const getBlockStyle = (type: string) => {
        switch (type) {
            case 'work':
            case 'warmup': // Treating warmup/cooldown similar to work/running for now visually
            case 'cooldown':
                return 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
            case 'station':
                return 'border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20'
            case 'rest':
                return 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50'
            default:
                return 'border-border bg-card'
        }
    }

    const getBlockLabel = (type: string) => {
        switch (type) {
            case 'work': return 'Carrera / Cardio'
            case 'station': return 'Estación / Funcional'
            case 'rest': return 'Descanso'
            case 'warmup': return 'Calentamiento'
            case 'cooldown': return 'Vuelta a la calma'
            default: return 'Bloque'
        }
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Diseñador de Sesión</h2>
                    <p className="text-muted-foreground">
                        Construye tu sesión combinando carrera, estaciones y descansos.
                    </p>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Añadir Bloque
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => addBlock('work')} className="cursor-pointer">
                            <span className="mr-2">🏃</span> Carrera (Run)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addBlock('station')} className="cursor-pointer">
                            <span className="mr-2">🏋️</span> Estación (Hyrox)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addBlock('rest')} className="cursor-pointer">
                            <span className="mr-2">⏸️</span> Descanso
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-3">
                        {fields.map((field, index) => {
                            const type = form.watch(`blocks.${index}.type`)

                            return (
                                <Card key={field.id} className={cn("transition-all", getBlockStyle(type))}>
                                    <CardContent className="p-4">
                                        <div className="flex gap-4 items-start">
                                            {/* Left Icon/Index Column */}
                                            <div className="flex flex-col items-center gap-2 pt-2">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-full flex items-center justify-center border shadow-sm",
                                                    "bg-background text-foreground"
                                                )}>
                                                    <span className="text-xs font-bold">{index + 1}</span>
                                                </div>
                                                <div className="text-muted-foreground">
                                                    {getBlockIcon(type)}
                                                </div>
                                            </div>

                                            {/* Main Content Form */}
                                            <div className="flex-1 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
                                                        {getBlockLabel(type)}
                                                    </Badge>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <div className="grid gap-4 sm:grid-cols-12">
                                                    {/* Fields for Running/Cardio */}
                                                    {(type === 'work' || type === 'warmup' || type === 'cooldown') && (
                                                        <>
                                                            <div className="sm:col-span-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.distance`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs">Distancia (metros)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 1000" type="number" {...field} className="bg-background/80" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.duration`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs">Tiempo (min)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: 5" type="number" {...field} className="bg-background/80" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                            <div className="sm:col-span-4">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.intensity`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs">Ritmo / Zona</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Ej: Z2 / 4:30" {...field} className="bg-background/80" />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Fields for Stations (Hyrox/Functional) */}
                                                    {type === 'station' && (
                                                        <>
                                                            <div className="sm:col-span-3">
                                                                <FormField
                                                                    control={form.control}
                                                                    name={`blocks.${index}.duration`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel className="text-xs">Tiempo Est. (min)</FormLabel>
                                                                            <FormControl>
                                                                                <Input placeholder="Opcional" type="number" {...field} className="bg-background/80" />
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
                                                                            <FormLabel className="text-xs">Ejercicio / Descripción</FormLabel>
                                                                            <FormControl>
                                                                                <Textarea
                                                                                    placeholder="Ej: 100 Wall Balls (6kg)"
                                                                                    {...field}
                                                                                    className="bg-background/80 min-h-[60px] resize-none text-base md:text-lg font-medium"
                                                                                />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Fields for Rest */}
                                                    {type === 'rest' && (
                                                        <div className="sm:col-span-4">
                                                            <FormField
                                                                control={form.control}
                                                                name={`blocks.${index}.duration`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel className="text-xs">Duración (min)</FormLabel>
                                                                        <FormControl>
                                                                            <Input placeholder="Ej: 2" type="number" {...field} className="bg-background/80" />
                                                                        </FormControl>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}

                        {fields.length === 0 && (
                            <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                                <div className="text-muted-foreground mb-4">No hay bloques en esta sesión</div>
                                <Button variant="outline" onClick={() => addBlock('work')}>
                                    Añadir primer bloque
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t z-50 flex justify-end gap-3 lg:static lg:bg-transparent lg:border-none lg:p-0">
                        <Button
                            type="submit"
                            disabled={isPending || fields.length === 0}
                            className="w-full lg:w-auto"
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
