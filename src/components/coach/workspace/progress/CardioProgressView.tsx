'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
    Activity,
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Heart,
    MapPin,
    MessageSquareText,
    Route as RouteIcon,
    Timer,
    TrendingUp,
} from 'lucide-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import type {
    CardioProgressData,
    CardioSessionProgress,
} from '@/app/(coach)/coach/workspace/progress-actions'

type MetricMode = 'km' | 'horas'

interface CardioProgressViewProps {
    data: CardioProgressData
}

const cardioTypeLabels: Record<string, string> = {
    rodaje: 'Rodaje',
    series: 'Series',
    tempo: 'Tempo',
    fartlek: 'Fartlek',
    progressive: 'Progresivo',
    hybrid: 'Híbrido',
}

function formatHours(min: number) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
}

function formatDistance(km: number) {
    return `${km.toFixed(1)} km`
}

function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

function formatFullDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

function formatPct(value: number | null) {
    if (value === null || Number.isNaN(value)) return '—'
    return `${Math.round(value)}%`
}

function clampProgress(value: number | null) {
    if (value === null || Number.isNaN(value)) return 0
    return Math.max(0, Math.min(100, value))
}

function getTrainingTypeLabel(trainingType: string | null) {
    if (!trainingType) return 'Cardio'
    return cardioTypeLabels[trainingType] || `${trainingType.charAt(0).toUpperCase()}${trainingType.slice(1)}`
}

function getStructureLines(structure: unknown): string[] {
    if (!structure) return []

    if (typeof structure === 'string') {
        return structure.trim() ? [structure.trim()] : []
    }

    if (Array.isArray(structure)) {
        return structure
            .map((block: any) => {
                const label = block?.name || block?.type
                const details = [
                    block?.description,
                    block?.distance ? `${block.distance} km` : null,
                    block?.duration ? `${block.duration} min` : null,
                    block?.targetPace,
                    block?.targetHR,
                    block?.sets && (block?.workDistance || block?.workDuration)
                        ? `${block.sets} repeticiones`
                        : null,
                    block?.workDistance ? `${block.workDistance} km trabajo` : null,
                    block?.workDuration ? `${block.workDuration} min trabajo` : null,
                    block?.workTargetPace,
                    block?.restDuration ? `${block.restDuration} min rec.` : null,
                    block?.restDistance ? `${block.restDistance} km rec.` : null,
                    block?.notes,
                ].filter(Boolean)

                if (!label && details.length === 0) return null
                return [label, details.join(' · ')].filter(Boolean).join(': ')
            })
            .filter((line): line is string => Boolean(line))
    }

    if (typeof structure === 'object' && structure !== null) {
        const structureObject = structure as Record<string, any>
        if (Array.isArray(structureObject.blocks)) {
            return getStructureLines(structureObject.blocks)
        }
        if (typeof structureObject.description === 'string' && structureObject.description.trim()) {
            return [structureObject.description.trim()]
        }
    }

    return []
}

function WeekTooltip({ active, payload, label, mode }: any) {
    if (!active || !payload?.length) return null
    const week = payload[0]?.payload
    const actualValue = mode === 'km'
        ? formatDistance(week?.distanceKm ?? 0)
        : formatHours(week?.durationMin ?? 0)
    const plannedValue = mode === 'km'
        ? formatDistance(week?.plannedDistanceKm ?? 0)
        : formatHours(week?.plannedDurationMin ?? 0)

    return (
        <div className="rounded-xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-sm">
            <p className="text-sm font-semibold text-foreground">{week?.tooltipLabel || label}</p>
            <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Realizado</span>
                    <span className="font-medium text-foreground">{actualValue}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Planificado</span>
                    <span className="font-medium text-foreground">{plannedValue}</span>
                </div>
                <div className="pt-1 text-xs text-muted-foreground">
                    {week?.sessionsCount ?? 0} registradas · {week?.plannedSessionsCount ?? 0} planificadas
                </div>
            </div>
        </div>
    )
}

