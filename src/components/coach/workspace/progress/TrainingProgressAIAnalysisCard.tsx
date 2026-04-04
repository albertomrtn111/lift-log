'use client'

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, CheckCircle2, MessageSquareQuote } from 'lucide-react'
import type { TrainingProgressAIAnalysis } from '@/lib/ai/analyze-training-progress'

interface TrainingProgressAIAnalysisCardProps {
    analysis: TrainingProgressAIAnalysis
    coachInstruction: string
    generatedAt: string
    isRegenerating?: boolean
    onRegenerate: () => void
}

export function TrainingProgressAIAnalysisCard({
    analysis,
    coachInstruction,
    generatedAt,
    isRegenerating = false,
    onRegenerate,
}: TrainingProgressAIAnalysisCardProps) {
    return (
        <Card className="border-primary/15 bg-gradient-to-br from-background to-primary/5">
            <CardContent className="p-5 space-y-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/15">
                                <Sparkles className="mr-1 h-3 w-3" />
                                Análisis IA del progreso
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                Generado {new Date(generatedAt).toLocaleString('es-ES')}
                            </span>
                        </div>
                        <h3 className="text-lg font-semibold">Lectura inteligente del entrenamiento</h3>
                        <p className="text-sm text-muted-foreground">
                            Interpretación del bloque y de la evolución por ejercicio para acelerar la toma de decisiones del coach.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRegenerate}
                        disabled={isRegenerating}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                        Regenerar
                    </Button>
                </div>

                {coachInstruction.trim() && (
                    <div className="rounded-xl border bg-background/80 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium mb-1">
                            <MessageSquareQuote className="h-4 w-4 text-primary" />
                            Instrucción del coach
                        </div>
                        <p className="text-sm text-muted-foreground">{coachInstruction}</p>
                    </div>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="space-y-4">
                        <Section title="Resumen general" content={analysis.overall_summary} />
                        <Section title="Lectura del bloque" content={analysis.block_read} />
                        {analysis.instruction_response && (
                            <Section title="Respuesta al foco del coach" content={analysis.instruction_response} />
                        )}
                    </div>

                    <div className="space-y-4">
                        <ExerciseList
                            title="Ejercicios con progresión clara"
                            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                            items={analysis.progressed_exercises}
                            emptyLabel="No se detectaron progresiones claras o faltan datos para afirmarlo."
                            tone="emerald"
                        />
                        <ExerciseList
                            title="Ejercicios a vigilar"
                            icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                            items={analysis.stalled_exercises}
                            emptyLabel="No se identifican estancamientos especialmente marcados."
                            tone="amber"
                        />
                    </div>
                </div>

                <Separator />

                <div className="grid gap-4 xl:grid-cols-2">
                    <StringList
                        title="Hallazgos relevantes"
                        icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
                        items={analysis.key_findings}
                        emptyLabel="Sin hallazgos adicionales."
                    />
                    <StringList
                        title="Señales o inconsistencias"
                        icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                        items={analysis.warnings_or_inconsistencies}
                        emptyLabel="Sin señales preocupantes destacadas."
                    />
                </div>

                <StringList
                    title="Recomendaciones para decidir"
                    icon={<Sparkles className="h-4 w-4 text-primary" />}
                    items={analysis.recommendations}
                    emptyLabel="La IA no propuso ajustes concretos en esta ejecución."
                />
            </CardContent>
        </Card>
    )
}

function Section({ title, content }: { title: string; content: string }) {
    return (
        <div className="rounded-xl border bg-background/80 p-4">
            <div className="text-sm font-semibold mb-2">{title}</div>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{content || 'Sin contenido.'}</p>
        </div>
    )
}

function ExerciseList({
    title,
    icon,
    items,
    emptyLabel,
    tone,
}: {
    title: string
    icon: ReactNode
    items: Array<{ exercise: string; insight: string }>
    emptyLabel: string
    tone: 'emerald' | 'amber'
}) {
    const toneClass = tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20'
        : 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20'

    return (
        <div className={`rounded-xl border p-4 ${toneClass}`}>
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                {icon}
                {title}
            </div>
            <div className="space-y-3">
                {items.length > 0 ? items.map((item) => (
                    <div key={`${item.exercise}-${item.insight}`} className="rounded-lg bg-background/75 p-3">
                        <p className="text-sm font-medium">{item.exercise}</p>
                        <p className="text-sm text-muted-foreground mt-1">{item.insight}</p>
                    </div>
                )) : (
                    <p className="text-sm text-muted-foreground">{emptyLabel}</p>
                )}
            </div>
        </div>
    )
}

function StringList({
    title,
    icon,
    items,
    emptyLabel,
}: {
    title: string
    icon: ReactNode
    items: string[]
    emptyLabel: string
}) {
    return (
        <div className="rounded-xl border bg-background/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                {icon}
                {title}
            </div>
            {items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item} className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                            {item}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            )}
        </div>
    )
}
