'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AIActionButton } from '@/components/ui/ai-action-button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Sparkles,
    Loader2,
    Dumbbell,
    Heart,
    RotateCcw,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { createTemplate } from '../../../../app/(coach)/coach/templates/actions'
import type {
    StrengthStructure,
    CardioStructure,
    TemplateDay,
    TemplateExercise,
} from '@/types/templates'
import type { AIStrengthTemplate, AICardioTemplate, AIGeneratedTemplate } from '@/types/ai-template'

// ============================================================================
// Types
// ============================================================================

type TemplateType = 'strength' | 'cardio'
type Step = 'input' | 'loading' | 'preview'

interface AITemplateDialogProps {
    trigger?: React.ReactNode
    defaultType?: TemplateType
}

// ============================================================================
// Helpers: convert AI output → app structures
// ============================================================================

function aiStrengthToStructure(template: AIStrengthTemplate): StrengthStructure {
    // Group rows by "dia"
    const dayMap = new Map<string, typeof template.rows>()
    for (const row of template.rows) {
        const existing = dayMap.get(row.dia) ?? []
        existing.push(row)
        dayMap.set(row.dia, existing)
    }

    const days: TemplateDay[] = []
    let dayOrder = 1
    for (const [dayName, rows] of dayMap) {
        const exercises: TemplateExercise[] = rows.map((row, idx) => ({
            id: crypto.randomUUID(),
            exercise_name: row.ejercicio,
            order: idx + 1,
            muscle_group: 'otros',
            sets: row.series,
            reps: row.reps,
            rir: row.rir || undefined,
            rest_seconds: row.rest,
            notes: row.notas || null,
        }))
        days.push({
            id: crypto.randomUUID(),
            name: dayName,
            order: dayOrder++,
            exercises,
        })
    }

    return { days, weeks: 4 }
}

function aiCardioToStructure(template: AICardioTemplate): CardioStructure {
    return {
        trainingType: template.trainingType,
        description: template.details,
        notes: template.clientNotes || '',
        blocks: [],
    }
}

// ============================================================================
// Cardio type labels
// ============================================================================

const CARDIO_TYPE_LABELS: Record<string, string> = {
    rodaje: 'Rodaje',
    series: 'Series',
    tempo: 'Tempo',
    hybrid: 'Híbrido',
    progressive: 'Progresivos',
    fartlek: 'Fartlek',
}

// ============================================================================
// Preview components
// ============================================================================