function getSessionStatusMeta(session: CardioSessionProgress) {
    if (session.completionStatus === 'completed') {
        return {
            label: 'Completada',
            className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
            icon: CheckCircle2,
        }
    }

    if (session.completionStatus === 'partial') {
        return {
            label: 'Parcial',
            className: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
            icon: AlertTriangle,
        }
    }

    return {
        label: 'No realizada',
        className: 'border-border bg-muted/50 text-muted-foreground',
        icon: ClipboardList,
    }
}

function getDisplayMetric(session: CardioSessionProgress) {
    if (session.targetDistanceKm !== null || session.actualDistanceKm !== null) {
        return {
            key: 'distance' as const,
            planned: session.targetDistanceKm,
            actual: session.actualDistanceKm,
            progressPct: session.distanceProgressPct,
            delta: session.distanceDeltaKm,
            summary: session.targetDistanceKm !== null
                ? `${(session.actualDistanceKm ?? 0).toFixed(1)} km de ${session.targetDistanceKm.toFixed(1)} km`
                : session.actualDistanceKm !== null
                    ? `${session.actualDistanceKm.toFixed(1)} km realizados`
                    : 'Sin distancia registrada',
        }
    }

    if (session.targetDurationMin !== null || session.actualDurationMin !== null) {
        return {
            key: 'duration' as const,
            planned: session.targetDurationMin,
            actual: session.actualDurationMin,
            progressPct: session.durationProgressPct,
            delta: session.durationDeltaMin,
            summary: session.targetDurationMin !== null
                ? `${formatHours(session.actualDurationMin ?? 0)} de ${formatHours(session.targetDurationMin)}`
                : session.actualDurationMin !== null
                    ? `${formatHours(session.actualDurationMin)} realizados`
                    : 'Sin tiempo registrado',
        }
    }

    return {
        key: 'none' as const,
        planned: null,
        actual: null,
        progressPct: null,
        delta: null,
        summary: session.isCompleted ? 'Sesión marcada como completada' : 'Sin registro realizado',
    }
}

function StatCard({
    icon: Icon,
    label,
    value,
    hint,
    color,
}: {
    icon: React.ElementType
    label: string
    value: string
    hint?: string
    color: string
}) {
    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                    <div className={cn('rounded-xl p-2 ring-1', color)}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {label}
                    </span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{value}</p>
                {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
            </CardContent>
        </Card>
    )
}

