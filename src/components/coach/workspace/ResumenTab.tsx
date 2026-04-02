'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ClientStatus, CheckinWithReview, MacroPlan, TrainingProgram } from '@/data/workspace'
import { approveReviewAction, forceAdvanceCheckinAction, regenerateReviewAIAction } from './actions'
import { useToast } from '@/hooks/use-toast'
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Clock,
    Dumbbell,
    Apple,
    FileText,
    ArrowRight,
    CheckCheck,
    FastForward,
    Loader2,
    Sparkles,
} from 'lucide-react'
import { MetricDefinition } from '@/types/metrics'
import { cn } from '@/lib/utils'
import {
    CheckinAIAnalysisSheet,
    getParsedAIAnalysis,
    getReviewAIStatus,
} from './CheckinAIAnalysisSheet'

interface ResumenTabProps {
    coachId: string
    clientId: string
    clientStatus: ClientStatus | null
    latestCheckin: CheckinWithReview | null
    activeMacroPlan: MacroPlan | null
    activeProgram: TrainingProgram | null
    onRefresh: () => void
    onSwitchTab: (tab: string) => void
    metricDefinitions: MetricDefinition[]
    previousCheckin?: CheckinWithReview | null
}

export function ResumenTab({
    coachId,
    clientId,
    clientStatus,
    latestCheckin,
    activeMacroPlan,
    activeProgram,
    onRefresh,
    onSwitchTab,
    metricDefinitions,
    previousCheckin,
}: ResumenTabProps) {
    return (
        <div className="space-y-6">
            {/* Status Card */}
            <StatusCard status={clientStatus} latestCheckin={latestCheckin} clientId={clientId} onRefresh={onRefresh} />

            {/* Latest Review Card */}
            <ReviewCard
                coachId={coachId}
                checkin={latestCheckin}
                onRefresh={onRefresh}
                onSwitchTab={onSwitchTab}
                metricDefinitions={metricDefinitions}
                previousCheckin={previousCheckin ?? null}
            />

            {/* Active Plans Mini */}
            <div className="grid sm:grid-cols-2 gap-4">
                <ActivePlanCard
                    title="Plan nutricional"
                    icon={Apple}
                    hasData={!!activeMacroPlan}
                    content={
                        activeMacroPlan ? (() => {
                            // Parsear day_type_config si es string
                            let cfg = activeMacroPlan.day_type_config as any
                            if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { cfg = null } }
                            
                            if (cfg) {
                                return (
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-medium">Entreno</p>
                                        <p className="font-medium">{cfg.training.kcal} kcal</p>
                                        <p className="text-sm text-muted-foreground">
                                            P{cfg.training.protein_g}g · C{cfg.training.carbs_g}g · G{cfg.training.fat_g}g
                                        </p>
                                        <p className="text-xs text-muted-foreground font-medium pt-1">Descanso</p>
                                        <p className="font-medium">{cfg.rest.kcal} kcal</p>
                                        <p className="text-sm text-muted-foreground">
                                            P{cfg.rest.protein_g}g · C{cfg.rest.carbs_g}g · G{cfg.rest.fat_g}g
                                        </p>
                                        {activeMacroPlan.steps && (
                                            <p className="text-xs text-muted-foreground">{activeMacroPlan.steps.toLocaleString()} pasos/día</p>
                                        )}
                                    </div>
                                )
                            }
                            return (
                                <div className="space-y-1">
                                    <p className="font-medium">{activeMacroPlan.kcal} kcal</p>
                                    <p className="text-sm text-muted-foreground">
                                        P{activeMacroPlan.protein_g}g · C{activeMacroPlan.carbs_g}g · G{activeMacroPlan.fat_g}g
                                    </p>
                                    {activeMacroPlan.steps && (
                                        <p className="text-xs text-muted-foreground">{activeMacroPlan.steps.toLocaleString()} pasos/día</p>
                                    )}
                                </div>
                            )
                        })() : null
                    }
                    onView={() => onSwitchTab('diet')}
                />
                <ActivePlanCard
                    title="Programa entrenamiento"
                    icon={Dumbbell}
                    hasData={!!activeProgram}
                    content={
                        activeProgram ? (
                            <div className="space-y-1">
                                <p className="font-medium">{activeProgram.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {activeProgram.total_weeks} semanas
                                </p>
                                <Badge variant="secondary" className="mt-1">
                                    {activeProgram.status === 'active' ? 'Activo' : activeProgram.status}
                                </Badge>
                            </div>
                        ) : null
                    }
                    onView={() => onSwitchTab('progreso')}
                />
            </div>
        </div>
    )
}

