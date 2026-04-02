'use client'

import { useState } from 'react'
import { format } from 'date-fns'
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
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Sparkles,
    Loader2,
    Target,
    Utensils,
    RotateCcw,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useActiveMacroPlan, useUpsertMacroPlan } from '@/hooks/useMacroPlan'
import { useActiveDietPlan, useCreateDietPlan, useDietPlanStructure } from '@/hooks/useDietOptions'
import type { MacroPlan, DietPlanWithStructure } from '@/data/nutrition/types'
import type { AIMacrosProposal, AIDietProposal, AINutritionProposal } from '@/app/api/ai/generate-nutrition/route'

// ============================================================================
// Types
// ============================================================================

type NutritionType = 'macros' | 'options_diet'
type Step = 'input' | 'loading' | 'preview'

interface AINutritionDialogProps {
    trigger?: React.ReactNode
    coachId: string
    clientId: string
    defaultType?: NutritionType
}

interface WeightEntry {
    date: string
    weight_kg: number
}

// ============================================================================
// Helpers
// ============================================================================

function dietStructureToText(plan: DietPlanWithStructure): string {
    const lines: string[] = [`Nombre del plan: ${plan.name}`]
    for (const meal of plan.meals) {
        lines.push(`\n${meal.name} (${meal.day_type}):`)
        for (const option of meal.options) {
            lines.push(`  ${option.name}${option.notes ? ` — ${option.notes}` : ''}:`)
            for (const item of option.items) {
                const qty = item.quantity_value != null
                    ? ` (${item.quantity_value}${item.quantity_unit ?? ''})`
                    : ''
                lines.push(`    • ${item.name}${qty}${item.notes ? ` — ${item.notes}` : ''}`)
            }
        }
    }
    return lines.join('\n')
}

function calcWeightTrend(history: WeightEntry[]): { trend: 'up' | 'down' | 'stable'; diff: number } | null {
    if (history.length < 2) return null
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    const diff = sorted[sorted.length - 1].weight_kg - sorted[0].weight_kg
    return {
        trend: diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'stable',
        diff,
    }
}

// ============================================================================
// Context summary card
// ============================================================================

function ContextSummary({
    weightHistory,
    activeMacroPlan,
    isLoadingContext,
}: {
    weightHistory: WeightEntry[]
    activeMacroPlan: MacroPlan | null | undefined
    isLoadingContext: boolean
}) {
    if (isLoadingContext) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Cargando contexto del atleta…
            </div>
        )
    }

    const trend = calcWeightTrend(weightHistory)
    const latestWeight = weightHistory.length > 0
        ? [...weightHistory].sort((a, b) => b.date.localeCompare(a.date))[0]
        : null

    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contexto que verá la IA
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
                {/* Weight */}
                <div className="flex items-center gap-1.5">
                    {trend ? (
                        trend.trend === 'up' ? (
                            <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
                        ) : trend.trend === 'down' ? (
                            <TrendingDown className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                            <Minus className="h-3.5 w-3.5 text-blue-400" />
                        )
                    ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">
                        {latestWeight
                            ? `${latestWeight.weight_kg} kg${trend ? ` (${trend.diff > 0 ? '+' : ''}${trend.diff.toFixed(1)} kg tendencia)` : ''}`
                            : 'Sin datos de peso'}
                    </span>
                </div>

                {/* Macros */}
                <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                        {activeMacroPlan
                            ? `${activeMacroPlan.kcal} kcal | P:${activeMacroPlan.protein_g}g C:${activeMacroPlan.carbs_g}g G:${activeMacroPlan.fat_g}g`
                            : 'Sin macros activos'}
                    </span>
                </div>

                {/* Weight count */}
                {weightHistory.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {weightHistory.length} registros de peso
                    </Badge>
                )}
            </div>
        </div>
    )
}

// ============================================================================
// Preview: Macros
// ============================================================================

