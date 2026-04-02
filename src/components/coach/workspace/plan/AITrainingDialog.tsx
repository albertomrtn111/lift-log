'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Sparkles,
    Loader2,
    Dumbbell,
    RotateCcw,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Wand2,
    PlusCircle,
    ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AITrainingProposal } from '@/app/api/ai/generate-training/route'
import type { StrengthStructure } from '@/types/templates'

// ============================================================================
// Types
// ============================================================================

type Mode = 'generate' | 'modify'
type Step = 'input' | 'loading' | 'preview'

interface ExistingExercise {
    dayName: string
    exerciseName: string
    sets?: number | null
    reps?: string | null
    rir?: string | null
    restSeconds?: number | null
    notes?: string | null
}

interface ExistingProgram {
    name: string
    weeks: number
    exercises: ExistingExercise[]
}

interface AITrainingDialogProps {
    trigger?: React.ReactNode
    existingProgram?: ExistingProgram | null
    /** Called when user confirms — receives a StrengthStructure ready to import into the wizard */
    onConfirm: (structure: StrengthStructure, programName: string, weeks: number) => void
}

// ============================================================================
// Convert AI proposal → StrengthStructure (compatible with handleImportTemplate)
// ============================================================================

function proposalToStrengthStructure(proposal: AITrainingProposal): StrengthStructure {
    return {
        weeks: proposal.weeks,
        days: proposal.days.map((day, dIdx) => ({
            id: crypto.randomUUID(),
            name: day.name,
            order: dIdx + 1,
            exercises: day.exercises.map((ex, eIdx) => ({
                id: crypto.randomUUID(),
                exercise_name: ex.exercise_name,
                order: eIdx + 1,
                sets: ex.sets,
                reps: ex.reps,
                rir: ex.rir || undefined,
                rest_seconds: ex.rest_seconds,
                notes: ex.notes || null,
            })),
        })),
    }
}

// ============================================================================
// Diff helpers
// ============================================================================

function getChangeBadgeColor(change: string): string {
    const lower = change.toLowerCase()
    if (lower.startsWith('añadid') || lower.startsWith('incorporad') || lower.startsWith('agregad')) return 'bg-green-500/10 text-green-400 border-green-500/20'
    if (lower.startsWith('eliminad') || lower.startsWith('quitad') || lower.startsWith('removid')) return 'bg-red-500/10 text-red-400 border-red-500/20'
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
}

// ============================================================================
// Preview
// ============================================================================

