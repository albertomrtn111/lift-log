"use client"

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Bike,
    CircleEllipsis,
    Clock,
    Dumbbell,
    Footprints,
    Gauge,
    Plus,
    Repeat,
    Shuffle,
    Trash2,
    TrendingUp,
    Waves,
    Zap,
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
import { Card, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { CardioBlock, CardioBlockType, CardioStructure } from '@/types/templates'
import { calculateCardioStructureTotals, summarizeCardioStructure } from '@/lib/cardio/structure'
import { cn } from '@/lib/utils'

const numericOptional = z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number().min(0, 'No puede ser negativo').optional()
)

const formSchema = z.object({
    mode: z.enum(['free_text', 'structured']),
    trainingType: z.string().optional(),
    customName: z.string().optional(),
    targetDistanceKm: numericOptional,
    targetDurationMin: numericOptional,
    targetPace: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
}).superRefine((values, ctx) => {
    if (values.trainingType === 'other' && !values.customName?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['customName'],
            message: 'Escribe el nombre de la sesión',
        })
    }

    if (values.mode === 'free_text' && !values.description?.trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['description'],
            message: 'El detalle del entrenamiento es obligatorio',
        })
    }
})

type FormValues = z.infer<typeof formSchema>

interface CardioSessionFormProps {
    initialData?: {
        name?: string;
        description?: string;
        structure?: CardioStructure;
        targetDistanceKm?: number;
        targetDurationMin?: number;
        targetPace?: string;
    };
    onSubmit: (data: {
        name: string;
        description?: string;
        structure: CardioStructure;
        targetDistanceKm?: number;
        targetDurationMin?: number;
        targetPace?: string;
    }) => Promise<void>;
    isSubmitting?: boolean;
    onCancel?: () => void;
    hideTypeSelector?: boolean;
    visibleSections?: string[];
}

