'use client'

import { useState, useTransition } from 'react'
import type { ElementType, ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Client } from '@/types/coach'
import type { ClientStatus, CheckinWithReview, MacroPlan, TrainingProgram } from '@/data/workspace'
import { forceAdvanceCheckinAction, regenerateReviewAIAction } from './actions'
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
    TrendingUp,
    TrendingDown,
    Minus,
    Weight,
    Footprints,
    CalendarClock,
} from 'lucide-react'
import { MetricDefinition } from '@/types/metrics'
import { cn } from '@/lib/utils'
import { ReviewApprovalDialog } from './ReviewApprovalDialog'
import {
    CheckinAIAnalysisSheet,
    getParsedAIAnalysis,
    getReviewAIStatus,
} from './CheckinAIAnalysisSheet'
import { parseLocalDate } from '@/lib/date-utils'

type MetricPoint = {
    metric_date?: string
    weight_kg?: number | null
    steps?: number | null
    training_adherence?: number | null
    nutrition_adherence?: number | null
    [key: string]: unknown
}

interface ResumenTabProps {
    coachId: string
    clientId: string
    client: Client
    clientStatus: ClientStatus | null
    latestCheckin: CheckinWithReview | null
    activeMacroPlan: MacroPlan | null
    activeProgram: TrainingProgram | null
    metrics: MetricPoint[]
    onRefresh: () => void
    onSwitchTab: (tab: string) => void
    metricDefinitions: MetricDefinition[]
    previousCheckin?: CheckinWithReview | null
}

type ProgramSnapshot = {
    hasProgram: boolean
    label: string
    sublabel: string
    detail: string
    progressPct: number
    phaseLabel: string
}

type AvgSnapshot = {
    average: number | null
    previousAverage: number | null
    latest: number | null
    delta: number | null
    hasWindowData: boolean
}

function startOfLocalDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function diffInDays(a: Date, b: Date) {
    const msPerDay = 24 * 60 * 60 * 1000
    return Math.round((startOfLocalDay(a).getTime() - startOfLocalDay(b).getTime()) / msPerDay)
}

function formatMetricValue(value: number | null, suffix = '') {
    if (value === null || Number.isNaN(value)) return '—'
    const isInteger = Math.abs(value - Math.round(value)) < 0.05
    return `${isInteger ? Math.round(value) : value.toFixed(1)}${suffix}`
}

function formatSteps(value: number | null) {
    if (value === null || Number.isNaN(value)) return '—'
    return Math.round(value).toLocaleString('es-ES')
}

function formatDelta(value: number | null, suffix = '') {
    if (value === null || Number.isNaN(value) || value === 0) return 'Sin cambio'
    const prefix = value > 0 ? '+' : ''
    const isInteger = Math.abs(value - Math.round(value)) < 0.05
    return `${prefix}${isInteger ? Math.round(value) : value.toFixed(1)}${suffix}`
}

function formatDeltaSteps(value: number | null) {
    if (value === null || Number.isNaN(value) || value === 0) return 'Sin cambio'
    const prefix = value > 0 ? '+' : ''
    return `${prefix}${Math.round(value).toLocaleString('es-ES')}`
}

