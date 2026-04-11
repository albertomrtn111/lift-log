'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sparkles, Loader2, ClipboardList, UserRound, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { FormBuilderInitialData, FormField, FormFieldType } from '@/types/forms'

type AIFormType = 'onboarding' | 'checkin'
type Step = 'input' | 'loading'
type AllowedGeneratedFieldType = Exclude<FormFieldType, 'photo_upload'>

interface AIFormDialogProps {
    defaultType?: AIFormType
    trigger?: ReactNode
    onGenerated: (type: AIFormType, data: FormBuilderInitialData) => void
}

interface AIGeneratedField {
    label: string
    type: AllowedGeneratedFieldType
    required: boolean
    min?: number | null
    max?: number | null
    step?: number | null
    options?: string[]
    helpText?: string | null
}

interface AIGeneratedFormResponse {
    form: {
        title: string
        formType: AIFormType
        fields: AIGeneratedField[]
    }
}

const EXAMPLE_PROMPTS: { type: AIFormType; label: string; prompt: string }[] = [
    {
        type: 'onboarding',
        label: 'Nuevo cliente recomposición',
        prompt: 'Quiero un onboarding para un cliente que busca recomposición corporal, con preguntas sobre hábitos, lesiones, experiencia previa, horario disponible y alimentación.',
    },
    {
        type: 'onboarding',
        label: 'Onboarding runner',
        prompt: 'Genera un onboarding para un atleta de running con preguntas de historial, molestias, kilómetros semanales, material y objetivos de carrera.',
    },
    {
        type: 'checkin',
        label: 'Check-in semanal fuerza',
        prompt: 'Necesito un check-in semanal para clientes de fuerza con preguntas sobre adherencia, energía, sueño, estrés, rendimiento y peso corporal.',
    },
    {
        type: 'checkin',
        label: 'Check-in digestión y hambre',
        prompt: 'Crea un check-in centrado en nutrición con preguntas sobre hambre, digestión, cumplimiento del plan, pasos y sensaciones generales.',
    },
]

function sanitizeGeneratedField(field: AIGeneratedField, index: number): FormField {
    const base: FormField = {
        id: `campo_${index + 1}`,
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        helpText: field.helpText?.trim() || null,
    }

    if (field.type === 'single_choice' || field.type === 'multi_choice') {
        base.options = (field.options ?? []).map((option) => option.trim()).filter(Boolean)
    }

    if (field.type === 'number' || field.type === 'scale') {
        if (field.min != null) base.min = field.min
        if (field.max != null) base.max = field.max
        if (field.step != null) base.step = field.step
    }

    return base
}

export function AIFormDialog({
    defaultType = 'onboarding',
    trigger,
    onGenerated,
}: AIFormDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [type, setType] = useState<AIFormType>(defaultType)
    const [prompt, setPrompt] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)

    function resetDialog(nextType = defaultType) {
        setStep('input')
        setType(nextType)
        setPrompt('')
        setError(null)
        setIsGenerating(false)
    }

    function handleOpenChange(value: boolean) {
        setOpen(value)
        if (!value) {
            resetDialog(defaultType)
        } else {
            setType(defaultType)
        }
    }

    async function handleGenerate() {
        if (!prompt.trim()) return

        setError(null)
        setIsGenerating(true)
        setStep('loading')

        try {
            const res = await fetch('/api/ai/generate-form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    prompt: prompt.trim(),
                }),
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                throw new Error(data.error ?? 'No se pudo generar el formulario.')
            }

            const parsed = data as AIGeneratedFormResponse
            const draft: FormBuilderInitialData = {
                title: parsed.form.title,
                schema: parsed.form.fields.map(sanitizeGeneratedField),
            }

            setOpen(false)
            resetDialog(parsed.form.formType)

            window.setTimeout(() => {
                onGenerated(parsed.form.formType, draft)
            }, 0)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error inesperado generando el formulario.'
            setError(message)
            setStep('input')
            setIsGenerating(false)
            return
        }

        setIsGenerating(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <AIActionButton>
                        Generar con IA
                    </AIActionButton>
                )}
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Generar formulario con IA
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input'
                            ? 'Elige si quieres un onboarding o un check-in, describe lo que necesitas y prepararemos un borrador editable.'
                            : 'Estamos preparando un borrador de formulario con las preguntas necesarias.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'input' && (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tipo de formulario</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setType('onboarding')}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors',
                                        type === 'onboarding'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <UserRound className="h-4 w-4" />
                                    Onboarding
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('checkin')}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors',
                                        type === 'checkin'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <ClipboardList className="h-4 w-4" />
                                    Check-in
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                ¿Qué quieres que pregunte el formulario?
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    type === 'onboarding'
                                        ? 'Ej: Quiero conocer objetivos, lesiones, experiencia previa, disponibilidad semanal, material, hábitos de sueño y alimentación…'
                                        : 'Ej: Necesito un check-in breve con adherencia, energía, digestión, hambre, rendimiento, pasos y sensaciones generales…'
                                }
                                className="min-h-[120px] resize-none"
                                maxLength={1200}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault()
                                        handleGenerate()
                                    }
                                }}
                            />
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <p>
                                    Si no especificas el número o el tipo de preguntas, la IA añadirá las más necesarias.
                                </p>
                                <span>{prompt.length}/1200</span>
                            </div>
                        </div>

                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <p className="text-sm font-medium">Importante</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Las fotos de progreso seguirán siendo un bloque fijo del formulario. La IA solo generará las preguntas editables.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Ejemplos
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {EXAMPLE_PROMPTS.filter((example) => example.type === type).map((example) => (
                                    <button
                                        key={example.label}
                                        type="button"
                                        onClick={() => setPrompt(example.prompt)}
                                        className="rounded-full border border-border px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/60 hover:bg-primary/5"
                                    >
                                        {example.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => handleOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                disabled={!prompt.trim() || isGenerating}
                                className="gap-2"
                            >
                                <Sparkles className="h-4 w-4" />
                                Generar
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}

                {step === 'loading' && (
                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                        <div className="relative">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                                <Sparkles className="h-7 w-7 animate-pulse text-primary" />
                            </div>
                            <Loader2 className="absolute inset-0 h-16 w-16 animate-spin text-primary/30" />
                        </div>
                        <div className="space-y-1 text-center">
                            <p className="font-medium">Generando tu formulario…</p>
                            <p className="text-sm text-muted-foreground">
                                En cuanto esté listo se abrirá el editor para revisarlo.
                            </p>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