function StatusCard({
    status,
    latestCheckin,
    clientId,
    onRefresh,
}: {
    status: ClientStatus | null
    latestCheckin: CheckinWithReview | null
    clientId: string
    onRefresh: () => void
}) {
    if (!status) {
        return (
            <Card className="p-6 text-center text-muted-foreground">
                Cargando estado del cliente...
            </Card>
        )
    }

    const StatusIcon = {
        ok: CheckCircle,
        warning: AlertTriangle,
        risk: XCircle,
    }[status.statusLevel]

    const statusColors = {
        ok: 'text-success',
        warning: 'text-warning',
        risk: 'text-destructive',
    }

    const statusLabels = {
        ok: 'Todo en orden',
        warning: 'Requiere atención',
        risk: 'En riesgo',
    }

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Estado
                </h3>
                <div className={cn('flex items-center gap-2', statusColors[status.statusLevel])}>
                    <StatusIcon className="h-5 w-5" />
                    <span className="font-medium">{statusLabels[status.statusLevel]}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Último check-in</p>
                    <p className="font-medium">
                        {status.lastCheckinDate || 'Sin check-ins'}
                    </p>
                    {status.daysSinceCheckin !== null && (
                        <p className="text-xs text-muted-foreground">hace {status.daysSinceCheckin}d</p>
                    )}
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Próximo check-in</p>
                    <p className="font-medium">{status.nextCheckinDate}</p>
                    <p className={cn(
                        'text-xs',
                        status.daysUntilCheckin < 0 && 'text-destructive',
                        status.daysUntilCheckin === 0 && 'text-warning',
                    )}>
                        {status.daysUntilCheckin < 0
                            ? `Atrasado ${Math.abs(status.daysUntilCheckin)}d`
                            : status.daysUntilCheckin === 0
                                ? 'Hoy'
                                : `En ${status.daysUntilCheckin}d`}
                    </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Adherencia entreno</p>
                    <p className={cn(
                        'font-medium',
                        status.trainingAdherence !== null && status.trainingAdherence < 60 && 'text-destructive'
                    )}>
                        {status.trainingAdherence !== null ? `${status.trainingAdherence}%` : '—'}
                    </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Adherencia nutrición</p>
                    <p className={cn(
                        'font-medium',
                        status.nutritionAdherence !== null && status.nutritionAdherence < 60 && 'text-destructive'
                    )}>
                        {status.nutritionAdherence !== null ? `${status.nutritionAdherence}%` : '—'}
                    </p>
                </div>
            </div>

            {status.daysUntilCheckin < 0 && (
                <ActionSection
                    latestCheckin={latestCheckin}
                    clientId={clientId}
                    onRefresh={onRefresh}
                />
            )}
        </Card>
    )
}

function ActionSection({
    latestCheckin,
    clientId,
    onRefresh,
}: {
    latestCheckin: CheckinWithReview | null
    clientId: string
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()

    const hasReview = !!latestCheckin?.review?.id

    const handleApprove = () => {
        startTransition(async () => {
            let result
            if (hasReview) {
                // Caso A: existe review formal → aprobarla
                result = await approveReviewAction(latestCheckin!.review!.id)
            } else {
                // Caso B: no hay review o no hay checkin → forzar avance
                result = await forceAdvanceCheckinAction(clientId)
            }
            if (result.success) {
                toast({
                    title: hasReview ? 'Revisión aprobada' : 'Check-in avanzado',
                    description: 'El próximo check-in se ha programado correctamente.',
                })
                onRefresh()
            } else {
                toast({
                    title: 'Error',
                    description: result.error,
                    variant: 'destructive',
                })
            }
        })
    }

    return (
        <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
                {hasReview
                    ? 'Revisión pendiente de aprobar — apruébala para avanzar el ciclo'
                    : 'No hay check-in esta semana — avanza el ciclo manualmente'}
            </div>
            <Button
                size="sm"
                variant={hasReview ? 'default' : 'outline'}
                onClick={handleApprove}
                disabled={isPending}
                className="shrink-0 gap-2"
            >
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasReview ? (
                    <CheckCheck className="h-4 w-4" />
                ) : (
                    <FastForward className="h-4 w-4" />
                )}
                {hasReview ? 'Aprobar revisión' : 'Avanzar check-in'}
            </Button>
        </div>
    )
}