function average(values: Array<number | null | undefined>) {
    const clean = values.filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
    if (clean.length === 0) return null
    return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function getWindowedMetricSnapshot(
    metrics: MetricPoint[],
    extractor: (metric: MetricPoint) => number | null | undefined,
    now: Date,
): AvgSnapshot {
    const today = startOfLocalDay(now)
    const currentWindow: number[] = []
    const previousWindow: number[] = []
    let latest: number | null = null

    const sorted = [...metrics].sort((a, b) => {
        const aTime = a.metric_date ? parseLocalDate(a.metric_date).getTime() : 0
        const bTime = b.metric_date ? parseLocalDate(b.metric_date).getTime() : 0
        return aTime - bTime
    })

    for (const metric of sorted) {
        if (!metric.metric_date) continue

        const value = extractor(metric)
        if (typeof value === 'number' && !Number.isNaN(value)) {
            latest = value
        } else {
            continue
        }

        const metricDate = parseLocalDate(metric.metric_date)
        const daysAgo = diffInDays(today, metricDate)

        if (daysAgo >= 0 && daysAgo <= 6) {
            currentWindow.push(value)
        } else if (daysAgo >= 7 && daysAgo <= 13) {
            previousWindow.push(value)
        }
    }

    const averageCurrent = average(currentWindow)
    const averagePrevious = average(previousWindow)

    return {
        average: averageCurrent,
        previousAverage: averagePrevious,
        latest,
        delta: averageCurrent !== null && averagePrevious !== null ? averageCurrent - averagePrevious : null,
        hasWindowData: currentWindow.length > 0,
    }
}

function getProgramSnapshot(activeProgram: TrainingProgram | null): ProgramSnapshot {
    if (!activeProgram) {
        return {
            hasProgram: false,
            label: 'Sin programa activo',
            sublabel: 'No hay un bloque activo asignado',
            detail: 'Asigna un programa para situar la progresión del cliente.',
            progressPct: 0,
            phaseLabel: 'Pendiente',
        }
    }

    const totalWeeks = Math.max(activeProgram.total_weeks || 0, 1)
    const startDate = parseLocalDate(activeProgram.effective_from)
    const elapsedDays = Math.max(0, diffInDays(new Date(), startDate))
    const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(elapsedDays / 7) + 1))
    const progressPct = Math.min(100, Math.round((currentWeek / totalWeeks) * 100))

    let phaseLabel = 'Inicio'
    if (progressPct >= 75) phaseLabel = 'Consolidación'
    else if (progressPct >= 40) phaseLabel = 'Desarrollo'

    return {
        hasProgram: true,
        label: `Semana ${currentWeek} de ${totalWeeks}`,
        sublabel: activeProgram.name,
        detail: `Bloque activo desde ${startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
        progressPct,
        phaseLabel,
    }
}


function getFollowUpSummary(clientStatus: ClientStatus | null) {
    if (!clientStatus) {
        return {
            label: 'Cargando',
            description: 'Preparando lectura del seguimiento',
            tone: 'neutral' as const,
        }
    }

    if (clientStatus.daysUntilCheckin < 0) {
        return {
            label: `Atrasado ${Math.abs(clientStatus.daysUntilCheckin)}d`,
            description: 'El siguiente check-in ya debería haberse recibido.',
            tone: 'danger' as const,
        }
    }

    if (clientStatus.daysUntilCheckin === 0) {
        return {
            label: 'Check-in hoy',
            description: 'Conviene revisar si entra durante el día.',
            tone: 'warning' as const,
        }
    }

    if (clientStatus.statusLevel === 'warning' || clientStatus.statusLevel === 'risk') {
        return {
            label: 'Requiere atención',
            description: 'Hay señales de seguimiento que conviene vigilar.',
            tone: 'warning' as const,
        }
    }

    return {
        label: 'Todo en orden',
        description: 'El seguimiento del cliente está dentro de lo esperado.',
        tone: 'success' as const,
    }
}

function QuickStatCard({
    icon: Icon,
    title,
    value,
    subtitle,
    detail,
    badge,
    progressPct,
}: {
    icon: ElementType
    title: string
    value: string
    subtitle?: string
    detail?: string
    badge?: ReactNode
    progressPct?: number
}) {
    return (
        <Card className="h-full rounded-xl border bg-card/70 px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <div className="rounded-md bg-primary/10 p-1 text-primary">
                        <Icon className="h-3 w-3" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {title}
                    </p>
                </div>
                {badge}
            </div>
            <p className="mt-1.5 text-lg font-semibold leading-none tracking-tight">{value}</p>
            {subtitle && <p className="mt-1 text-[12px] font-medium leading-snug text-foreground/80">{subtitle}</p>}
            {detail && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{detail}</p>}
            {typeof progressPct === 'number' && (
                <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(0, Math.min(progressPct, 100))}%` }}
                        />
                    </div>
                </div>
            )}
        </Card>
    )
}