function MacrosPreview({ proposal }: { proposal: AIMacrosProposal }) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'Calorías', value: `${proposal.kcal} kcal`, color: 'text-orange-400' },
                    { label: 'Proteínas', value: `${proposal.protein_g}g`, color: 'text-blue-400' },
                    { label: 'Carbohidratos', value: `${proposal.carbs_g}g`, color: 'text-green-400' },
                    { label: 'Grasas', value: `${proposal.fat_g}g`, color: 'text-yellow-400' },
                ].map(({ label, value, color }) => (
                    <Card key={label} className="border-border/60">
                        <CardContent className="pt-3 pb-3 text-center">
                            <p className={cn('text-lg font-bold', color)}>{value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {proposal.steps != null && (
                <div className="text-sm text-muted-foreground">
                    Pasos diarios: <span className="font-medium text-foreground">{proposal.steps.toLocaleString()}</span>
                </div>
            )}

            {proposal.notes && (
                <Card className="border-border/60 bg-muted/20">
                    <CardContent className="pt-3 pb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Notas para el atleta</p>
                        <p className="text-sm">{proposal.notes}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-3 pb-3">
                    <p className="text-xs font-medium text-primary mb-1">Razonamiento de la IA</p>
                    <p className="text-sm leading-relaxed">{proposal.explanation}</p>
                </CardContent>
            </Card>
        </div>
    )
}

// ============================================================================
// Preview: Options Diet
// ============================================================================

function DietPreview({ proposal }: { proposal: AIDietProposal }) {
    const [expandedMeal, setExpandedMeal] = useState<number | null>(0)

    return (
        <div className="space-y-4">
            <div>
                <h3 className="font-semibold">{proposal.name}</h3>
            </div>

            <div className="space-y-2">
                {proposal.meals.map((meal, mealIdx) => (
                    <Card key={mealIdx} className="border-border/60">
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setExpandedMeal(expandedMeal === mealIdx ? null : mealIdx)}
                        >
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-sm font-medium flex items-center justify-between">
                                    <span className="flex items-center gap-2">
                                        <Utensils className="h-3.5 w-3.5 text-primary" />
                                        {meal.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-normal">
                                        {meal.options.length} opción{meal.options.length !== 1 ? 'es' : ''}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                        </button>

                        {expandedMeal === mealIdx && (
                            <CardContent className="px-3 pb-3 pt-0 space-y-3">
                                {meal.options.map((option, optIdx) => (
                                    <div key={optIdx}>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">
                                            {option.name}
                                            {option.notes && <span className="ml-1 font-normal">— {option.notes}</span>}
                                        </p>
                                        <ul className="space-y-0.5">
                                            {option.items.map((item, itemIdx) => (
                                                <li key={itemIdx} className="text-xs flex items-baseline gap-1">
                                                    <span className="text-muted-foreground">•</span>
                                                    <span>{item.name}</span>
                                                    {item.quantity_value != null && (
                                                        <span className="text-muted-foreground">
                                                            ({item.quantity_value}{item.quantity_unit ?? ''})
                                                        </span>
                                                    )}
                                                    {item.notes && (
                                                        <span className="text-muted-foreground">— {item.notes}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-3 pb-3">
                    <p className="text-xs font-medium text-primary mb-1">Razonamiento de la IA</p>
                    <p className="text-sm leading-relaxed">{proposal.explanation}</p>
                </CardContent>
            </Card>
        </div>
    )
}

// ============================================================================
// Objective examples
// ============================================================================

const OBJECTIVE_EXAMPLES = [
    'Bajar de peso', 'Subir de peso', 'Mantener peso',
    'Ganar masa muscular', 'Definir sin perder músculo', 'Mejorar adherencia',
]

// ============================================================================
// Main component
// ============================================================================

export function AINutritionDialog({ trigger, coachId, clientId, defaultType = 'macros' }: AINutritionDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [type, setType] = useState<NutritionType>(defaultType)
    const [objective, setObjective] = useState('')
    const [prompt, setPrompt] = useState('')
    const [proposal, setProposal] = useState<AINutritionProposal | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isLoadingWeight, setIsLoadingWeight] = useState(false)
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([])

    const { toast } = useToast()

    // Existing nutrition data hooks
    const { data: activeMacroPlan, isLoading: loadingMacros } = useActiveMacroPlan(coachId, clientId)
    const { data: activeDietPlan, isLoading: loadingDiet } = useActiveDietPlan(coachId, clientId)
    const { data: dietStructure } = useDietPlanStructure(activeDietPlan?.id ?? null)

    // Mutation hooks
    const upsertMacros = useUpsertMacroPlan(coachId, clientId)
    const createDiet = useCreateDietPlan(coachId, clientId)

    const isLoadingContext = loadingMacros || loadingDiet || isLoadingWeight

    // Fetch weight history when dialog opens
    async function fetchWeightHistory() {
        setIsLoadingWeight(true)
        try {
            const supabase = createClient()
            const { data } = await supabase
                .from('client_metrics')
                .select('metric_date, weight_kg')
                .eq('client_id', clientId)
                .not('weight_kg', 'is', null)
                .order('metric_date', { ascending: false })
                .limit(20)

            if (data) {
                setWeightHistory(
                    data.map((d: { metric_date: string; weight_kg: number }) => ({
                        date: d.metric_date,
                        weight_kg: d.weight_kg,
                    }))
                )
            }
        } catch (e) {
            console.warn('Could not fetch weight history:', e)
        } finally {
            setIsLoadingWeight(false)
        }
    }

    function resetDialog() {
        setStep('input')
        setObjective('')
        setPrompt('')
        setProposal(null)
        setError(null)
    }

    function handleOpenChange(value: boolean) {
        setOpen(value)
        if (value) {
            fetchWeightHistory()
        } else {
            resetDialog()
        }
    }

    async function handleGenerate() {
        if (!objective.trim() || !prompt.trim()) return
        setError(null)
        setIsGenerating(true)
        setStep('loading')

        try {
            // Build context for the API
            const activeDietText = dietStructure
                ? dietStructureToText(dietStructure as DietPlanWithStructure)
                : null

            const macroContext = activeMacroPlan ? {
                kcal: activeMacroPlan.kcal,
                protein_g: activeMacroPlan.protein_g,
                carbs_g: activeMacroPlan.carbs_g,
                fat_g: activeMacroPlan.fat_g,
                steps: activeMacroPlan.steps ?? null,
                notes: activeMacroPlan.notes ?? '',
                day_type_config: activeMacroPlan.day_type_config ?? null,
            } : null

            const res = await fetch('/api/ai/generate-nutrition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    objective: objective.trim(),
                    prompt: prompt.trim(),
                    context: {
                        weightHistory,
                        activeMacroPlan: macroContext,
                        activeDietPlanText: activeDietText,
                    },
                }),
            })

            const data = await res.json()

            if (!res.ok || data.error) {
                throw new Error(data.error ?? 'Error desconocido generando la propuesta.')
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

    function handleRegenerate() {
        setProposal(null)
        setError(null)
        handleGenerate()
    }

    async function handleConfirm() {
        if (!proposal) return

        try {
            if (proposal.type === 'macros') {
                await upsertMacros.mutateAsync({
                    kcal: proposal.kcal,
                    protein_g: proposal.protein_g,
                    carbs_g: proposal.carbs_g,
                    fat_g: proposal.fat_g,
                    steps: proposal.steps ?? null,
                    notes: proposal.notes || '',
                    effective_from: format(new Date(), 'yyyy-MM-dd'),
                })
            } else {
                await createDiet.mutateAsync({
                    name: proposal.name,
                    type: 'options',
                    status: 'active',
                    effective_from: format(new Date(), 'yyyy-MM-dd'),
                    meals: proposal.meals.map((meal) => ({
                        day_type: meal.day_type,
                        name: meal.name,
                        order_index: meal.order_index,
                        options: meal.options.map((opt) => ({
                            name: opt.name,
                            order_index: opt.order_index,
                            notes: opt.notes || '',
                            items: opt.items.map((item) => ({
                                item_type: item.item_type,
                                name: item.name,
                                quantity_value: item.quantity_value ?? null,
                                quantity_unit: item.quantity_unit ?? null,
                                notes: item.notes || '',
                                order_index: item.order_index,
                            })),
                        })),
                    })),
                })
            }

            setOpen(false)
            resetDialog()
        } catch {
            // Toast is already shown by the mutation hooks
        }
    }

    const isConfirming = upsertMacros.isPending || createDiet.isPending

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
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
                        Asistente de Nutrición IA
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input' && 'La IA analizará el contexto del atleta y generará una propuesta revisable.'}
                        {step === 'loading' && 'Analizando contexto y generando propuesta nutricional…'}
                        {step === 'preview' && 'Revisa la propuesta antes de aplicarla. Puedes regenerarla o volver a editarla.'}
                    </DialogDescription>
                </DialogHeader>

                {/* ── Step: Input ── */}
                {step === 'input' && (
                    <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">
                        {/* Context summary */}
                        <ContextSummary
                            weightHistory={weightHistory}
                            activeMacroPlan={activeMacroPlan}
                            isLoadingContext={isLoadingContext}
                        />

                        {/* Type selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">¿Qué quieres generar?</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setType('macros')}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                        type === 'macros'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <Target className="h-4 w-4" />
                                    Macros / Calorías
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('options_diet')}
                                    className={cn(
                                        'flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                                        type === 'options_diet'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <Utensils className="h-4 w-4" />
                                    Dieta por Opciones
                                </button>
                            </div>
                        </div>

                        {/* Objective */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Objetivo nutricional
                                <span className="ml-1 text-xs text-muted-foreground font-normal">(¿qué quieres conseguir?)</span>
                            </label>
                            <Input
                                value={objective}
                                onChange={(e) => setObjective(e.target.value)}
                                placeholder="Ej: bajar de peso, ganar masa muscular, mantener peso…"
                                maxLength={200}
                            />
                            <div className="flex flex-wrap gap-1.5">
                                {OBJECTIVE_EXAMPLES.map((ex) => (
                                    <button
                                        key={ex}
                                        type="button"
                                        onClick={() => setObjective(ex)}
                                        className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors"
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Prompt */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Instrucciones adicionales
                                <span className="ml-1 text-xs text-muted-foreground font-normal">(explica qué quieres hacer)</span>
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={
                                    type === 'macros'
                                        ? 'Ej: lleva dos semanas sin bajar, quiero reducir calorías ligeramente y subir proteína…'
                                        : 'Ej: quiero una dieta sencilla, alta en proteína, con opciones fáciles de preparar y variadas…'
                                }
                                className="min-h-[90px] resize-none"
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
                                disabled={!objective.trim() || !prompt.trim() || isGenerating}
                                className="gap-2"
                            >
                                <Sparkles className="h-4 w-4" />
                                Generar propuesta
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
                            <p className="font-medium">Analizando contexto…</p>
                            <p className="text-sm text-muted-foreground">
                                La IA está revisando peso, macros y dieta actual
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Step: Preview ── */}
                {step === 'preview' && proposal && (
                    <div className="flex flex-col gap-4 overflow-y-auto flex-1">
                        <div className="flex-1 overflow-y-auto pr-1">
                            {proposal.type === 'macros' ? (
                                <MacrosPreview proposal={proposal} />
                            ) : (
                                <DietPreview proposal={proposal} />
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                            <Button
                                variant="outline"
                                onClick={handleRegenerate}
                                disabled={isConfirming}
                                className="gap-2"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Regenerar
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep('input')}
                                    disabled={isConfirming}
                                >
                                    Volver
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={isConfirming}
                                    className="gap-2"
                                >
                                    {isConfirming ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                    )}
                                    {isConfirming ? 'Guardando…' : 'Confirmar y aplicar'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