function ProposalPreview({ proposal, mode }: { proposal: AITrainingProposal; mode: Mode }) {
    const [expandedDay, setExpandedDay] = useState<number | null>(0)

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{proposal.name}</h3>
                    <Badge variant="outline" className="text-xs">
                        {proposal.weeks} sem.
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                        {proposal.days.length} días
                    </Badge>
                </div>
            </div>

            {/* Changes diff (modify mode only) */}
            {mode === 'modify' && proposal.changes.length > 0 && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Wand2 className="h-3.5 w-3.5 text-primary" />
                            Cambios realizados por la IA
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
                        {proposal.changes.map((change, i) => (
                            <div key={i} className={cn(
                                'text-xs px-2.5 py-1.5 rounded-md border',
                                getChangeBadgeColor(change)
                            )}>
                                {change}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Explanation */}
            <Card className="border-border/50 bg-muted/20">
                <CardContent className="pt-3 pb-3 px-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Razonamiento</p>
                    <p className="text-sm leading-relaxed">{proposal.explanation}</p>
                </CardContent>
            </Card>

            {/* Days */}
            <div className="space-y-2">
                {proposal.days.map((day, dIdx) => (
                    <Card key={dIdx} className="border-border/60">
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setExpandedDay(expandedDay === dIdx ? null : dIdx)}
                        >
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-sm font-medium flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <Dumbbell className="h-3.5 w-3.5 text-primary" />
                                        {day.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-normal">
                                        {day.exercises.length} ejercicio{day.exercises.length !== 1 ? 's' : ''}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                        </button>

                        {expandedDay === dIdx && (
                            <CardContent className="px-3 pb-3 pt-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-muted-foreground border-b border-border/40">
                                                <th className="text-left py-1 pr-2 font-medium">Ejercicio</th>
                                                <th className="text-center py-1 px-1 font-medium w-10">Series</th>
                                                <th className="text-center py-1 px-1 font-medium w-14">Reps</th>
                                                <th className="text-center py-1 px-1 font-medium w-10">RIR</th>
                                                <th className="text-center py-1 px-1 font-medium w-16">Descanso</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {day.exercises.map((ex, eIdx) => (
                                                <tr key={eIdx} className="border-b border-border/20 last:border-0">
                                                    <td className="py-1.5 pr-2">
                                                        <span className="font-medium">{ex.exercise_name}</span>
                                                        {ex.notes && (
                                                            <span className="block text-muted-foreground text-[10px]">
                                                                {ex.notes}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="text-center py-1.5 px-1">{ex.sets}</td>
                                                    <td className="text-center py-1.5 px-1">{ex.reps}</td>
                                                    <td className="text-center py-1.5 px-1">
                                                        {ex.rir || <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="text-center py-1.5 px-1">
                                                        {ex.rest_seconds > 0 ? `${ex.rest_seconds}s` : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    )
}

// ============================================================================
// Example prompts
// ============================================================================

const GENERATE_EXAMPLES = [
    'Rutina fuerza 4 días, torso-pierna, hipertrofia, intermedio',
    'Push-pull-legs 6 días con énfasis en hombros, volumen alto',
    'Full body 3 días para principiante, ejercicios básicos',
    'Rutina powerlifting 4 días, foco en sentadilla y peso muerto',
]

const MODIFY_EXAMPLES = [
    'Añade más volumen de bíceps en días de tirón',
    'Sustituye los ejercicios de máquina por versiones con barra o mancuerna',
    'Sube el RIR general a 3 para fase de acumulación',
    'Añade trabajo de core al final de cada día',
]

// ============================================================================
// Main component
// ============================================================================

export function AITrainingDialog({ trigger, existingProgram, onConfirm }: AITrainingDialogProps) {
    const hasExisting = !!existingProgram && existingProgram.exercises.length > 0

    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [mode, setMode] = useState<Mode>(hasExisting ? 'modify' : 'generate')
    const [prompt, setPrompt] = useState('')
    const [proposal, setProposal] = useState<AITrainingProposal | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)


    function resetDialog() {
        setStep('input')
        setPrompt('')
        setProposal(null)
        setError(null)
    }

    function handleOpenChange(value: boolean) {
        setOpen(value)
        if (!value) resetDialog()
    }

    // Update default mode when existingProgram changes
    function handleOpen() {
        setMode(hasExisting ? 'modify' : 'generate')
        setOpen(true)
    }

    async function handleGenerate() {
        if (!prompt.trim()) return
        setError(null)
        setIsGenerating(true)
        setStep('loading')

        try {
            const res = await fetch('/api/ai/generate-training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    prompt: prompt.trim(),
                    existingProgram: mode === 'modify' ? existingProgram : null,
                }),
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                throw new Error(data.error ?? 'Error desconocido generando el programa.')
            }

            setProposal(data.proposal)
            setStep('preview')
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error inesperado. Inténtalo de nuevo.'
            setError(message)
            setStep('input')
        } finally {
            setIsGenerating(false)
        }
    }

    function handleConfirm() {
        if (!proposal) return
        const structure = proposalToStrengthStructure(proposal)
        onConfirm(structure, proposal.name, proposal.weeks)
        setOpen(false)
        resetDialog()
    }

    const examples = mode === 'generate' ? GENERATE_EXAMPLES : MODIFY_EXAMPLES

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild onClick={handleOpen}>
                {trigger ?? (
                    <Button variant="outline" className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        Generar con IA
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        {mode === 'generate' ? 'Generar programa con IA' : 'Modificar programa con IA'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input' && (mode === 'generate'
                            ? 'Describe el programa que necesitas y la IA creará una propuesta completa para revisar.'
                            : 'Indica qué quieres cambiar y la IA modificará el programa actual mostrando los cambios.')}
                        {step === 'loading' && 'Generando propuesta de entrenamiento…'}
                        {step === 'preview' && 'Revisa la propuesta. Al confirmar irás al wizard para ajustar semanas, días y ejercicios.'}
                    </DialogDescription>
                </DialogHeader>

                {/* ── Step: Input ── */}
                {step === 'input' && (
                    <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">
                        {/* Mode selector (only if has existing program) */}
                        {hasExisting && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">¿Qué quieres hacer?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMode('modify')}
                                        className={cn(
                                            'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                            mode === 'modify'
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                        )}
                                    >
                                        <Wand2 className="h-4 w-4" />
                                        Modificar programa actual
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('generate')}
                                        className={cn(
                                            'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                            mode === 'generate'
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                        )}
                                    >
                                        <PlusCircle className="h-4 w-4" />
                                        Generar uno nuevo
                                    </button>
                                </div>
                                {mode === 'modify' && existingProgram && (
                                    <p className="text-xs text-muted-foreground px-1">
                                        La IA verá el programa actual: <span className="font-medium text-foreground">{existingProgram.name}</span> ({existingProgram.exercises.length} ejercicios en {new Set(existingProgram.exercises.map(e => e.dayName)).size} días)
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Prompt */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                {mode === 'generate'
                                    ? '¿Qué programa necesitas?'
                                    : '¿Qué quieres cambiar o mejorar?'}
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    mode === 'generate'
                                        ? 'Ej: Rutina de 4 días torso-pierna, intermedio, énfasis en pecho y espalda…'
                                        : 'Ej: Quiero añadir más trabajo de bíceps en días de tirón y subir el volumen de hombros…'
                                }
                                className="min-h-[100px] resize-none"
                                maxLength={800}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault()
                                        handleGenerate()
                                    }
                                }}
                            />
                            <p className="text-xs text-muted-foreground text-right">{prompt.length}/800</p>
                        </div>

                        {/* Example prompts */}
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ejemplos</p>
                            <div className="flex flex-wrap gap-2">
                                {examples.map((ex) => (
                                    <button
                                        key={ex}
                                        type="button"
                                        onClick={() => setPrompt(ex)}
                                        className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors"
                                    >
                                        {ex}
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
                                {mode === 'generate' ? 'Generar programa' : 'Aplicar cambios'}
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
                            <p className="font-medium">
                                {mode === 'generate' ? 'Creando programa…' : 'Analizando y modificando…'}
                            </p>
                            <p className="text-sm text-muted-foreground">Esto puede tardar unos segundos</p>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && proposal && (
                    <div className="flex flex-col gap-4 overflow-y-auto flex-1">
                        <div className="flex-1 overflow-y-auto pr-1">
                            <ProposalPreview proposal={proposal} mode={mode} />
                        </div>

                        {/* Info about next step */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                            Al confirmar, irás al wizard para establecer semanas, asignar días de la semana y ajustar cualquier ejercicio manualmente.
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={() => { setStep('input'); setProposal(null) }}
                                className="gap-2"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Regenerar
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('input')}
                                >
                                    Volver
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    className="gap-2"
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Continuar con el wizard
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
