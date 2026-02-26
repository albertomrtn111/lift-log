'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import {
    Footprints,
    Zap,
    Gauge,
    Dumbbell,
    TrendingUp,
    Shuffle,
    Loader2,
    Save
} from 'lucide-react'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

import { createTemplate, updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { TrainingTemplate, CardioStructure, CardioBlock } from '@/types/templates'

// ---------------------------------------------------------------------------
// Legacy helper: convert old blocks[] JSON → readable text for "Detalles"
// ---------------------------------------------------------------------------
function blocksToText(blocks: CardioBlock[]): string {
    if (!blocks || blocks.length === 0) return ''

    return blocks.map((block, i) => {
        const prefix = `Bloque ${i + 1}`

        if (block.type === 'continuous') {
            const d: string[] = []
            if (block.distance) d.push(`${block.distance}km`)
            if (block.duration) d.push(`${block.duration} min`)
            const pace = block.targetPace || block.intensity
            if (pace) d.push(`@ ${pace}`)
            if (block.targetHR) d.push(`[${block.targetHR}]`)
            return `${prefix} – Continuo: ${d.join(' – ') || 'Sin detalles'}`
        }
        if (block.type === 'intervals') {
            const sets = block.sets || '?'
            const effort = block.workDistance ? `${block.workDistance}km` : block.workDuration ? `${block.workDuration}min` : '?'
            const d = [`${sets}x${effort}`]
            const pace = block.workTargetPace || block.workIntensity
            if (pace) d.push(`@ ${pace}`)
            if (block.workTargetHR) d.push(`[${block.workTargetHR}]`)
            if (block.restDuration) d.push(`– Recu: ${block.restDuration}' ${block.restType === 'active' ? 'activo' : 'pasivo'}`)
            return `${prefix} – Series: ${d.join(' ')}`
        }
        if (block.type === 'station') {
            const d: string[] = []
            if (block.duration) d.push(`${block.duration} min`)
            if (block.notes) d.push(block.notes)
            return `${prefix} – Estación: ${d.join(' – ') || 'Sin detalles'}`
        }
        return `${prefix}: ${block.notes || 'Sin detalles'}`
    }).join('\n')
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const formSchema = z.object({
    name: z.string().min(1, 'El nombre es obligatorio').max(100),
    description: z.string().max(500).optional(),
    tags: z.string().optional(),
    trainingType: z.string().min(1, 'Selecciona un tipo de sesión'),
    details: z.string().optional(),
    notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

// ---------------------------------------------------------------------------
// Session Type Options
// ---------------------------------------------------------------------------
const SESSION_TYPES = [
    { id: 'rodaje', label: 'Rodaje', icon: Footprints, color: 'text-green-500', bg: 'bg-green-500/10' },
    { id: 'series', label: 'Series', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { id: 'tempo', label: 'Tempo', icon: Gauge, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'hybrid', label: 'Híbrido', icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { id: 'progressive', label: 'Progresivos', icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { id: 'fartlek', label: 'Fartlek', icon: Shuffle, color: 'text-pink-500', bg: 'bg-pink-500/10' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface CardioTemplateDialogProps {
    trigger: React.ReactNode
    template?: TrainingTemplate  // If provided → edit mode
}

export function CardioTemplateDialog({ trigger, template }: CardioTemplateDialogProps) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { toast } = useToast()

    const isEdit = !!template

    // Parse existing data for edit mode
    const structure = isEdit ? (template.structure as CardioStructure) || {} : {}
    const legacyBlocks = structure.blocks || []
    const hasLegacyBlocks = legacyBlocks.length > 0 && !structure.description
    const legacyDescription = hasLegacyBlocks ? blocksToText(legacyBlocks) : ''

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: template?.name || '',
            description: template?.description || '',
            tags: template?.tags?.join(', ') || '',
            trainingType: structure.trainingType || 'rodaje',
            details: structure.description || legacyDescription || template?.description || '',
            notes: structure.notes || '',
        },
    })

    const onSubmit = (values: FormValues) => {
        startTransition(async () => {
            const tagArray = values.tags
                ? values.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
                : []

            const cardioStructure: CardioStructure = {
                trainingType: values.trainingType,
                description: values.details || '',
                notes: values.notes || '',
                blocks: [],
            }

            if (isEdit) {
                // UPDATE existing template
                const result = await updateTemplate(template.id, {
                    name: values.name,
                    description: values.description || null,
                    tags: tagArray,
                    structure: cardioStructure,
                })

                if (result.success) {
                    toast({
                        title: 'Plantilla actualizada',
                        description: `"${values.name}" se ha guardado correctamente.`,
                        className: 'bg-green-500 text-white border-none',
                    })
                    setOpen(false)
                    router.refresh()
                } else {
                    toast({
                        title: 'Error',
                        description: result.error || 'No se pudo actualizar la plantilla.',
                        variant: 'destructive',
                    })
                }
            } else {
                // CREATE new template
                const result = await createTemplate({
                    name: values.name,
                    description: values.description,
                    tags: tagArray,
                    type: 'cardio',
                    structure: cardioStructure,
                })

                if (result.success) {
                    toast({
                        title: 'Plantilla creada',
                        description: `"${values.name}" se ha creado correctamente.`,
                        className: 'bg-green-500 text-white border-none',
                    })
                    setOpen(false)
                    form.reset()
                    router.refresh()
                } else {
                    toast({
                        title: 'Error',
                        description: result.error || 'No se pudo crear la plantilla.',
                        variant: 'destructive',
                    })
                }
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (!val && !isEdit) form.reset()
        }}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Editar Plantilla de Cardio' : 'Nueva Plantilla de Cardio'}</DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? 'Modifica los datos de tu plantilla de cardio.'
                            : 'Rellena todos los campos y guarda tu plantilla en un solo paso.'}
                    </DialogDescription>
                </DialogHeader>

                {hasLegacyBlocks && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
                        ⚠️ Esta plantilla tenía un diseño por bloques. Se ha convertido a texto.
                        Al guardar se usará el formato simple.
                    </p>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                        {/* ── Metadata: Name / Description / Tags ── */}
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre *</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ej: Rodaje 10km suave" {...field} />
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
                                        <FormLabel>Descripción (opcional)</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Breve descripción del objetivo..."
                                                className="resize-none min-h-[60px]"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="tags"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Etiquetas (opcional)</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="Separadas por comas (ej: running, base, Z2)"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Ayuda a filtrar y organizar tus plantillas.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* ── Session Type Selector ── */}
                        <Card className="border-none shadow-sm bg-muted/30">
                            <CardContent className="p-4">
                                <FormField
                                    control={form.control}
                                    name="trainingType"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormLabel className="text-base font-semibold">Tipo de Sesión *</FormLabel>
                                            <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
                                                >
                                                    {SESSION_TYPES.map((type) => {
                                                        const Icon = type.icon
                                                        return (
                                                            <div key={type.id}>
                                                                <RadioGroupItem
                                                                    value={type.id}
                                                                    id={`cardio-tmpl-${type.id}`}
                                                                    className="peer sr-only"
                                                                />
                                                                <FormLabel
                                                                    htmlFor={`cardio-tmpl-${type.id}`}
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

                        {/* ── Details + Notes ── */}
                        <div className="space-y-4">
                            <FormField
                                control={form.control}
                                name="details"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-base font-semibold">Detalles del Entrenamiento</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={"Ej: 10 min suaves + 4x1000m a ritmo 4:00 rec 2' + 10 min suaves.\nSensaciones esperadas: RPE 7/10."}
                                                className="min-h-[150px] resize-none text-base"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-medium text-muted-foreground">Notas para el Cliente (Opcional)</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Ej: Recuerda hidratarte bien antes de salir."
                                                className="min-h-[80px] resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* ── Submit ── */}
                        <div className="flex justify-end pt-2">
                            <Button type="submit" disabled={isPending} size="lg">
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {!isPending && <Save className="mr-2 h-4 w-4" />}
                                {isEdit ? 'Guardar Cambios' : 'Guardar Plantilla'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
