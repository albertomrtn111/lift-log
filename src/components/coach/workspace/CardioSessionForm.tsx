"use client"

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    Dumbbell,
    Footprints,
    Zap,
    Shuffle,
    Gauge,
    TrendingUp,
    Bike,
    Waves
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

import { CardioStructure } from '@/types/templates'
import { cn } from '@/lib/utils'

// Simplified Schema
const numericOptional = z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number().min(0, "No puede ser negativo").optional()
)

const formSchema = z.object({
    trainingType: z.string().optional(),
    targetDistanceKm: numericOptional,
    targetDurationMin: numericOptional,
    targetPace: z.string().optional(),
    description: z.string().min(1, "El detalle del entrenamiento es obligatorio"),
    notes: z.string().optional(),
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
        label: 'Híbrido',
        types: [
            { id: 'hybrid', label: 'Híbrido', icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-500/10' },
        ],
    },
]

// Flat list for lookups (name resolution in handleSubmit)
const SESSION_TYPES = SESSION_SECTIONS.flatMap(s => s.types)

export function CardioSessionForm({ initialData, onSubmit, isSubmitting, onCancel, hideTypeSelector, visibleSections }: CardioSessionFormProps) {

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            trainingType: initialData?.structure?.trainingType || 'rodaje',
            targetDistanceKm: initialData?.targetDistanceKm ?? undefined,
            targetDurationMin: initialData?.targetDurationMin ?? undefined,
            targetPace: initialData?.targetPace || '',
            description: initialData?.description || initialData?.structure?.description || '',
            notes: initialData?.structure?.notes || '',
        },
    })

    const handleSubmit = async (values: FormValues) => {
        await onSubmit({
            name: SESSION_TYPES.find(t => t.id === values.trainingType)?.label || 'Cardio',
            description: values.description,
            targetDistanceKm: typeof values.targetDistanceKm === 'number' ? values.targetDistanceKm : undefined,
            targetDurationMin: typeof values.targetDurationMin === 'number' ? values.targetDurationMin : undefined,
            targetPace: values.targetPace || undefined,
            structure: {
                trainingType: values.trainingType,
                notes: values.notes,
                blocks: []
            }
        })
    }

    const displayedSections = visibleSections
        ? SESSION_SECTIONS.filter(s => visibleSections.includes(s.label))
        : SESSION_SECTIONS

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

                {/* Session Type Selector */}
                {!hideTypeSelector && (
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
                                                className="space-y-4"
                                            >
                                                {displayedSections.map((section) => (
                                                <div key={section.label}>
                                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                                        {section.label}
                                                    </p>
                                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                                        {section.types.map((type) => {
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
                                                                            "flex flex-col items-center justify-center rounded-md border-2 bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all",
                                                                            "border-transparent",
                                                                            type.bg
                                                                        )}
                                                                    >
                                                                        <Icon className={cn("mb-1.5 h-5 w-5", type.color)} />
                                                                        <span className="text-xs font-semibold text-center leading-tight">{type.label}</span>
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

                {/* Target Objectives Row */}
                <div className="grid grid-cols-3 gap-4">
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
                                        placeholder="Ej: 8"
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
                                <FormLabel className="text-sm font-medium">Duración objetivo (min)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder="Ej: 45"
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
                                    <Input
                                        type="text"
                                        placeholder="Ej: 5:30"
                                        {...field}
                                        value={field.value ?? ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Details */}
                <div className="space-y-4">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Detalles del Entrenamiento</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder={`Ej:
Calentamiento:
- 10 min suaves
- movilidad dinámica y 3 progresiones

Bloque principal:
- 4 x 1000 m a ritmo 10K

Recuperación:
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

                <div className="flex justify-end gap-2 pt-4">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Guardando..." : "Guardar Sesión"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