export function ResumenTab({
    coachId,
    clientId,
    client,
    clientStatus,
    latestCheckin,
    activeMacroPlan,
    activeProgram,
    metrics,
    onRefresh,
    onSwitchTab,
    metricDefinitions,
    previousCheckin,
}: ResumenTabProps) {
    const programSnapshot = getProgramSnapshot(activeProgram)
    const followUp = getFollowUpSummary(clientStatus)
    const weightSnapshot = getWindowedMetricSnapshot(metrics, metric => metric.weight_kg ?? null, new Date())
    const stepsSnapshot = getWindowedMetricSnapshot(
        metrics,
        metric => metric.steps != null ? (metric.steps > 30000 ? metric.steps / 7 : metric.steps) : null,
        new Date()
    )

    const followUpBadge = followUp.tone === 'success'
        ? <Badge className="border-0 bg-emerald-500/10 text-emerald-600">OK</Badge>
        : followUp.tone === 'warning'
            ? <Badge className="border-0 bg-amber-500/10 text-amber-600">Atención</Badge>
            : followUp.tone === 'danger'
                ? <Badge className="border-0 bg-destructive/10 text-destructive">Urgente</Badge>
                : <Badge variant="secondary">Info</Badge>

    const stepsTarget = activeMacroPlan?.steps ?? null
    const nutritionSummary = activeMacroPlan?.day_type_config
        ? 'Macros diferenciadas por día'
        : activeMacroPlan
            ? `${activeMacroPlan.kcal} kcal`
            : 'Sin plan activo'

    return (
        <div className="space-y-5">
            <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Estado actual</h3>

                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <QuickStatCard
                        icon={TrendingUp}
                        title="Programa"
                        value={programSnapshot.label}
                        subtitle={programSnapshot.sublabel}
                        badge={
                            programSnapshot.hasProgram ? (
                                <Badge className="border-0 bg-primary/10 text-primary text-[10px] px-1.5 py-0">
                                    {programSnapshot.progressPct}%
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pendiente</Badge>
                            )
                        }
                        progressPct={programSnapshot.hasProgram ? programSnapshot.progressPct : undefined}
                    />

                    <Card className="h-full rounded-xl border bg-card px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <div className="flex h-6 w-6 items-center justify-center rounded-md ring-1 bg-blue-500/10 text-blue-500 ring-blue-500/20">
                                    <Weight className="h-3 w-3" />
                                </div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                    Peso medio 7d
                                </p>
                            </div>
                            {weightSnapshot.delta !== null && (
                                <div className={cn(
                                    'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-semibold',
                                    weightSnapshot.delta < 0 && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                                    weightSnapshot.delta > 0 && 'border-rose-500/20 bg-rose-500/10 text-rose-500',
                                    weightSnapshot.delta === 0 && 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                                )}>
                                    {weightSnapshot.delta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : weightSnapshot.delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                                    {weightSnapshot.delta > 0 ? '+' : ''}{weightSnapshot.delta.toFixed(1)} kg
                                </div>
                            )}
                        </div>
                        <p className="mt-1.5 text-lg font-semibold leading-none tracking-tight">
                            {formatMetricValue(weightSnapshot.average ?? weightSnapshot.latest, ' kg')}
                        </p>
                        {(weightSnapshot.delta !== null || weightSnapshot.latest !== null) && (
                            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                                {weightSnapshot.delta !== null
                                    ? `vs 7d previos`
                                    : `Último: ${formatMetricValue(weightSnapshot.latest, ' kg')}`
                                }
                            </p>
                        )}
                    </Card>

                    <QuickStatCard
                        icon={Footprints}
                        title="Pasos medios"
                        value={formatSteps(stepsSnapshot.average ?? stepsSnapshot.latest)}
                        subtitle={
                            stepsTarget
                                ? `Objetivo: ${stepsTarget.toLocaleString('es-ES')}`
                                : stepsSnapshot.delta !== null
                                    ? `${formatDeltaSteps(stepsSnapshot.delta)} vs 7d`
                                    : undefined
                        }
                        badge={
                            stepsTarget && (stepsSnapshot.average ?? stepsSnapshot.latest) !== null ? (
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'rounded-full text-[10px] px-1.5 py-0',
                                        ((stepsSnapshot.average ?? stepsSnapshot.latest) ?? 0) >= stepsTarget
                                            ? 'border-emerald-500/30 text-emerald-600'
                                            : 'border-amber-500/30 text-amber-600'
                                    )}
                                >
                                    {Math.round((((stepsSnapshot.average ?? stepsSnapshot.latest) ?? 0) / stepsTarget) * 100)}%
                                </Badge>
                            ) : undefined
                        }
                    />

                    <QuickStatCard
                        icon={CalendarClock}
                        title="Seguimiento"
                        value={followUp.label}
                        subtitle={
                            clientStatus?.daysSinceCheckin != null
                                ? `Hace ${clientStatus.daysSinceCheckin}d · cada ${client.checkin_frequency_days}d`
                                : `Cada ${client.checkin_frequency_days}d`
                        }
                        badge={followUpBadge}
                    />
                </div>

                {clientStatus && clientStatus.daysUntilCheckin < 0 && (
                    <FollowUpActionBanner
                        coachId={coachId}
                        latestCheckin={latestCheckin}
                        clientId={clientId}
                        onRefresh={onRefresh}
                    />
                )}
            </section>

            <section className="space-y-5">

            <ReviewCard
                coachId={coachId}
                checkin={latestCheckin}
                onRefresh={onRefresh}
                onSwitchTab={onSwitchTab}
                metricDefinitions={metricDefinitions}
                previousCheckin={previousCheckin ?? null}
            />

            <div className="grid gap-4 lg:grid-cols-2">
                <ActivePlanCard
                    title="Plan nutricional"
                    icon={Apple}
                    summary={nutritionSummary}
                    tone="nutrition"
                    content={
                        activeMacroPlan ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {(() => {
                                    let cfg = activeMacroPlan.day_type_config as unknown
                                    if (typeof cfg === 'string') {
                                        try {
                                            cfg = JSON.parse(cfg)
                                        } catch {
                                            cfg = null
                                        }
                                    }

                                    if (cfg && typeof cfg === 'object' && 'training' in cfg && 'rest' in cfg) {
                                        const typedCfg = cfg as {
                                            training: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
                                            rest: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
                                        }
                                        return (
                                            <>
                                                <PlanMetric
                                                    label="Día de entreno"
                                                    value={`${typedCfg.training.kcal} kcal`}
                                                    detail={`P${typedCfg.training.protein_g} · C${typedCfg.training.carbs_g} · G${typedCfg.training.fat_g}`}
                                                />
                                                <PlanMetric
                                                    label="Día de descanso"
                                                    value={`${typedCfg.rest.kcal} kcal`}
                                                    detail={`P${typedCfg.rest.protein_g} · C${typedCfg.rest.carbs_g} · G${typedCfg.rest.fat_g}`}
                                                />
                                            </>
                                        )
                                    }

                                    return (
                                        <>
                                            <PlanMetric
                                                label="Objetivo diario"
                                                value={`${activeMacroPlan.kcal} kcal`}
                                                detail={`P${activeMacroPlan.protein_g} · C${activeMacroPlan.carbs_g} · G${activeMacroPlan.fat_g}`}
                                            />
                                            <PlanMetric
                                                label="Pasos objetivo"
                                                value={activeMacroPlan.steps ? activeMacroPlan.steps.toLocaleString() : 'Sin objetivo'}
                                                detail={activeMacroPlan.notes || 'Sin notas nutricionales recientes'}
                                            />
                                        </>
                                    )
                                })()}
                            </div>
                        ) : null
                    }
                    emptyCopy="Sin plan activo ahora mismo."
                    onView={() => onSwitchTab('diet')}
                />

                <ActivePlanCard
                    title="Programa entrenamiento"
                    icon={Dumbbell}
                    summary={activeProgram ? programSnapshot.label : 'Sin programa activo'}
                    tone="training"
                    content={
                        activeProgram ? (
                            <div className="space-y-3">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <PlanMetric
                                        label="Bloque activo"
                                        value={activeProgram.name}
                                        detail={`${activeProgram.total_weeks} semanas · ${programSnapshot.phaseLabel}`}
                                    />
                                    <PlanMetric
                                        label="Ritmo del bloque"
                                        value={`${programSnapshot.progressPct}% completado`}
                                        detail={programSnapshot.detail}
                                    />
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${programSnapshot.progressPct}%` }}
                                    />
                                </div>
                            </div>
                        ) : null
                    }
                    emptyCopy="Sin programa de entrenamiento activo."
                    onView={() => onSwitchTab('progreso')}
                />
            </div>
            </section>
        </div>
    )
}

function canOpenReviewFlow(checkin: CheckinWithReview | null) {
    if (!checkin || checkin.status === 'pending') return false

    return (
        !checkin.review ||
        checkin.review.status === 'draft' ||
        (checkin.review.status === 'approved' && !checkin.review.message_to_client?.trim())
    )
}

function getReviewActionLabel(checkin: CheckinWithReview | null) {
    if (checkin?.review?.status === 'approved' && !checkin.review.message_to_client?.trim()) {
        return 'Enviar feedback'
    }

    return 'Cerrar revisión'
}

function FollowUpActionBanner({
    coachId,
    latestCheckin,
    clientId,
    onRefresh,
}: {
    coachId: string
    latestCheckin: CheckinWithReview | null
    clientId: string
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const [dialogOpen, setDialogOpen] = useState(false)
    const { toast } = useToast()

    const hasReviewableCheckin = canOpenReviewFlow(latestCheckin)

    const handlePrimaryAction = () => {
        if (hasReviewableCheckin) {
            setDialogOpen(true)
            return
        }

        startTransition(async () => {
            const result = await forceAdvanceCheckinAction(clientId)
            if (result.success) {
                toast({
                    title: 'Check-in avanzado',
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
        <>
            <Card className="border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                            <AlertTriangle className="h-4 w-4" />
                            Seguimiento atrasado
                        </div>
                        <p className="mt-1 text-sm text-amber-700/90">
                            {hasReviewableCheckin
                                ? latestCheckin?.review?.status === 'approved'
                                    ? 'La revisión ya está aprobada. Si quieres, todavía puedes enviar el feedback desde aquí.'
                                    : 'Hay una revisión pendiente de cerrar antes de avanzar el siguiente ciclo.'
                                : 'No hay un check-in pendiente de revisión. Puedes avanzar el ciclo manualmente si corresponde.'}
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant={hasReviewableCheckin ? 'default' : 'outline'}
                        onClick={handlePrimaryAction}
                        disabled={isPending}
                        className="gap-2 shrink-0"
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : hasReviewableCheckin ? (
                            <CheckCheck className="h-4 w-4" />
                        ) : (
                            <FastForward className="h-4 w-4" />
                        )}
                        {hasReviewableCheckin ? getReviewActionLabel(latestCheckin) : 'Avanzar check-in'}
                    </Button>
                </div>
            </Card>

            <ReviewApprovalDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                coachId={coachId}
                clientId={clientId}
                checkin={hasReviewableCheckin ? latestCheckin : null}
                onCompleted={onRefresh}
            />
        </>
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

    const metricKeys = Object.keys(payload).filter(
        key => key.startsWith('metric_') && payload[key] !== null && payload[key] !== ''
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
        <Card className="flex flex-col overflow-hidden">
            <div className="border-b p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                            <h3 className="font-semibold">Último check-in</h3>
                            <p className="text-sm text-muted-foreground">
                                Lectura rápida del último formulario recibido y del resumen IA.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            Completado
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                            {checkin.submitted_at ? new Date(checkin.submitted_at).toLocaleDateString('es-ES') : ''}
                        </span>
                    </div>
                </div>
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
                            {metricKeys.slice(0, 6).map(key => {
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
    summary,
    tone,
    content,
    emptyCopy,
    onView,
}: {
    title: string
    icon: ElementType
    summary: string
    tone: 'nutrition' | 'training'
    content: ReactNode
    emptyCopy: string
    onView: () => void
}) {
    return (
        <Card className="rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div
                        className={cn(
                            'rounded-xl p-2',
                            tone === 'nutrition' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary/10 text-primary'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {title}
                        </p>
                        <h3 className="mt-1 font-semibold tracking-tight">{summary}</h3>
                    </div>
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={onView}>
                    Abrir
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>

            <div className="mt-4">
                {content ?? (
                    <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        {emptyCopy}
                    </div>
                )}
            </div>
        </Card>
    )
}

function PlanMetric({
    label,
    value,
    detail,
}: {
    label: string
    value: string
    detail: string
}) {
    return (
        <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-sm font-semibold">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
    )
}