function ReviewCard({
    coachId,
    checkin,
    onRefresh,
    onSwitchTab,
    metricDefinitions,
    previousCheckin,
}: {
    coachId: string
    checkin: CheckinWithReview | null
    onRefresh: () => void
    onSwitchTab: (tab: string) => void
    metricDefinitions: MetricDefinition[]
    previousCheckin?: CheckinWithReview | null
}) {
    const [aiSheetOpen, setAISheetOpen] = useState(false)
    const [isRegenerating, startRegenerating] = useTransition()
    const { toast } = useToast()

    if (!checkin) {
        return (
            <Card className="p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold">Sin check-ins</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    El cliente aún no ha enviado ningún check-in
                </p>
            </Card>
        )
    }

    if (checkin.status === 'pending') {
        const dateStr = checkin.period_end
            ? new Date(checkin.period_end).toLocaleDateString('es-ES')
            : 'Pendiente'
        return (
            <Card className="p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className="font-semibold">Formulario enviado</h3>
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                        Pendiente
                    </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                    Esperando respuesta del cliente
                </p>
                <div className="text-xs text-muted-foreground">
                    Fecha programada: {dateStr}
                </div>
            </Card>
        )
    }

    // Helpers para resolver UUID → nombre real de métrica
    const getMetricLabel = (key: string) => {
        const id = key.replace('metric_', '')
        const def = metricDefinitions.find(m => m.id === id)
        return def ? def.name : key.replace('metric_', '').substring(0, 20)
    }

    const getMetricUnit = (key: string) => {
        const id = key.replace('metric_', '')
        const def = metricDefinitions.find(m => m.id === id)
        return def?.unit ? ` ${def.unit}` : ''
    }

    const payload = (checkin.raw_payload as Record<string, unknown>) || {}
    const previousPayload = (previousCheckin?.raw_payload as Record<string, unknown>) || {}
    const analysis = getParsedAIAnalysis(checkin.review)
    const aiStatus = getReviewAIStatus(checkin.review)

    const getMetricDelta = (key: string): number | null => {
        const curr = parseFloat(String(payload[key] ?? ''))
        const prev = parseFloat(String(previousPayload[key] ?? ''))
        if (isNaN(curr) || isNaN(prev)) return null
        return Math.round((curr - prev) * 100) / 100
    }

    // Solo métricas con valor relleno (no null, no string vacío)
    const metricKeys = Object.keys(payload).filter(
        k => k.startsWith('metric_') && payload[k] !== null && payload[k] !== ''
    )

    const handleRegenerateAI = () => {
        if (!checkin.review?.id) return

        startRegenerating(async () => {
            const result = await regenerateReviewAIAction(coachId, checkin.id, checkin.review!.id)
            if (!result.success) {
                toast({
                    title: 'Error al regenerar IA',
                    description: result.error || 'No se pudo generar el análisis IA.',
                    variant: 'destructive',
                })
                return
            }

            toast({
                title: 'Análisis IA actualizado',
                description: 'El resumen del assistant se ha regenerado correctamente.',
            })
            onRefresh()
            setAISheetOpen(true)
        })
    }

    return (
        <Card className="flex flex-col">
            <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Último check-in</h3>
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                        Completado
                    </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                    {checkin.submitted_at ? new Date(checkin.submitted_at).toLocaleDateString('es-ES') : ''}
                </span>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Métricas y estado
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Vista compacta del último check-in recibido.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-right">
                            <div className="rounded-lg bg-background px-3 py-2 border">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Entreno</p>
                                <p className="text-sm font-semibold">
                                    {checkin.training_adherence_pct != null ? `${checkin.training_adherence_pct}%` : '—'}
                                </p>
                            </div>
                            <div className="rounded-lg bg-background px-3 py-2 border">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Nutrición</p>
                                <p className="text-sm font-semibold">
                                    {checkin.nutrition_adherence_pct != null ? `${checkin.nutrition_adherence_pct}%` : '—'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {metricKeys.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                            {metricKeys.slice(0, 6).map((key) => {
                                const delta = getMetricDelta(key)
                                return (
                                    <div key={key} className="rounded-lg border bg-background px-3 py-2.5">
                                        <p className="text-xs text-muted-foreground truncate" title={getMetricLabel(key)}>
                                            {getMetricLabel(key)}
                                        </p>
                                        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                                            <p className="text-sm font-semibold">
                                                {String(payload[key])}{getMetricUnit(key)}
                                            </p>
                                            {delta !== null && delta !== 0 && (
                                                <span
                                                    className={cn(
                                                        'text-xs font-semibold',
                                                        delta > 0 ? 'text-green-500' : 'text-red-500'
                                                    )}
                                                >
                                                    {delta > 0 ? `+${delta}` : `${delta}`}
                                                </span>
                                            )}
                                            {delta === 0 && (
                                                <span className="text-xs text-muted-foreground">= sin cambio</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-sm text-muted-foreground text-center">
                            No hay métricas registradas en este check-in.
                        </div>
                    )}

                    {metricKeys.length > 6 && (
                        <p className="text-xs text-muted-foreground">
                            {metricKeys.length - 6} métricas más disponibles dentro de la revisión completa.
                        </p>
                    )}
                </section>

                <section className="space-y-4 rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                <p className="text-sm font-semibold">Assistant IA del coach</p>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Lectura rápida del check-in para acelerar la revisión.
                            </p>
                        </div>
                        <Badge
                            variant="outline"
                            className={cn(
                                aiStatus === 'completed' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
                                aiStatus === 'pending' && 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                                aiStatus === 'failed' && 'bg-destructive/10 text-destructive border-destructive/20',
                                aiStatus === 'idle' && 'bg-muted/60 text-muted-foreground'
                            )}
                        >
                            {aiStatus === 'completed'
                                ? 'Disponible'
                                : aiStatus === 'pending'
                                    ? 'Generando'
                                    : aiStatus === 'failed'
                                        ? 'Error'
                                        : 'Sin generar'}
                        </Badge>
                    </div>

                    {aiStatus === 'pending' && (
                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                El análisis IA se está generando
                            </div>
                            <p className="mt-2 text-sm text-blue-700/90">
                                El check-in ya está guardado. En breve tendrás el resumen y las propuestas para el coach.
                            </p>
                        </div>
                    )}

                    {aiStatus === 'failed' && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <AlertTriangle className="h-4 w-4" />
                                No se pudo generar el análisis IA
                            </div>
                            <p className="mt-2 text-sm text-destructive/90">
                                {checkin.review?.ai_error || 'Se produjo un error desconocido.'}
                            </p>
                        </div>
                    )}

                    {aiStatus === 'completed' && analysis && (
                        <div className="space-y-3">
                            <div className="rounded-lg border bg-muted/20 p-4">
                                <p className="text-sm leading-6 text-foreground">
                                    {checkin.review?.ai_summary || analysis.overall_summary}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {analysis.coach_recommendations.length > 0 && (
                                    <Badge variant="secondary">
                                        {analysis.coach_recommendations.length} recomendaciones
                                    </Badge>
                                )}
                                {analysis.suggested_changes.length > 0 && (
                                    <Badge variant="secondary">
                                        {analysis.suggested_changes.length} cambios sugeridos
                                    </Badge>
                                )}
                                {analysis.warnings_or_flags.length > 0 && (
                                    <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                                        {analysis.warnings_or_flags.length} alertas
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    {aiStatus === 'idle' && (
                        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                            Este check-in todavía no tiene un análisis IA generado.
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => onSwitchTab('checkins')}>
                            Ver revisión completa
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="gap-2"
                            onClick={() => setAISheetOpen(true)}
                            disabled={!checkin.review}
                        >
                            Ver análisis IA
                            <Sparkles className="h-4 w-4" />
                        </Button>
                        {checkin.review?.id && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="gap-2"
                                onClick={handleRegenerateAI}
                                disabled={isRegenerating}
                            >
                                {isRegenerating && <Loader2 className="h-4 w-4 animate-spin" />}
                                {!isRegenerating && 'Regenerar IA'}
                            </Button>
                        )}
                    </div>
                </section>
            </div>

            <CheckinAIAnalysisSheet
                review={checkin.review}
                open={aiSheetOpen}
                onOpenChange={setAISheetOpen}
                onRegenerate={checkin.review?.id ? handleRegenerateAI : undefined}
                regenerating={isRegenerating}
            />
        </Card>
    )
}

function ActivePlanCard({
    title,
    icon: Icon,
    hasData,
    content,
    onView
}: {
    title: string
    icon: React.ElementType
    hasData: boolean
    content: React.ReactNode
    onView: () => void
}) {
    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <h3 className="font-medium text-sm">{title}</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={onView}>
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
            {hasData ? (
                content
            ) : (
                <p className="text-sm text-muted-foreground">Sin plan activo</p>
            )}
        </Card>
    )
}