const SESSION_SECTIONS = [
    {
        label: 'Running',
        types: [
            { id: 'rodaje', label: 'Rodaje', icon: Footprints, color: 'text-green-500', bg: 'bg-green-500/10' },
            { id: 'series', label: 'Series', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
            { id: 'tempo', label: 'Tempo', icon: Gauge, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { id: 'fartlek', label: 'Fartlek', icon: Shuffle, color: 'text-pink-500', bg: 'bg-pink-500/10' },
            { id: 'progressive', label: 'Progresivos', icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        ],
    },
    {
        label: 'Bicicleta',
        types: [
            { id: 'bike', label: 'Bicicleta', icon: Bike, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
        ],
    },
    {
        label: 'Natación',
        types: [
            { id: 'swim', label: 'Natación', icon: Waves, color: 'text-teal-500', bg: 'bg-teal-500/10' },
        ],
    },
    {
        label: 'Otro',
        types: [
            { id: 'other', label: 'Otro', icon: CircleEllipsis, color: 'text-slate-500', bg: 'bg-slate-500/10' },
        ],
    },
    {
        label: 'Híbrido',
        types: [
            { id: 'hybrid', label: 'Híbrido', icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        ],
    },
]

const SESSION_TYPES = SESSION_SECTIONS.flatMap(s => s.types)

function makeId() {
    return `cardio-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultBlock(type: CardioBlockType): CardioBlock {
    if (type === 'intervals') {
        return {
            id: makeId(),
            type,
            label: 'Bloque principal',
            sets: 3,
            workDistance: 1,
            restDuration: 2,
            restType: 'active',
        }
    }

    return {
        id: makeId(),
        type,
        label: type === 'cooldown' ? 'Vuelta a la calma' : 'Calentamiento',
        duration: 10,
        targetPace: 'suave',
    }
}

function defaultStructuredBlocks(): CardioBlock[] {
    return [
        defaultBlock('continuous'),
        defaultBlock('intervals'),
        defaultBlock('cooldown'),
    ]
}

function normalizeInitialBlocks(initialData?: CardioSessionFormProps['initialData']) {
    const blocks = initialData?.structure?.blocks
    if (!Array.isArray(blocks)) return []
    return blocks.map((block) => ({
        ...block,
        id: block.id || makeId(),
        label: block.label || block.notes || (block.type === 'intervals' ? 'Bloque principal' : block.type === 'cooldown' ? 'Vuelta a la calma' : 'Bloque'),
    }))
}

function toInputValue(value: string | number | null | undefined): string | number {
    return value ?? ''
}

function parseNumericInput(value: string) {
    if (value === '') return undefined
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : undefined
}

function blockTypeLabel(type: CardioBlockType) {
    if (type === 'intervals') return 'Series'
    if (type === 'cooldown') return 'Vuelta a la calma'
    if (type === 'station') return 'Estacion'
    return 'Continuo'
}

export function CardioSessionForm({ initialData, onSubmit, isSubmitting, onCancel, hideTypeSelector, visibleSections }: CardioSessionFormProps) {
    const initialTrainingType = initialData?.structure?.trainingType || 'rodaje'
    const isKnownInitialType = SESSION_TYPES.some(type => type.id === initialTrainingType)
    const initialBlocks = normalizeInitialBlocks(initialData)
    const initialMode = initialData?.structure?.mode || (initialBlocks.length > 0 ? 'structured' : 'free_text')
    const [blocks, setBlocks] = useState<CardioBlock[]>(initialBlocks)

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            mode: initialMode,
            trainingType: isKnownInitialType ? initialTrainingType : 'other',
            customName: initialTrainingType === 'other' || !isKnownInitialType ? initialData?.name || '' : '',
            targetDistanceKm: initialData?.targetDistanceKm ?? undefined,
            targetDurationMin: initialData?.targetDurationMin ?? undefined,
            targetPace: initialData?.targetPace || '',
            description: initialData?.description || initialData?.structure?.description || '',
            notes: initialData?.structure?.notes || '',
        },
    })

    const selectedMode = form.watch('mode')
    const selectedTrainingType = form.watch('trainingType')
    const calculatedTotals = useMemo(() => calculateCardioStructureTotals({ blocks }), [blocks])
    const structuredSummary = useMemo(() => summarizeCardioStructure({ mode: 'structured', blocks }), [blocks])

    const displayedSections = visibleSections
        ? SESSION_SECTIONS.filter(s => visibleSections.includes(s.label))
        : SESSION_SECTIONS

    function ensureStructuredBlocks() {
        setBlocks((current) => current.length > 0 ? current : defaultStructuredBlocks())
    }

    function updateBlock(id: string, patch: Partial<CardioBlock>) {
        setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block))
    }

    function removeBlock(id: string) {
        setBlocks((current) => current.filter((block) => block.id !== id))
    }

    function addBlock(type: CardioBlockType) {
        setBlocks((current) => [...current, defaultBlock(type)])
    }

    const handleSubmit = async (values: FormValues) => {
        const selectedType = SESSION_TYPES.find(t => t.id === values.trainingType)
        const isOther = values.trainingType === 'other'
        const customName = values.customName?.trim()
        const notes = values.notes?.trim() || undefined
        const isStructured = values.mode === 'structured'
        const description = isStructured ? structuredSummary : values.description?.trim()
        const structure: CardioStructure = isStructured
            ? {
                mode: 'structured',
                trainingType: isOther ? 'other' : values.trainingType,
                description,
                notes,
                blocks,
            }
            : {
                mode: 'free_text',
                trainingType: isOther ? 'other' : values.trainingType,
                description,
                notes,
                blocks: [],
            }

        await onSubmit({
            name: isOther ? customName || 'Otro' : selectedType?.label || 'Cardio',
            description,
            targetDistanceKm: isStructured
                ? calculatedTotals.distanceKm ?? (typeof values.targetDistanceKm === 'number' ? values.targetDistanceKm : undefined)
                : typeof values.targetDistanceKm === 'number' ? values.targetDistanceKm : undefined,
            targetDurationMin: isStructured
                ? calculatedTotals.durationMin ?? (typeof values.targetDurationMin === 'number' ? values.targetDurationMin : undefined)
                : typeof values.targetDurationMin === 'number' ? values.targetDurationMin : undefined,
            targetPace: values.targetPace || undefined,
            structure,
        })
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
                {!hideTypeSelector && (
                    <Card className="border-none bg-muted/30 shadow-sm">
                        <CardContent className="p-4">
                            <FormField
                                control={form.control}
                                name="trainingType"
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel className="text-base font-semibold">Tipo de sesion</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                                className="space-y-4"
                                            >
                                                {displayedSections.map((section) => (
                                                    <div key={section.label}>
                                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                            {section.label}
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                                            {section.types.map((type) => {
                                                                const Icon = type.icon
                                                                return (
                                                                    <div key={type.id} className="min-w-0">
                                                                        <RadioGroupItem value={type.id} id={type.id} className="peer sr-only" />
                                                                        <FormLabel
                                                                            htmlFor={type.id}
                                                                            className={cn(
                                                                                'flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-md border-2 bg-popover p-3 transition-all hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary',
                                                                                'border-transparent',
                                                                                type.bg
                                                                            )}
                                                                        >
                                                                            <Icon className={cn('mb-1.5 h-5 w-5', type.color)} />
                                                                            <span className="text-center text-xs font-semibold leading-tight">{type.label}</span>
                                                                        </FormLabel>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </RadioGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                )}

                {selectedTrainingType === 'other' && (
                    <FormField
                        control={form.control}
                        name="customName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium">Nombre de la sesion</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Ej: Padel, senderismo, eliptica..."
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel className="text-base font-semibold">Modo de planificacion</FormLabel>
                            <FormControl>
                                <RadioGroup
                                    value={field.value}
                                    onValueChange={(value) => {
                                        field.onChange(value)
                                        if (value === 'structured') ensureStructuredBlocks()
                                    }}
                                    className="grid gap-3 sm:grid-cols-2"
                                >
                                    <FormLabel
                                        htmlFor="cardio-mode-free"
                                        className="flex min-h-24 cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                    >
                                        <RadioGroupItem id="cardio-mode-free" value="free_text" className="mt-1" />
                                        <span>
                                            <span className="block font-semibold">Planificacion rapida</span>
                                            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                                                Escribe el entreno como texto libre.
                                            </span>
                                        </span>
                                    </FormLabel>
                                    <FormLabel
                                        htmlFor="cardio-mode-structured"
                                        className="flex min-h-24 cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                                    >
                                        <RadioGroupItem id="cardio-mode-structured" value="structured" className="mt-1" />
                                        <span>
                                            <span className="block font-semibold">Estructurado tipo Garmin</span>
                                            <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                                                Define calentamiento, series, descansos y vuelta a la calma.
                                            </span>
                                        </span>
                                    </FormLabel>
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                    <FormField
                        control={form.control}
                        name="targetDistanceKm"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium">Distancia objetivo (km)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        placeholder={selectedMode === 'structured' && calculatedTotals.distanceKm ? String(calculatedTotals.distanceKm) : 'Ej: 8'}
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="targetDurationMin"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium">Duracion objetivo (min)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder={selectedMode === 'structured' && calculatedTotals.durationMin ? String(calculatedTotals.durationMin) : 'Ej: 45'}
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="targetPace"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium">Ritmo objetivo (min/km)</FormLabel>
                                <FormControl>
                                    <Input type="text" placeholder="Ej: 5:30" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {selectedMode === 'structured' ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-border bg-muted/30 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold">Resumen estructurado</p>
                                    <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                                        {structuredSummary || 'Anade bloques para construir la sesion.'}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span className="rounded-full bg-background px-2 py-1">
                                        {calculatedTotals.distanceKm ? `${calculatedTotals.distanceKm} km` : 'Distancia libre'}
                                    </span>
                                    <span className="rounded-full bg-background px-2 py-1">
                                        {calculatedTotals.durationMin ? `${calculatedTotals.durationMin} min` : 'Duracion libre'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => addBlock('continuous')} className="gap-2">
                                <Plus className="h-4 w-4" />
                                Continuo
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addBlock('intervals')} className="gap-2">
                                <Repeat className="h-4 w-4" />
                                Series
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => addBlock('cooldown')} className="gap-2">
                                <Clock className="h-4 w-4" />
                                Vuelta calma
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {blocks.map((block, index) => (
                                <div key={block.id} className="rounded-lg border border-border bg-background p-4">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold">
                                                {index + 1}. {block.label || blockTypeLabel(block.type)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{blockTypeLabel(block.type)}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeBlock(block.id)}
                                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                            aria-label="Eliminar bloque"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <LabeledInput
                                            label="Nombre"
                                            value={block.label || ''}
                                            placeholder="Ej: Calentamiento"
                                            onChange={(value) => updateBlock(block.id, { label: value })}
                                        />
                                        {block.type === 'intervals' ? (
                                            <>
                                                <LabeledInput
                                                    label="Repeticiones"
                                                    type="number"
                                                    value={toInputValue(block.sets)}
                                                    placeholder="3"
                                                    onChange={(value) => updateBlock(block.id, { sets: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Trabajo distancia (km)"
                                                    type="number"
                                                    step="0.1"
                                                    value={toInputValue(block.workDistance)}
                                                    placeholder="1"
                                                    onChange={(value) => updateBlock(block.id, { workDistance: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Trabajo duracion (min)"
                                                    type="number"
                                                    value={toInputValue(block.workDuration)}
                                                    placeholder="Opcional"
                                                    onChange={(value) => updateBlock(block.id, { workDuration: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Ritmo/objetivo trabajo"
                                                    value={block.workTargetPace || ''}
                                                    placeholder="Ej: 4:15/km"
                                                    onChange={(value) => updateBlock(block.id, { workTargetPace: value })}
                                                />
                                                <LabeledInput
                                                    label="Recuperacion (min)"
                                                    type="number"
                                                    value={toInputValue(block.restDuration)}
                                                    placeholder="2"
                                                    onChange={(value) => updateBlock(block.id, { restDuration: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Recuperacion (km)"
                                                    type="number"
                                                    step="0.1"
                                                    value={toInputValue(block.restDistance)}
                                                    placeholder="Opcional"
                                                    onChange={(value) => updateBlock(block.id, { restDistance: parseNumericInput(value) })}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <LabeledInput
                                                    label="Distancia (km)"
                                                    type="number"
                                                    step="0.1"
                                                    value={toInputValue(block.distance)}
                                                    placeholder="Opcional"
                                                    onChange={(value) => updateBlock(block.id, { distance: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Duracion (min)"
                                                    type="number"
                                                    value={toInputValue(block.duration)}
                                                    placeholder="10"
                                                    onChange={(value) => updateBlock(block.id, { duration: parseNumericInput(value) })}
                                                />
                                                <LabeledInput
                                                    label="Ritmo/objetivo"
                                                    value={block.targetPace || ''}
                                                    placeholder="Ej: suave, Z2, 5:30/km"
                                                    onChange={(value) => updateBlock(block.id, { targetPace: value })}
                                                />
                                                <LabeledInput
                                                    label="FC objetivo"
                                                    value={block.targetHR || ''}
                                                    placeholder="Ej: 140-150 ppm"
                                                    onChange={(value) => updateBlock(block.id, { targetHR: value })}
                                                />
                                            </>
                                        )}
                                    </div>

                                    <div className="mt-3">
                                        <LabeledInput
                                            label="Notas del bloque"
                                            value={block.notes || ''}
                                            placeholder="Opcional"
                                            onChange={(value) => updateBlock(block.id, { notes: value })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Detalles del entrenamiento</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder={`Ej:
Calentamiento:
- 10 min suaves

Bloque principal:
- 4 x 1000 m a ritmo 10K

Recuperacion:
- 2 min de trote suave

Vuelta a la calma:
- 10 min suaves`}
                                        className="min-h-[150px] resize-none text-base leading-relaxed"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-sm font-medium text-muted-foreground">Notas para el cliente (opcional)</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Ej: Recuerda hidratarte bien antes de salir."
                                    className="min-h-20 resize-none"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting} className="w-full sm:w-auto">
                            Cancelar
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                        {isSubmitting ? 'Guardando...' : 'Guardar sesion'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

function LabeledInput({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    step,
}: {
    label: string
    value: string | number
    onChange: (value: string) => void
    placeholder?: string
    type?: string
    step?: string
}) {
    return (
        <label className="block min-w-0 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Input
                type={type}
                step={step}
                min={type === 'number' ? '0' : undefined}
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    )
}
