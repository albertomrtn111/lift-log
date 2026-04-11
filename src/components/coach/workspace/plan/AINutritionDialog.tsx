'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import {
    AlertCircle,
    CheckCircle2,
    ChevronRight,
    Loader2,
    Minus,
    RotateCcw,
    Scale,
    SlidersHorizontal,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
    Utensils,
    Wand2,
} from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useActiveMacroPlan, useUpsertMacroPlan } from '@/hooks/useMacroPlan'
import { useActiveDietPlan, useCreateDietPlan, useDietPlanStructure } from '@/hooks/useDietOptions'
import type { DietPlanWithStructure, MacroPlan } from '@/data/nutrition/types'
import type {
    AIDietProposal,
    AIMacrosProposal,
    AINutritionMode,
    AINutritionProposal,
} from '@/types/ai-nutrition'

type NutritionType = 'macros' | 'options_diet'
type Step = 'input' | 'loading' | 'preview'

interface AINutritionDialogProps {
    trigger?: React.ReactNode
    coachId: string
    clientId: string
    nutritionType: NutritionType
}

interface WeightEntry {
    date: string
    weight_kg: number
}

const OBJECTIVE_EXAMPLES = [
    'Bajar de peso',
    'Subir de peso',
    'Mantener peso',
    'Ganar masa muscular',
    'Definir sin perder músculo',
    'Mejorar adherencia',
]

const MODE_COPY: Record<
    NutritionType,
    Record<AINutritionMode, { title: string; description: string; placeholder: string; suggestions: string[] }>
> = {
    macros: {
        generate: {
            title: 'Generar macros',
            description: 'Crear una propuesta nueva de calorías y macronutrientes usando peso, contexto y objetivo.',
            placeholder:
                'Ej: atleta en fase de definición, quiero una propuesta base conservadora con proteína alta y un objetivo de pasos asumible…',
            suggestions: [
                'Nueva base para pérdida de grasa',
                'Pasar a mantenimiento',
                'Subir calorías para volumen controlado',
            ],
        },
        modify: {
            title: 'Modificar macros',
            description: 'Ajustar los macros actuales sin rehacerlos por completo salvo que el contexto lo requiera.',
            placeholder:
                'Ej: lleva dos semanas sin bajar, quiero reducir calorías ligeramente y subir proteína sin rehacer todo…',
            suggestions: [
                'Estancado dos semanas, ajuste pequeño',
                'La pérdida va demasiado rápida',
                'Bajar kcal y subir proteína',
            ],
        },
    },
    options_diet: {
        generate: {
            title: 'Generar dieta por opciones',
            description: 'Crear una dieta nueva por opciones apoyada en macros, contexto del atleta y objetivo.',
            placeholder:
                'Ej: quiero una dieta sencilla, alta en proteína, con opciones fáciles de preparar y buena adherencia…',
            suggestions: [
                'Crear dieta simple y adherente',
                'Más variedad con estructura clara',
                'Priorizar saciedad y practicidad',
            ],
        },
        modify: {
            title: 'Modificar dieta por opciones',
            description: 'Ajustar la dieta actual manteniendo estructura siempre que el cambio no requiera rehacerla.',
            placeholder:
                'Ej: mantén la estructura pero baja kcal, ajusta cantidades y sube saciedad en almuerzo y cena…',
            suggestions: [
                'Mantener estructura y bajar kcal',
                'Subir carbos en días activos',
                'Cambiar solo algunas comidas',
            ],
        },
    },
}

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