function SessionMetricCard({
    label,
    value,
    hint,
}: {
    label: string
    value: string
    hint?: string | null
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-base font-semibold text-foreground">{value}</p>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    )
}

function SessionCard({ session }: { session: CardioSessionProgress }) {
    const [open, setOpen] = useState(false)
    const statusMeta = getSessionStatusMeta(session)
    const StatusIcon = statusMeta.icon
    const displayMetric = getDisplayMetric(session)
    const structureLines = useMemo(() => getStructureLines(session.plannedStructure), [session.plannedStructure])
    const progressPct = displayMetric.progressPct
    const overTarget = progressPct !== null && progressPct > 100

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card className="overflow-hidden border-border/70 bg-card/95">
                <div className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                                    {getTrainingTypeLabel(session.trainingType)}
                                </Badge>
                                <Badge variant="outline" className={statusMeta.className}>
                                    <StatusIcon className="mr-1 h-3.5 w-3.5" />
                                    {statusMeta.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{formatDate(session.scheduledDate)}</span>
                            </div>
                            <div>
                                <h4 className="text-base font-semibold text-foreground">{session.title}</h4>
                                <p className="mt-1 text-sm text-muted-foreground">{displayMetric.summary}</p>
                            </div>
                        </div>

                        <div className="min-w-[220px] space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                                <span>Cumplimiento</span>
                                <span>{formatPct(progressPct)}</span>
                            </div>
                            <Progress value={clampProgress(progressPct)} className="h-2.5 bg-muted" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                    {displayMetric.key === 'duration'
                                        ? displayMetric.planned !== null
                                            ? `Objetivo ${formatHours(displayMetric.planned)}`
                                            : 'Sin objetivo marcado'
                                        : displayMetric.planned !== null
                                            ? `Objetivo ${displayMetric.planned.toFixed(1)} km`
                                            : 'Sin objetivo marcado'}
                                </span>
                                {overTarget ? (
                                    <span className="font-medium text-emerald-700">+{Math.round((progressPct ?? 0) - 100)}%</span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SessionMetricCard
                            label="Planificado"
                            value={session.targetDistanceKm !== null
                                ? formatDistance(session.targetDistanceKm)
                                : session.targetDurationMin !== null
                                    ? formatHours(session.targetDurationMin)
                                    : 'Sin objetivo'}
                            hint={session.targetPace ? `Ritmo objetivo ${session.targetPace}` : null}
                        />
                        <SessionMetricCard
                            label="Realizado"
                            value={session.actualDistanceKm !== null
                                ? formatDistance(session.actualDistanceKm)
                                : session.actualDurationMin !== null
                                    ? formatHours(session.actualDurationMin)
                                    : 'Sin registro'}
                            hint={session.actualAvgPace ? `Ritmo medio ${session.actualAvgPace}` : null}
                        />
                        <SessionMetricCard
                            label="Tiempo"
                            value={session.actualDurationMin !== null
                                ? formatHours(session.actualDurationMin)
                                : session.targetDurationMin !== null
                                    ? `Objetivo ${formatHours(session.targetDurationMin)}`
                                    : '—'}
                            hint={session.durationDeltaMin !== null ? `${session.durationDeltaMin > 0 ? '+' : ''}${session.durationDeltaMin.toFixed(0)} min vs objetivo` : null}
                        />
                        <SessionMetricCard
                            label="Distancia"
                            value={session.actualDistanceKm !== null
                                ? formatDistance(session.actualDistanceKm)
                                : session.targetDistanceKm !== null
                                    ? `Objetivo ${formatDistance(session.targetDistanceKm)}`
                                    : '—'}
                            hint={session.distanceDeltaKm !== null ? `${session.distanceDeltaKm > 0 ? '+' : ''}${session.distanceDeltaKm.toFixed(1)} km vs objetivo` : null}
                        />
                    </div>

                    <div className="mt-4 flex justify-end">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                                {open ? 'Ocultar detalle' : 'Ver detalle'}
                                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>

                <CollapsibleContent>
                    <div className="border-t border-border/70 bg-muted/[0.16] px-5 py-5">
                        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 text-primary" />
                                        <h5 className="font-medium text-foreground">Plan de la sesión</h5>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <SessionMetricCard
                                            label="Distancia objetivo"
                                            value={session.targetDistanceKm !== null ? formatDistance(session.targetDistanceKm) : '—'}
                                            hint={session.targetPace ? `Ritmo objetivo ${session.targetPace}` : null}
                                        />
                                        <SessionMetricCard
                                            label="Duración objetivo"
                                            value={session.targetDurationMin !== null ? formatHours(session.targetDurationMin) : '—'}
                                            hint={session.trainingType ? getTrainingTypeLabel(session.trainingType) : null}
                                        />
                                    </div>
                                    {session.description ? (
                                        <p className="mt-4 text-sm leading-6 text-muted-foreground">{session.description}</p>
                                    ) : null}
                                    {structureLines.length > 0 ? (
                                        <div className="mt-4 space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                <RouteIcon className="h-4 w-4 text-primary" />
                                                Estructura prevista
                                            </div>
                                            <div className="space-y-2">
                                                {structureLines.map((line, index) => (
                                                    <div key={`${session.id}-structure-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/70" />
                                                        <span className="leading-6">{line}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    {session.coachNotes ? (
                                        <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                                <MessageSquareText className="h-4 w-4" />
                                                Notas del coach
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                                {session.coachNotes}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-emerald-600" />
                                        <h5 className="font-medium text-foreground">Ejecución real</h5>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                                        <SessionMetricCard
                                            label="Distancia real"
                                            value={session.actualDistanceKm !== null ? formatDistance(session.actualDistanceKm) : 'Sin registrar'}
                                            hint={session.distanceProgressPct !== null ? `${formatPct(session.distanceProgressPct)} del objetivo` : null}
                                        />
                                        <SessionMetricCard
                                            label="Tiempo real"
                                            value={session.actualDurationMin !== null ? formatHours(session.actualDurationMin) : 'Sin registrar'}
                                            hint={session.durationProgressPct !== null ? `${formatPct(session.durationProgressPct)} del objetivo` : null}
                                        />
                                        <SessionMetricCard
                                            label="Ritmo medio"
                                            value={session.actualAvgPace || session.targetPace || '—'}
                                            hint={session.actualAvgPace ? 'Registrado por el cliente' : session.targetPace ? 'Objetivo del plan' : null}
                                        />
                                        <SessionMetricCard
                                            label="Esfuerzo"
                                            value={session.rpe !== null ? `RPE ${session.rpe}/10` : '—'}
                                            hint={session.avgHeartRate !== null || session.maxHeartRate !== null
                                                ? `FC media ${session.avgHeartRate ?? '—'} · máxima ${session.maxHeartRate ?? '—'}`
                                                : null}
                                        />
                                    </div>
                                    {session.feedbackNotes ? (
                                        <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                                                <MessageSquareText className="h-4 w-4" />
                                                Feedback del cliente
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                                {session.feedbackNotes}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-primary" />
                                        <h5 className="font-medium text-foreground">Comparativa plan vs real</h5>
                                    </div>
                                    <div className="space-y-4">
                                        {session.targetDistanceKm !== null ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Distancia</span>
                                                    <span className="font-medium text-foreground">
                                                        {(session.actualDistanceKm ?? 0).toFixed(1)} km de {session.targetDistanceKm.toFixed(1)} km
                                                    </span>
                                                </div>
                                                <Progress value={clampProgress(session.distanceProgressPct)} className="h-2.5 bg-muted" />
                                            </div>
                                        ) : null}

                                        {session.targetDurationMin !== null ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Tiempo</span>
                                                    <span className="font-medium text-foreground">
                                                        {formatHours(session.actualDurationMin ?? 0)} de {formatHours(session.targetDurationMin)}
                                                    </span>
                                                </div>
                                                <Progress value={clampProgress(session.durationProgressPct)} className="h-2.5 bg-muted" />
                                            </div>
                                        ) : null}

                                        {session.targetDistanceKm === null && session.targetDurationMin === null ? (
                                            <p className="text-sm text-muted-foreground">
                                                Esta sesión no tenía un objetivo cuantificado guardado. Mostramos el registro realizado y el contexto disponible.
                                            </p>
                                        ) : null}

                                        <div className="grid gap-3 md:grid-cols-2">
                                            <SessionMetricCard
                                                label="Fecha"
                                                value={formatFullDate(session.scheduledDate)}
                                            />
                                            <SessionMetricCard
                                                label="Estado"
                                                value={statusMeta.label}
                                                hint={session.completionStatus === 'partial'
                                                    ? 'Hay trabajo registrado, pero no se completó toda la sesión.'
                                                    : session.completionStatus === 'not_completed'
                                                        ? 'No hay registro de ejecución para esta sesión.'
                                                        : 'La sesión quedó registrada como completada.'}
                                            />
                                        </div>
                                        {(session.avgHeartRate !== null || session.maxHeartRate !== null) ? (
                                            <div className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.05] p-4">
                                                <div className="flex items-center gap-2 text-sm font-medium text-rose-700">
                                                    <Heart className="h-4 w-4" />
                                                    Pulsaciones
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    Media {session.avgHeartRate ?? '—'} bpm · Máxima {session.maxHeartRate ?? '—'} bpm
                                                </p>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}

export function CardioProgressView({ data }: CardioProgressViewProps) {
    const [mode, setMode] = useState<MetricMode>('km')

    const statCards = [
        {
            icon: MapPin,
            label: 'Total km',
            value: `${data.totalDistanceKm.toFixed(1)} km`,
            hint: `${data.completedSessions} sesiones con trabajo registrado`,
            color: 'bg-primary/10 text-primary ring-primary/20',
        },
        {
            icon: Timer,
            label: 'Total tiempo',
            value: formatHours(data.totalDurationMin),
            hint: 'Volumen real del periodo',
            color: 'bg-sky-500/10 text-sky-600 ring-sky-500/20',
        },
        {
            icon: Activity,
            label: 'Sesiones',
            value: String(data.totalSessions),
            hint: `${data.completedSessions} completadas · ${data.totalSessions - data.completedSessions} con margen de mejora`,
            color: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20',
        },
        {
            icon: TrendingUp,
            label: 'Media/semana',
            value: mode === 'km'
                ? `${data.avgDistanceKmPerWeek.toFixed(1)} km`
                : formatHours(data.avgDurationMinPerWeek),
            hint: 'Promedio sobre semanas activas del rango',
            color: 'bg-amber-500/10 text-amber-600 ring-amber-500/20',
        },
    ]

    const chartHasActualData = data.weeks.some((week) =>
        mode === 'km' ? week.distanceKm > 0 : week.durationMin > 0
    )

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {statCards.map((card) => (
                    <StatCard
                        key={card.label}
                        icon={card.icon}
                        label={card.label}
                        value={card.value}
                        hint={card.hint}
                        color={card.color}
                    />
                ))}
            </div>

            <Card className="overflow-hidden border-border/70">
                <div className="border-b border-border/70 bg-muted/10 px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold text-foreground">Carga semanal</h3>
                            </div>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                                Evolución real del trabajo aeróbico semana a semana, con referencia al volumen planificado en el tooltip.
                            </p>
                        </div>
                        <div className="flex gap-1 rounded-xl bg-muted p-1">
                            <button
                                onClick={() => setMode('km')}
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                                    mode === 'km'
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Kilómetros
                            </button>
                            <button
                                onClick={() => setMode('horas')}
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                                    mode === 'horas'
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                Horas
                            </button>
                        </div>
                    </div>
                </div>

                <CardContent className="p-5">
                    {!data.totalSessions ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <Activity className="mb-3 h-10 w-10 opacity-30" />
                            <p className="text-sm">No hay sesiones de cardio en este período.</p>
                        </div>
                    ) : !chartHasActualData ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
                            <p className="text-sm">Hay cardio planificado, pero todavía no hay carga real registrada para dibujar la tendencia.</p>
                        </div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.weeks} margin={{ top: 10, right: 8, left: -12, bottom: 4 }}>
                                    <defs>
                                        <linearGradient id={`cardioGradient-${mode}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={mode === 'km' ? '#14b8a6' : '#3b82f6'} stopOpacity={0.28} />
                                            <stop offset="100%" stopColor={mode === 'km' ? '#14b8a6' : '#3b82f6'} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                                    <XAxis
                                        dataKey="weekLabel"
                                        tick={{ fontSize: 11 }}
                                        className="text-muted-foreground"
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        className="text-muted-foreground"
                                        axisLine={false}
                                        tickLine={false}
                                        width={52}
                                        tickFormatter={(value) =>
                                            mode === 'km'
                                                ? `${value} km`
                                                : value < 60
                                                    ? `${value} min`
                                                    : `${(value / 60).toFixed(1)} h`
                                        }
                                    />
                                    <Tooltip content={<WeekTooltip mode={mode} />} />
                                    <Area
                                        type="monotone"
                                        dataKey={mode === 'km' ? 'distanceKm' : 'durationMin'}
                                        stroke={mode === 'km' ? '#14b8a6' : '#3b82f6'}
                                        strokeWidth={2.5}
                                        fill={`url(#cardioGradient-${mode})`}
                                        dot={{ r: 3, fill: mode === 'km' ? '#14b8a6' : '#3b82f6', strokeWidth: 0 }}
                                        activeDot={{ r: 5, fill: mode === 'km' ? '#14b8a6' : '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

            <section className="space-y-4">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-foreground">Sesiones de cardio</h3>
                    <p className="text-sm text-muted-foreground">
                        Compara lo planificado con lo realizado sesión a sesión y abre el detalle cuando necesites contexto adicional.
                    </p>
                </div>

                {data.sessions.length === 0 ? (
                    <Card className="border-dashed border-border/70 p-8 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                            <ClipboardList className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <h4 className="font-semibold text-foreground">Sin sesiones en el rango</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Cuando haya cardio planificado o registrado en este período, aparecerá aquí.
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {data.sessions.map((session) => (
                            <SessionCard key={session.id} session={session} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
