'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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
import { Plus, Loader2, Dumbbell, Heart } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createTemplate } from '../../../../app/(coach)/coach/templates/actions'

const formSchema = z.object({
    name: z.string().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
    description: z.string().max(500, 'Máximo 500 caracteres').optional(),
    tags: z.string().optional(), // Comma separated string for input
    type: z.enum(['strength', 'cardio'], {
        required_error: 'Debes seleccionar un tipo de plantilla',
    }),
})

interface CreateTemplateDialogProps {
    children?: React.ReactNode
    trigger?: React.ReactNode
    defaultType?: 'strength' | 'cardio'
}

export function CreateTemplateDialog({ children, trigger, defaultType }: CreateTemplateDialogProps) {
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { toast } = useToast()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            description: '',
            tags: '',
            type: defaultType || 'strength',
        },
    })

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        startTransition(async () => {
            // Convert comma-separated tags to array
            const tagArray = values.tags
                ? values.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0)
                : []

            const result = await createTemplate({
                name: values.name,
                description: values.description,
                tags: tagArray,
                type: values.type,
            })

            if (result.success) {
                toast({
                    title: 'Plantilla creada',
                    description: `La plantilla de ${values.type === 'strength' ? 'Fuerza' : 'Cardio'} "${values.name}" se ha creado correctamente. Redirigiendo...`,
                    variant: 'default',
                    className: 'bg-green-500 text-white border-none',
                })
                setOpen(false)
                form.reset()
                router.refresh()
                if (result.template?.id) {
                    router.push(`/coach/templates/${result.template.id}`)
                }
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'No se pudo crear la plantilla.',
                    variant: 'destructive',
                })
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || children || (
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Plantilla
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Crear Plantilla</DialogTitle>
                    <DialogDescription>
                        Elige el tipo y define los detalles básicos de tu nueva plantilla.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Tipo de Entrenamiento</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="grid grid-cols-2 gap-4"
                                        >
                                            <div>
                                                <RadioGroupItem value="strength" id="strength" className="peer sr-only" disabled={!!defaultType} />
                                                <FormLabel
                                                    htmlFor="strength"
                                                    className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer ${defaultType === 'cardio' ? 'opacity-50 cursor-not-allowed' : ''
                                                        }`}
                                                >
                                                    <Dumbbell className="mb-2 h-6 w-6" />
                                                    <span className="font-semibold">Fuerza</span>
                                                </FormLabel>
                                            </div>
                                            <div>
                                                <RadioGroupItem value="cardio" id="cardio" className="peer sr-only" disabled={!!defaultType} />
                                                <FormLabel
                                                    htmlFor="cardio"
                                                    className={`flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer ${defaultType === 'strength' ? 'opacity-50 cursor-not-allowed' : ''
                                                        }`}
                                                >
                                                    <Heart className="mb-2 h-6 w-6" />
                                                    <span className="font-semibold">Cardio</span>
                                                </FormLabel>
                                            </div>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-1 gap-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ej: Rutina de Fuerza 5x5" {...field} />
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
                                        <FormLabel>Descripción</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Breve descripción del objetivo..."
                                                className="resize-none"
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
                                                placeholder="Separadas por comas (ej: fuerza, hipertrofia)"
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
                        <DialogFooter>
                            <Button type="submit" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Crear Plantilla
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
