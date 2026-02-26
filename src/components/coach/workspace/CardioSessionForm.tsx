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
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { CardioStructure } from '@/types/templates'
import { cn } from '@/lib/utils'

// Simplified Schema
const formSchema = z.object({
    trainingType: z.string().optional(),
    description: z.string().min(1, "El detalle del entrenamiento es obligatorio"),
    notes: z.string().optional(),
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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            trainingType: initialData?.structure?.trainingType || 'rodaje',
            description: initialData?.description || initialData?.structure?.description || '',
            notes: initialData?.structure?.notes || '',
        },
    })

    const handleSubmit = async (values: FormValues) => {
        // We defer to the parent action to construct the final object.
        // We map 'description' to the session's main text.
        // We map 'notes' to the structure's notes.
        await onSubmit({
            name: SESSION_TYPES.find(t => t.id === values.trainingType)?.label || 'Cardio', // Default name based on type
            description: values.description,
            structure: {
                trainingType: values.trainingType,
                notes: values.notes,
                blocks: [] // Empty blocks as requested
            }
        })
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

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
                                        placeholder="Ej: 10 min suaves + 4x1000m a ritmo 4:00 rec 2' + 10 min suaves. &#10;Sensaciones esperadas: RPE 7/10."
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