function StrengthPreview({ template }: { template: AIStrengthTemplate }) {
    const dayMap = new Map<string, typeof template.rows>()
    for (const row of template.rows) {
        const existing = dayMap.get(row.dia) ?? []
        existing.push(row)
        dayMap.set(row.dia, existing)
    }

    return (
        <div className="space-y-4">
            {/* Header info */}
            <div className="space-y-1">
                <h3 className="font-semibold text-base">{template.name}</h3>
                {template.description && (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                )}
                {template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {template.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Days */}
            <div className="space-y-3">
                {Array.from(dayMap.entries()).map(([dayName, rows]) => (
                    <Card key={dayName} className="border-border/60">
                        <CardHeader className="py-2 px-3">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                                {dayName}
                                <span className="text-xs text-muted-foreground font-normal ml-auto">
                                    {rows.length} ejercicio{rows.length !== 1 ? 's' : ''}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-muted-foreground border-b border-border/40">
                                            <th className="text-left py-1 pr-2 font-medium">Ejercicio</th>
                                            <th className="text-center py-1 px-1 font-medium w-10">Series</th>
                                            <th className="text-center py-1 px-1 font-medium w-12">Reps</th>
                                            <th className="text-center py-1 px-1 font-medium w-10">RIR</th>
                                            <th className="text-center py-1 px-1 font-medium w-14">Descanso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, i) => (
                                            <tr key={i} className="border-b border-border/20 last:border-0">
                                                <td className="py-1.5 pr-2">
                                                    <span className="font-medium">{row.ejercicio}</span>
                                                    {row.notas && (
                                                        <span className="block text-muted-foreground text-[10px]">
                                                            {row.notas}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-center py-1.5 px-1">{row.series}</td>
                                                <td className="text-center py-1.5 px-1">{row.reps}</td>
                                                <td className="text-center py-1.5 px-1">
                                                    {row.rir || <span className="text-muted-foreground">—</span>}
                                                </td>
                                                <td className="text-center py-1.5 px-1">
                                                    {row.rest > 0 ? `${row.rest}s` : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}

function CardioPreview({ template }: { template: AICardioTemplate }) {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="space-y-1">
                <h3 className="font-semibold text-base">{template.name}</h3>
                {template.description && (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className="text-xs gap-1">
                        <Heart className="h-3 w-3" />
                        {CARDIO_TYPE_LABELS[template.trainingType] ?? template.trainingType}
                    </Badge>
                    {template.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Details */}
            <Card className="border-border/60">
                <CardHeader className="py-2 px-3">
                    <CardTitle className="text-sm font-medium">Detalles del entrenamiento</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{template.details}</p>
                </CardContent>
            </Card>

            {/* Client notes */}
            {template.clientNotes && (
                <Card className="border-border/60 bg-muted/30">
                    <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm font-medium">Notas para el cliente</CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {template.clientNotes}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

// ============================================================================
// Example prompts
// ============================================================================

const EXAMPLE_PROMPTS: { type: TemplateType; label: string; prompt: string }[] = [
    {
        type: 'strength',
        label: 'Fuerza 4 días',
        prompt: 'Rutina de fuerza de 4 días con frecuencia 2 en pecho y espalda, enfoque hipertrofia, volumen moderado',
    },
    {
        type: 'strength',
        label: 'Torso-Pierna',
        prompt: 'Rutina torso pierna de 4 días con ejercicios básicos y volumen moderado para intermedios',
    },
    {
        type: 'cardio',
        label: 'Rodaje suave 10K',
        prompt: 'Rodaje suave de 10 km para construir base aeróbica, ritmo conversacional',
    },
    {
        type: 'cardio',
        label: 'Series para 10K',
        prompt: 'Sesión de series para preparación de 10K con calentamiento, 6x1000m y vuelta a la calma',
    },
]

// ============================================================================
// Main component
// ============================================================================

export function AITemplateDialog({ trigger, defaultType = 'strength' }: AITemplateDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [type, setType] = useState<TemplateType>(defaultType)
    const [prompt, setPrompt] = useState('')
    const [generatedTemplate, setGeneratedTemplate] = useState<AIGeneratedTemplate | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isCreating, startCreatingTransition] = useTransition()
    const router = useRouter()
    const { toast } = useToast()

    function resetDialog() {
        setStep('input')
        setPrompt('')
        setGeneratedTemplate(null)
        setError(null)
    }

    function handleOpenChange(value: boolean) {
        setOpen(value)
        if (!value) resetDialog()
    }

    async function handleGenerate() {
        if (!prompt.trim()) return
        setError(null)
        setIsGenerating(true)
        setStep('loading')

        try {
            const res = await fetch('/api/ai/generate-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, prompt: prompt.trim() }),
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                throw new Error(data.error ?? 'Error desconocido generando la plantilla.')
            }

            setGeneratedTemplate(data.template)
            setStep('preview')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.'
            setError(message)
            setStep('input')
        } finally {
            setIsGenerating(false)
        }
    }

    function handleRegenerate() {
        setGeneratedTemplate(null)
        setError(null)
        handleGenerate()
    }

    function handleConfirm() {
        if (!generatedTemplate) return

        startCreatingTransition(async () => {
            try {
                let result

                if (generatedTemplate.type === 'strength') {
                    const structure = aiStrengthToStructure(generatedTemplate)
                    result = await createTemplate({
                        name: generatedTemplate.name,
                        description: generatedTemplate.description || undefined,
                        tags: generatedTemplate.tags,
                        type: 'strength',
                        structure,
                    })
                } else {
                    const structure = aiCardioToStructure(generatedTemplate)
                    result = await createTemplate({
                        name: generatedTemplate.name,
                        description: generatedTemplate.description || undefined,
                        tags: generatedTemplate.tags,
                        type: 'cardio',
                        structure,
                    })
                }

                if (!result.success) {
                    throw new Error(result.error ?? 'Error guardando la plantilla.')
                }

                toast({
                    title: 'Plantilla creada',
                    description: `"${generatedTemplate.name}" se ha guardado correctamente.`,
                })

                setOpen(false)
                resetDialog()

                if (result.template?.id) {
                    router.push(`/coach/templates/${result.template.id}`)
                } else {
                    router.refresh()
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Error guardando la plantilla.'
                toast({
                    title: 'Error al guardar',
                    description: message,
                    variant: 'destructive',
                })
            }
        })
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

            <DialogContent
                className={cn(
                    'max-w-2xl max-h-[90vh] flex flex-col',
                    step === 'preview' && 'max-w-2xl'
                )}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Generar plantilla con IA
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input' && 'Describe el entrenamiento que necesitas y la IA creará una propuesta para que la revises.'}
                        {step === 'loading' && 'Generando tu plantilla personalizada…'}
                        {step === 'preview' && 'Revisa la propuesta generada. Puedes confirmarla o volver a generarla.'}
                    </DialogDescription>
                </DialogHeader>

                {/* ── Step: Input ── */}
                {step === 'input' && (
                    <div className="flex flex-col gap-5 overflow-y-auto flex-1 pr-1">
                        {/* Type selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tipo de plantilla</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setType('strength')}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                        type === 'strength'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <Dumbbell className="h-4 w-4" />
                                    Fuerza
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('cardio')}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                        type === 'cardio'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <Heart className="h-4 w-4" />
                                    Cardio
                                </button>
                            </div>
                        </div>

                        {/* Prompt */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                ¿Qué plantilla necesitas?
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    type === 'strength'
                                        ? 'Ej: Rutina de fuerza de 4 días con frecuencia 2 de pecho, enfoque hipertrofia, volumen moderado…'
                                        : 'Ej: Sesión de series para 10K con calentamiento, 6x1000m y vuelta a la calma…'
                                }
                                className="min-h-[100px] resize-none"
                                maxLength={600}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault()
                                        handleGenerate()
                                    }
                                }}
                            />
                            <p className="text-xs text-muted-foreground text-right">
                                {prompt.length}/600
                            </p>
                        </div>

                        {/* Example prompts */}
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                Ejemplos
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {EXAMPLE_PROMPTS.filter((e) => e.type === type).map((example) => (
                                    <button
                                        key={example.label}
                                        type="button"
                                        onClick={() => setPrompt(example.prompt)}
                                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors text-left"
                                    >
                                        {example.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setOpen(false)}>
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

                {/* ── Step: Loading ── */}
                {step === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                                <Sparkles className="h-7 w-7 text-primary animate-pulse" />
                            </div>
                            <Loader2 className="h-16 w-16 text-primary/30 animate-spin absolute inset-0" />
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-medium">Creando tu plantilla…</p>
                            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos</p>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && generatedTemplate && (
                    <div className="flex flex-col gap-4 overflow-y-auto flex-1">
                        {/* Preview content */}
                        <div className="flex-1 overflow-y-auto pr-1">
                            {generatedTemplate.type === 'strength' ? (
                                <StrengthPreview template={generatedTemplate} />
                            ) : (
                                <CardioPreview template={generatedTemplate} />
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={handleRegenerate}
                                disabled={isCreating}
                                className="gap-2"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Regenerar
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('input')}
                                    disabled={isCreating}
                                >
                                    Volver
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={isCreating}
                                    className="gap-2"
                                >
                                    {isCreating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                    )}
                                    {isCreating ? 'Guardando…' : 'Confirmar y crear'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