function ContextSummary({
    type,
    weightHistory,
    activeMacroPlan,
    activeDietName,
    hasDietStructure,
    isLoadingContext,
}: {
    type: NutritionType
    weightHistory: WeightEntry[]
    activeMacroPlan: MacroPlan | null | undefined
    activeDietName: string | null
    hasDietStructure: boolean
    isLoadingContext: boolean
}) {
    if (isLoadingContext) {
        return (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
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
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contexto que verá la IA
            </p>

            <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                    {trend ? (
                        trend.trend === 'up' ? (
                            <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
                        ) : trend.trend === 'down' ? (
                            <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
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

                <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                        {activeMacroPlan
                            ? `${activeMacroPlan.kcal} kcal | P:${activeMacroPlan.protein_g}g C:${activeMacroPlan.carbs_g}g G:${activeMacroPlan.fat_g}g`
                            : 'Sin macros activos'}
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">
                        {activeDietName
                            ? `${activeDietName}${hasDietStructure ? ' · estructura cargada' : ''}`
                            : 'Sin dieta por opciones activa'}
                    </span>
                </div>

                {weightHistory.length > 0 && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {weightHistory.length} registros de peso
                    </Badge>
                )}

                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {type === 'macros' ? 'Módulo IA Macros' : 'Módulo IA Dieta'}
                </Badge>
            </div>
        </div>
    )
}

function MacrosPreview({
    proposal,
    currentPlan,
}: {
    proposal: AIMacrosProposal
    currentPlan: MacroPlan | null | undefined
}) {
    const comparisonRows = currentPlan && !currentPlan.day_type_config
        ? [
            { label: 'Calorías', current: currentPlan.kcal, next: proposal.kcal, suffix: ' kcal' },
            { label: 'Proteínas', current: currentPlan.protein_g, next: proposal.protein_g, suffix: 'g' },
            { label: 'Carbohidratos', current: currentPlan.carbs_g, next: proposal.carbs_g, suffix: 'g' },
            { label: 'Grasas', current: currentPlan.fat_g, next: proposal.fat_g, suffix: 'g' },
        ]
        : []

    return (
        <div className="space-y-4">
            {proposal.mode === 'modify' && comparisonRows.length > 0 && (
                <Card className="border-border/60 bg-muted/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Comparativa con los macros actuales</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                        {comparisonRows.map((row) => {
                            const delta = row.next - row.current
                            return (
                                <div key={row.label} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{row.label}</span>
                                    <div className="flex items-center gap-2">
                                        <span>{row.current}{row.suffix}</span>
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="font-medium">{row.next}{row.suffix}</span>
                                        <Badge variant="outline" className="text-[10px]">
                                            {delta > 0 ? '+' : ''}{delta}{row.suffix}
                                        </Badge>
                                    </div>
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'Calorías', value: `${proposal.kcal} kcal`, color: 'text-orange-400' },
                    { label: 'Proteínas', value: `${proposal.protein_g}g`, color: 'text-blue-400' },
                    { label: 'Carbohidratos', value: `${proposal.carbs_g}g`, color: 'text-emerald-400' },
                    { label: 'Grasas', value: `${proposal.fat_g}g`, color: 'text-yellow-400' },
                ].map(({ label, value, color }) => (
                    <Card key={label} className="border-border/60">
                        <CardContent className="pt-3 pb-3 text-center">
                            <p className={cn('text-lg font-bold', color)}>{value}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {proposal.steps != null && (
                <div className="text-sm text-muted-foreground">
                    Pasos diarios: <span className="font-medium text-foreground">{proposal.steps.toLocaleString()}</span>
                </div>
            )}

            {proposal.change_summary.length > 0 && (
                <Card className="border-border/60">
                    <CardContent className="pt-3 pb-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Qué cambia</p>
                        <ul className="space-y-1.5">
                            {proposal.change_summary.map((item, index) => (
                                <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {proposal.notes && (
                <Card className="border-border/60 bg-muted/20">
                    <CardContent className="pt-3 pb-3">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Notas para el atleta</p>
                        <p className="text-sm">{proposal.notes}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-3 pb-3">
                    <p className="mb-1 text-xs font-medium text-primary">Razonamiento de la IA</p>
                    <p className="text-sm leading-relaxed">{proposal.explanation}</p>
                </CardContent>
            </Card>
        </div>
    )
}

function DietPreview({ proposal }: { proposal: AIDietProposal }) {
    const [expandedMeal, setExpandedMeal] = useState<number | null>(0)
    const strategyLabel = proposal.structure_strategy === 'maintain'
        ? 'Mantiene estructura'
        : proposal.structure_strategy === 'adjust'
            ? 'Ajusta estructura'
            : 'Rehace estructura'

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{proposal.name}</h3>
                <Badge variant="outline">{strategyLabel}</Badge>
            </div>

            {proposal.change_summary.length > 0 && (
                <Card className="border-border/60 bg-muted/20">
                    <CardContent className="pt-3 pb-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                            {proposal.mode === 'modify' ? 'Qué mantiene y qué cambia' : 'Claves de la propuesta'}
                        </p>
                        <ul className="space-y-1.5">
                            {proposal.change_summary.map((item, index) => (
                                <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-2">
                {proposal.meals.map((meal, mealIdx) => (
                    <Card key={`${meal.name}-${mealIdx}`} className="border-border/60">
                        <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setExpandedMeal(expandedMeal === mealIdx ? null : mealIdx)}
                        >
                            <CardHeader className="px-3 py-2">
                                <CardTitle className="flex items-center justify-between text-sm font-medium">
                                    <span className="flex items-center gap-2">
                                        <Utensils className="h-3.5 w-3.5 text-primary" />
                                        {meal.name}
                                    </span>
                                    <span className="text-xs font-normal text-muted-foreground">
                                        {meal.options.length} opción{meal.options.length !== 1 ? 'es' : ''}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                        </button>

                        {expandedMeal === mealIdx && (
                            <CardContent className="space-y-3 px-3 pb-3 pt-0">
                                {meal.options.map((option, optionIdx) => (
                                    <div key={`${option.name}-${optionIdx}`}>
                                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                                            {option.name}
                                            {option.notes && <span className="ml-1 font-normal">— {option.notes}</span>}
                                        </p>
                                        <ul className="space-y-0.5">
                                            {option.items.map((item, itemIdx) => (
                                                <li key={`${item.name}-${itemIdx}`} className="flex items-baseline gap-1 text-xs">
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
                    <p className="mb-1 text-xs font-medium text-primary">Razonamiento de la IA</p>
                    <p className="text-sm leading-relaxed">{proposal.explanation}</p>
                </CardContent>
            </Card>
        </div>
    )
}

export function AINutritionDialog({
    trigger,
    coachId,
    clientId,
    nutritionType,
}: AINutritionDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<Step>('input')
    const [mode, setMode] = useState<AINutritionMode>('generate')
    const [objective, setObjective] = useState('')
    const [prompt, setPrompt] = useState('')
    const [proposal, setProposal] = useState<AINutritionProposal | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isLoadingWeight, setIsLoadingWeight] = useState(false)
    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([])

    const { toast } = useToast()
    const { data: activeMacroPlan, isLoading: loadingMacros } = useActiveMacroPlan(coachId, clientId)
    const { data: activeDietPlan, isLoading: loadingDiet } = useActiveDietPlan(coachId, clientId)
    const { data: dietStructure } = useDietPlanStructure(activeDietPlan?.id ?? null)
    const upsertMacros = useUpsertMacroPlan(coachId, clientId)
    const createDiet = useCreateDietPlan(coachId, clientId)

    const isLoadingContext = loadingMacros || loadingDiet || isLoadingWeight
    const activeDietText = dietStructure ? dietStructureToText(dietStructure as DietPlanWithStructure) : null
    const hasCurrentBase = nutritionType === 'macros' ? !!activeMacroPlan : !!dietStructure
    const modeCopy = MODE_COPY[nutritionType][mode]
    const moduleTitle = nutritionType === 'macros' ? 'IA Macros' : 'IA Dieta'

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
                    data.map((entry: { metric_date: string; weight_kg: number }) => ({
                        date: entry.metric_date,
                        weight_kg: entry.weight_kg,
                    }))
                )
            }
        } catch (fetchError) {
            console.warn('[AINutritionDialog] Could not fetch weight history:', fetchError)
        } finally {
            setIsLoadingWeight(false)
        }
    }

    function resetDialog() {
        setStep('input')
        setMode('generate')
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
            const macroContext = activeMacroPlan
                ? {
                    kcal: activeMacroPlan.kcal,
                    protein_g: activeMacroPlan.protein_g,
                    carbs_g: activeMacroPlan.carbs_g,
                    fat_g: activeMacroPlan.fat_g,
                    steps: activeMacroPlan.steps ?? null,
                    notes: activeMacroPlan.notes ?? '',
                    day_type_config: activeMacroPlan.day_type_config ?? null,
                }
                : null

            const response = await fetch('/api/ai/generate-nutrition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId,
                    type: nutritionType,
                    mode,
                    objective: objective.trim(),
                    prompt: prompt.trim(),
                    context: {
                        weightHistory,
                        activeMacroPlan: macroContext,
                        activeDietPlanText: activeDietText,
                    },
                }),
            })

            const data = await response.json()
            if (!response.ok || data.error) {
                throw new Error(data.error ?? 'Error desconocido generando la propuesta.')
            }

            setProposal(data.proposal)
            setStep('preview')
        } catch (generationError: unknown) {
            const message = generationError instanceof Error
                ? generationError.message
                : 'Error inesperado. Inténtalo de nuevo.'
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
                        options: meal.options.map((option) => ({
                            name: option.name,
                            order_index: option.order_index,
                            notes: option.notes || '',
                            items: option.items.map((item) => ({
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
            toast({
                title: proposal.type === 'macros' ? 'Macros aplicados' : 'Dieta aplicada',
                description: proposal.mode === 'modify'
                    ? 'Se han guardado los ajustes propuestos por la IA.'
                    : 'Se ha guardado la propuesta generada por la IA.',
            })
        } catch {
            // Los hooks de mutación ya muestran el toast de error
        }
    }

    const isConfirming = upsertMacros.isPending || createDiet.isPending

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <AIActionButton>
                        {moduleTitle}
                    </AIActionButton>
                )}
            </DialogTrigger>

            <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        {moduleTitle}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'input' && 'Elige si quieres generar una propuesta nueva o modificar la base actual de este módulo.'}
                        {step === 'loading' && 'La IA está analizando el contexto nutricional del atleta…'}
                        {step === 'preview' && 'Revisa la propuesta antes de aplicarla. Puedes regenerarla o volver a editarla.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 'input' && (
                    <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
                        <ContextSummary
                            type={nutritionType}
                            weightHistory={weightHistory}
                            activeMacroPlan={activeMacroPlan}
                            activeDietName={activeDietPlan?.name ?? null}
                            hasDietStructure={!!dietStructure}
                            isLoadingContext={isLoadingContext}
                        />

                        <div className="space-y-2">
                            <label className="text-sm font-medium">¿Qué quieres hacer con la IA?</label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('generate')}
                                    className={cn(
                                        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                                        mode === 'generate'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <Wand2 className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Generar</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Crear una propuesta nueva con el contexto disponible.
                                        </p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setMode('modify')}
                                    disabled={!hasCurrentBase}
                                    className={cn(
                                        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                        mode === 'modify'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <SlidersHorizontal className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Modificar</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Ajustar la base actual sin regenerarla por completo.
                                        </p>
                                    </div>
                                </button>
                            </div>
                            {!hasCurrentBase && (
                                <p className="text-xs text-muted-foreground">
                                    Aún no existe una base actual en este módulo, así que por ahora solo puedes generar.
                                </p>
                            )}
                        </div>

                        <Card className="border-border/60 bg-card/70">
                            <CardContent className="space-y-2 pt-4 pb-4">
                                <div className="flex items-center gap-2">
                                    {nutritionType === 'macros' ? (
                                        <Scale className="h-4 w-4 text-primary" />
                                    ) : (
                                        <Utensils className="h-4 w-4 text-primary" />
                                    )}
                                    <p className="text-sm font-medium">{modeCopy.title}</p>
                                </div>
                                <p className="text-sm text-muted-foreground">{modeCopy.description}</p>
                            </CardContent>
                        </Card>

                        {mode === 'modify' && hasCurrentBase && (
                            <Card className="border-primary/20 bg-primary/5">
                                <CardContent className="pt-3 pb-3">
                                    <p className="mb-1 text-xs font-medium text-primary">Base actual que se usará para modificar</p>
                                    <p className="text-sm">
                                        {nutritionType === 'macros'
                                            ? 'La IA tomará los macros activos como punto de partida y propondrá ajustes comparables.'
                                            : 'La IA usará la dieta por opciones actual para mantener o ajustar su estructura según tu instrucción.'}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Objetivo nutricional
                                <span className="ml-1 text-xs font-normal text-muted-foreground">(qué quieres conseguir)</span>
                            </label>
                            <Input
                                value={objective}
                                onChange={(event) => setObjective(event.target.value)}
                                placeholder="Ej: bajar de peso, ganar masa muscular, mantenimiento…"
                                maxLength={200}
                            />
                            <div className="flex flex-wrap gap-1.5">
                                {OBJECTIVE_EXAMPLES.map((example) => (
                                    <button
                                        key={example}
                                        type="button"
                                        onClick={() => setObjective(example)}
                                        className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary/60 hover:bg-primary/5"
                                    >
                                        {example}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Ideas rápidas</label>
                            <div className="flex flex-wrap gap-1.5">
                                {modeCopy.suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => setPrompt(suggestion)}
                                        className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary/60 hover:bg-primary/5"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">
                                Instrucciones adicionales
                                <span className="ml-1 text-xs font-normal text-muted-foreground">(explica qué quieres hacer)</span>
                            </label>
                            <Textarea
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                placeholder={modeCopy.placeholder}
                                className="min-h-[90px] resize-none"
                                maxLength={800}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                        event.preventDefault()
                                        handleGenerate()
                                    }
                                }}
                            />
                            <p className="text-right text-xs text-muted-foreground">{prompt.length}/800</p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}

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
                                {mode === 'generate' ? 'Generar propuesta' : 'Proponer ajuste'}
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
                            <p className="font-medium">Analizando contexto…</p>
                            <p className="text-sm text-muted-foreground">
                                {mode === 'generate'
                                    ? 'La IA está construyendo una propuesta nueva con el contexto disponible'
                                    : 'La IA está revisando la base actual para proponer un ajuste real'}
                            </p>
                        </div>
                    </div>
                )}

                {step === 'preview' && proposal && (
                    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
                        <div className="flex-1 overflow-y-auto pr-1">
                            {proposal.type === 'macros' ? (
                                <MacrosPreview proposal={proposal} currentPlan={activeMacroPlan} />
                            ) : (
                                <DietPreview proposal={proposal} />
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
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
                                    {isConfirming
                                        ? 'Guardando…'
                                        : proposal.type === 'macros'
                                            ? 'Aplicar macros'
                                            : 'Aplicar dieta'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
