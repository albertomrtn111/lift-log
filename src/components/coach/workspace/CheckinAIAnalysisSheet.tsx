'use client'

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Review, AICheckinAnalysis } from '@/data/workspace'
import { Loader2, Sparkles, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function getReviewAIStatus(review: Review | null | undefined) {
    return review?.ai_status ?? 'idle'
}

export function getParsedAIAnalysis(review: Review | null | undefined): AICheckinAnalysis | null {
    const analysis = review?.analysis
    if (!analysis || typeof analysis !== 'object') return null

    const candidate = analysis as Partial<AICheckinAnalysis>
    if (typeof candidate.overall_summary !== 'string') return null

    return {
        overall_summary: candidate.overall_summary ?? '',
        body_metrics_summary: candidate.body_metrics_summary ?? '',
        weight_trend_analysis: candidate.weight_trend_analysis ?? '',
        training_analysis: candidate.training_analysis ?? '',
        cardio_analysis: candidate.cardio_analysis ?? '',
        nutrition_analysis: candidate.nutrition_analysis ?? '',
        adherence_analysis: candidate.adherence_analysis ?? '',
        coach_recommendations: Array.isArray(candidate.coach_recommendations) ? candidate.coach_recommendations : [],
        suggested_changes: Array.isArray(candidate.suggested_changes) ? candidate.suggested_changes : [],
        warnings_or_flags: Array.isArray(candidate.warnings_or_flags) ? candidate.warnings_or_flags : [],
    }
}

function AIStatusBadge({ review }: { review: Review | null | undefined }) {
    const status = getReviewAIStatus(review)
    const meta = {
        idle: {
            label: 'Sin generar',
            className: 'bg-muted/60 text-muted-foreground border-border',
            icon: Sparkles,
        },
        pending: {
            label: 'Generando',
            className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
            icon: Loader2,
        },
        completed: {
            label: 'Disponible',
            className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
            icon: CheckCircle2,
        },
        failed: {
            label: 'Error',
            className: 'bg-destructive/10 text-destructive border-destructive/20',
            icon: AlertTriangle,
        },
    }[status]

    const Icon = meta.icon

    return (
        <Badge variant="outline" className={cn('gap-1.5', meta.className)}>
            <Icon className={cn('h-3.5 w-3.5', status === 'pending' && 'animate-spin')} />
            {meta.label}
        </Badge>
    )
}

function TextSection({
    title,
    content,
}: {
    title: string
    content?: string | null
}) {
    if (!content) return null

    return (
        <section className="space-y-1.5">
            <h4 className="text-sm font-medium text-foreground">{title}</h4>
            <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{content}</p>
        </section>
    )
}

function ListSection({
    title,
    items,
    tone = 'default',
}: {
    title: string
    items: string[]
    tone?: 'default' | 'warning'
}) {
    if (items.length === 0) return null

    return (
        <section className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">{title}</h4>
            <div className="space-y-2">
                {items.map((item, index) => (
                    <div
                        key={`${title}-${index}`}
                        className={cn(
                            'rounded-lg border px-3 py-2 text-sm leading-5',
                            tone === 'warning'
                                ? 'border-amber-500/20 bg-amber-500/5 text-amber-700'
                                : 'border-border bg-muted/30 text-muted-foreground'
                        )}
                    >
                        {item}
                    </div>
                ))}
            </div>
        </section>
    )
}

interface CheckinAIAnalysisSheetProps {
    review: Review | null | undefined
    open: boolean
    onOpenChange: (open: boolean) => void
    onRegenerate?: () => void
    regenerating?: boolean
}

export function CheckinAIAnalysisSheet({
    review,
    open,
    onOpenChange,
    onRegenerate,
    regenerating = false,
}: CheckinAIAnalysisSheetProps) {
    const analysis = getParsedAIAnalysis(review)
    const status = getReviewAIStatus(review)

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                <SheetHeader>
                    <div className="flex items-center gap-2">
                        <SheetTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-primary" />
                            Asistente IA del coach
                        </SheetTitle>
                        <AIStatusBadge review={review} />
                    </div>
                    <SheetDescription>
                        Resumen estructurado de la revisión para acelerar el trabajo del entrenador.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                    {status === 'pending' && (
                        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-700">
                            <div className="flex items-center gap-2 font-medium">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generando análisis IA
                            </div>
                            <p className="mt-2 text-blue-700/90">
                                La revisión ya está guardada. El assistant está preparando el resumen y las propuestas para el coach.
                            </p>
                        </div>
                    )}

                    {status === 'failed' && (
                        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                            <div className="flex items-center gap-2 font-medium">
                                <AlertTriangle className="h-4 w-4" />
                                No se pudo generar el análisis IA
                            </div>
                            <p className="mt-2 whitespace-pre-wrap">
                                {review?.ai_error || 'Se produjo un error desconocido.'}
                            </p>
                        </div>
                    )}

                    {analysis && (
                        <>
                            <section className="rounded-xl border bg-card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-medium uppercase tracking-wide text-primary">
                                            Resumen ejecutivo
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-foreground">
                                            {review?.ai_summary || analysis.overall_summary}
                                        </p>
                                    </div>
                                    {review?.ai_generated_at && (
                                        <p className="shrink-0 text-xs text-muted-foreground">
                                            {new Date(review.ai_generated_at).toLocaleString('es-ES')}
                                        </p>
                                    )}
                                </div>
                            </section>

                            <TextSection title="Métricas corporales" content={analysis.body_metrics_summary} />
                            <TextSection title="Tendencia de peso" content={analysis.weight_trend_analysis} />
                            <TextSection title="Entrenamiento" content={analysis.training_analysis} />
                            <TextSection title="Cardio y actividad" content={analysis.cardio_analysis} />
                            <TextSection title="Nutrición" content={analysis.nutrition_analysis} />
                            <TextSection title="Adherencia global" content={analysis.adherence_analysis} />

                            <ListSection title="Recomendaciones para el coach" items={analysis.coach_recommendations} />
                            <ListSection title="Cambios sugeridos" items={analysis.suggested_changes} />
                            <ListSection title="Alertas o puntos a vigilar" items={analysis.warnings_or_flags} tone="warning" />
                        </>
                    )}

                    {!analysis && status === 'idle' && (
                        <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                            Esta revisión todavía no tiene análisis IA generado.
                        </div>
                    )}

                    {onRegenerate && (
                        <div className="pt-2">
                            <Button variant="outline" onClick={onRegenerate} disabled={regenerating} className="gap-2">
                                {regenerating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4" />
                                )}
                                Regenerar análisis IA
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
