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
    Bike,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Dumbbell,
    Heart,
    MapPin,
    MessageSquareText,
    Route as RouteIcon,
    Timer,
    TrendingUp,
    Waves,
    Zap,
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
import { describeHrZone, HR_ZONE_NAMES, ZONE_BADGE_CLASSES, ZONE_COLORS, zonesFromHistogram } from '@/lib/training/zones'
import { getCardioStructureLines, summarizeCardioStructure } from '@/lib/cardio/structure'
import type {
    CardioProgressData,
    CardioSessionProgress,
    CardioWeekData,
} from '@/app/(coach)/coach/workspace/progress-actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetricMode = 'km' | 'horas'
type DisciplineFilter = 'all' | 'running' | 'bicicleta' | 'natacion' | 'hibrido'

export interface CardioZoneThresholds {
    /** Límites efectivos de zona [inicio Z2..Z5] — método + overrides del coach */
    runBounds: number[] | null
    bikeBounds: number[] | null
}

interface CardioProgressViewProps {
    data: CardioProgressData
    /** Límites de zona del atleta para etiquetar cada sesión */
    thresholds?: CardioZoneThresholds | null
}

// ---------------------------------------------------------------------------
// Discipline normalization
// ---------------------------------------------------------------------------

const DISCIPLINE_MAP: Record<string, DisciplineFilter> = {
    // Running
    rodaje: 'running',
    series: 'running',
    tempo: 'running',
    fartlek: 'running',
    progressive: 'running',
    progresivo: 'running',
    run: 'running',
    running: 'running',
    carrera: 'running',
    // Bicicleta
    bike: 'bicicleta',
    bici: 'bicicleta',
    bicicleta: 'bicicleta',
    cycling: 'bicicleta',
    ciclismo: 'bicicleta',
    // Natación
    swim: 'natacion',
    swimming: 'natacion',
    natacion: 'natacion',
    natación: 'natacion',
    // Híbrido
    hybrid: 'hibrido',
    hibrido: 'hibrido',
    híbrido: 'hibrido',
    hyrox: 'hibrido',
    mixed: 'hibrido',
}

function getDiscipline(trainingType: string | null): Exclude<DisciplineFilter, 'all'> {
    if (!trainingType) return 'running'
    const key = trainingType.toLowerCase().trim()
    return (DISCIPLINE_MAP[key] as Exclude<DisciplineFilter, 'all'>) ?? 'running'
}

const DISCIPLINE_META: Record<Exclude<DisciplineFilter, 'all'>, {
    label: string
    icon: React.ElementType
    badgeClass: string
    filterClass: string
}> = {
    running: {
        label: 'Running',
        icon: RouteIcon,
        badgeClass: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-400',
        filterClass: 'data-[active=true]:bg-teal-500/10 data-[active=true]:text-teal-700 data-[active=true]:border-teal-500/30',
    },
    bicicleta: {
        label: 'Bicicleta',
        icon: Bike,
        badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        filterClass: 'data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-700 data-[active=true]:border-amber-500/30',
    },
    natacion: {
        label: 'Natación',
        icon: Waves,
        badgeClass: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
        filterClass: 'data-[active=true]:bg-blue-500/10 data-[active=true]:text-blue-700 data-[active=true]:border-blue-500/30',
    },
    hibrido: {
        label: 'Híbrido',
        icon: Zap,
        badgeClass: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400',
        filterClass: 'data-[active=true]:bg-violet-500/10 data-[active=true]:text-violet-700 data-[active=true]:border-violet-500/30',
    },
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const cardioTypeLabels: Record<string, string> = {
    rodaje: 'Rodaje',
    series: 'Series',
    tempo: 'Tempo',
    fartlek: 'Fartlek',
    progressive: 'Progresivo',
    progresivo: 'Progresivo',
    hybrid: 'Híbrido',
    hibrido: 'Híbrido',
    bike: 'Bicicleta',
    bicicleta: 'Bicicleta',
    swim: 'Natación',
    natacion: 'Natación',
    natación: 'Natación',
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

function formatMeters(meters: number | null) {
    if (meters === null || !Number.isFinite(meters)) return '—'
    if (Math.abs(meters) < 1000) return `${Math.round(meters)} m`
    const km = meters / 1000
    return `${Number.isInteger(km) ? km : km.toFixed(2)} km`
}

function formatSeconds(seconds: number | null) {
    if (seconds === null || !Number.isFinite(seconds)) return '—'
    const sign = seconds < 0 ? '-' : ''
    const abs = Math.abs(seconds)
    const minutes = Math.round(abs / 60)
    if (minutes < 60) return `${sign}${minutes} min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${sign}${h}h${m ? ` ${m}min` : ''}`
}

function formatPaceSeconds(seconds: number | null) {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—'
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60).toString().padStart(2, '0')
    return `${minutes}:${secs}/km`
}

function paceToSeconds(value: string | null) {
    if (!value) return null
    const match = value.match(/(\d+):(\d{2})/)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
}

function formatDistanceDelta(km: number | null) {
    if (km === null || !Number.isFinite(km)) return 'Sin objetivo'
    const sign = km > 0 ? '+' : ''
    return `${sign}${km.toFixed(2)} km vs plan`
}

function formatSegmentDelta(delta: number | null, unit: string | null) {
    if (delta === null || !unit) return '—'
    const sign = delta > 0 ? '+' : ''
    if (unit === 'm') return `${sign}${Math.round(delta)} m`
    if (unit === 's') return `${sign}${formatSeconds(delta)}`
    return `${sign}${delta}`
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
    if (!trainingType) return null
    return cardioTypeLabels[trainingType.toLowerCase()] || `${trainingType.charAt(0).toUpperCase()}${trainingType.slice(1)}`
}

function averageNumber(values: (number | null)[]) {
    const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value))
    if (numbers.length === 0) return null
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

// ---------------------------------------------------------------------------
// Week re-aggregation (client-side, for filtered views)
// ---------------------------------------------------------------------------

function reaggregateWeeks(
    baseWeeks: CardioWeekData[],
    sessions: CardioSessionProgress[]
): CardioWeekData[] {
    const weekMap = new Map<string, CardioWeekData>(
        baseWeeks.map(w => [
            w.weekStart,
            {
                ...w,
                distanceKm: 0,
                durationMin: 0,
                sessionsCount: 0,
                plannedDistanceKm: 0,
                plannedDurationMin: 0,
                plannedSessionsCount: 0,
            },
        ])
    )

    for (const s of sessions) {
        const d = new Date(s.scheduledDate + 'T12:00:00')
        const dow = (d.getDay() + 6) % 7
        d.setDate(d.getDate() - dow)
        const key = d.toISOString().split('T')[0]

        if (weekMap.has(key)) {
            const w = weekMap.get(key)!
            w.plannedSessionsCount += 1
            w.plannedDistanceKm += s.targetDistanceKm ?? 0
            w.plannedDurationMin += s.targetDurationMin ?? 0
            const hasActualWork = (s.actualDistanceKm ?? 0) > 0 || (s.actualDurationMin ?? 0) > 0
            if (hasActualWork || s.isCompleted) {
                w.distanceKm += s.actualDistanceKm ?? 0
                w.durationMin += s.actualDurationMin ?? 0
                w.sessionsCount += 1
            }
        }
    }

    return Array.from(weekMap.values())
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function DisciplineBadge({ trainingType }: { trainingType: string | null }) {
    const discipline = getDiscipline(trainingType)
    const meta = DISCIPLINE_META[discipline]
    const Icon = meta.icon
    return (
        <Badge variant="outline" className={cn('gap-1', meta.badgeClass)}>
            <Icon className="h-3 w-3" />
            {meta.label}
        </Badge>
    )
}

function WeeklyAnalysisSummary({ weeks, sessions }: { weeks: CardioWeekData[]; sessions: CardioSessionProgress[] }) {
    const plannedKm = weeks.reduce((sum, week) => sum + week.plannedDistanceKm, 0)
    const actualKm = weeks.reduce((sum, week) => sum + week.distanceKm, 0)
    const diffKm = actualKm - plannedKm
    const avgRpe = averageNumber(sessions.map((session) => session.rpe))
    const avgHr = averageNumber(sessions.map((session) => session.avgHeartRate))
    const totalSeconds = sessions.reduce((sum, session) => sum + ((session.actualDurationMin ?? 0) * 60), 0)
    const totalDistance = sessions.reduce((sum, session) => sum + (session.actualDistanceKm ?? 0), 0)
    const avgPace = totalDistance > 0 && totalSeconds > 0 ? totalSeconds / totalDistance : null
    const reviewCount = sessions.filter((session) =>
        session.feedbackNotes
        || session.completionStatus === 'partial'
        || (session.distanceDeltaKm !== null && Math.abs(session.distanceDeltaKm) >= 1)
    ).length

    return (
        <Card className="overflow-hidden border-border/70 bg-card/95">
            <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resumen del periodo</p>
                        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                {actualKm.toFixed(1)} km
                            </span>
                            <span className="text-sm text-muted-foreground">
                                hechos / {plannedKm.toFixed(1)} km planificados
                            </span>
                            <span className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-semibold',
                                diffKm >= 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                            )}>
                                {diffKm >= 0 ? '+' : ''}{diffKm.toFixed(1)} km
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                        <SessionMetricCard label="RPE medio" value={avgRpe !== null ? `${avgRpe.toFixed(1)}/10` : '—'} />
                        <SessionMetricCard label="FC media" value={avgHr !== null ? `${Math.round(avgHr)} ppm` : '—'} />
                        <SessionMetricCard label="Ritmo medio" value={formatPaceSeconds(avgPace)} />
                        <SessionMetricCard label="Por revisar" value={String(reviewCount)} />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function SegmentExecutionView({ session }: { session: CardioSessionProgress }) {
    const segments = session.analysisSegments || []
    if (segments.length === 0) {
        return (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                No hay segmentos suficientes para analizar esta actividad.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="md:hidden space-y-3">
                {segments.map((segment, index) => (
                    <div key={`${session.id}-segment-mobile-${index}`} className="rounded-2xl border border-border/70 bg-background/90 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-foreground">{segment.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{segment.targetSummary}</p>
                            </div>
                            <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                                {segment.kind}
                            </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Real</p>
                                <p className="font-medium text-foreground">{segment.actualSummary}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Ritmo</p>
                                <p className="font-medium text-foreground">{formatPaceSeconds(segment.avgPaceSecondsPerKm)}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">FC media</p>
                                <p className="font-medium text-foreground">{segment.avgHeartRate !== null ? `${segment.avgHeartRate} ppm` : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground">Diferencia</p>
                                <p className="font-medium text-foreground">{formatSegmentDelta(segment.delta, segment.deltaUnit)}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-background/90 md:block">
                <table className="w-full text-sm">
                    <thead className="border-b border-border/70 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Bloque</th>
                            <th className="px-4 py-3 text-left font-medium">Objetivo</th>
                            <th className="px-4 py-3 text-left font-medium">Real</th>
                            <th className="px-4 py-3 text-left font-medium">Ritmo</th>
                            <th className="px-4 py-3 text-left font-medium">FC media</th>
                            <th className="px-4 py-3 text-left font-medium">FC máx</th>
                            <th className="px-4 py-3 text-left font-medium">Dif.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {segments.map((segment, index) => (
                            <tr key={`${session.id}-segment-${index}`} className="border-b border-border/50 last:border-0">
                                <td className="px-4 py-3 font-medium text-foreground">{segment.label}</td>
                                <td className="px-4 py-3 text-muted-foreground">{segment.targetSummary}</td>
                                <td className="px-4 py-3 text-foreground">{segment.actualSummary}</td>
                                <td className="px-4 py-3 text-foreground">{formatPaceSeconds(segment.avgPaceSecondsPerKm)}</td>
                                <td className="px-4 py-3 text-muted-foreground">{segment.avgHeartRate !== null ? `${segment.avgHeartRate} ppm` : '—'}</td>
                                <td className="px-4 py-3 text-muted-foreground">{segment.maxHeartRate !== null ? `${segment.maxHeartRate} ppm` : '—'}</td>
                                <td className="px-4 py-3 text-muted-foreground">{formatSegmentDelta(segment.delta, segment.deltaUnit)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function ExecutionCharts({ session }: { session: CardioSessionProgress }) {
    const points = session.chartPoints || []
    if (points.length < 2) {
        return (
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                No hay streams suficientes para dibujar ritmo y pulso. Se muestra la tabla con el mejor dato disponible.
            </div>
        )
    }

    const xKey = session.chartAxis === 'time' ? 'timeMin' : 'distanceKm'
    const xLabel = session.chartAxis === 'time' ? 'min' : 'km'

    return (
        <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <h5 className="font-medium text-foreground">Ritmo</h5>
                </div>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}${xLabel}`} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatPaceSeconds} axisLine={false} tickLine={false} width={58} />
                            <Tooltip
                                formatter={(value) => [formatPaceSeconds(Number(value)), 'Ritmo']}
                                labelFormatter={(value) => `${value} ${xLabel}`}
                            />
                            <Area type="monotone" dataKey="paceSecondsPerKm" stroke="#2563eb" fill="#2563eb22" strokeWidth={2} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                    <Heart className="h-4 w-4 text-rose-600" />
                    <h5 className="font-medium text-foreground">Pulso</h5>
                </div>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}${xLabel}`} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `${value}`} axisLine={false} tickLine={false} width={42} />
                            <Tooltip
                                formatter={(value) => [`${Math.round(Number(value))} ppm`, 'Pulso']}
                                labelFormatter={(value) => `${value} ${xLabel}`}
                            />
                            <Area type="monotone" dataKey="heartRate" stroke="#e11d48" fill="#e11d4822" strokeWidth={2} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}

function SessionCard({ session, thresholds }: { session: CardioSessionProgress; thresholds?: CardioZoneThresholds | null }) {
    const [open, setOpen] = useState(false)
    const statusMeta = getSessionStatusMeta(session)
    const StatusIcon = statusMeta.icon
    const displayMetric = getDisplayMetric(session)
    const structureLines = useMemo(() => getCardioStructureLines(session.plannedStructure), [session.plannedStructure])
    const compactStructure = useMemo(() => summarizeCardioStructure(session.plannedStructure), [session.plannedStructure])
    const progressPct = displayMetric.progressPct
    const overTarget = progressPct !== null && progressPct > 100
    const subtypeLabel = getTrainingTypeLabel(session.trainingType)
    const discipline = getDiscipline(session.trainingType)
    const disciplineMeta = DISCIPLINE_META[discipline]

    // Límites de zona según la disciplina (bici usa sus propios límites)
    const boundsForDiscipline = discipline === 'bicicleta'
        ? (thresholds?.bikeBounds ?? thresholds?.runBounds ?? null)
        : (thresholds?.runBounds ?? null)

    // Distribución real intra-sesión desde el stream de Strava; si no hay,
    // aproximación por FC media
    const zoneDistribution = zonesFromHistogram(session.hrHistogram, boundsForDiscipline)
    const dominantZoneIndex = zoneDistribution
        ? zoneDistribution.secondsByZone.indexOf(Math.max(...zoneDistribution.secondsByZone))
        : null
    const hrZone = zoneDistribution && dominantZoneIndex !== null
        ? {
            zone: dominantZoneIndex + 1,
            name: HR_ZONE_NAMES[dominantZoneIndex],
            label: `Z${dominantZoneIndex + 1} · ${HR_ZONE_NAMES[dominantZoneIndex]}`,
            badgeClass: ZONE_BADGE_CLASSES[dominantZoneIndex + 1],
        }
        : boundsForDiscipline && session.avgHeartRate
            ? describeHrZone(boundsForDiscipline, session.avgHeartRate)
            : null
    const mainDistance = session.actualDistanceKm ?? session.targetDistanceKm
    const distanceDeltaLabel = session.distanceDeltaKm !== null
        ? formatDistanceDelta(session.distanceDeltaKm)
        : session.targetDistanceKm !== null
            ? `${formatDistance(session.targetDistanceKm)} programados`
            : 'Sin objetivo de km'
    const feedbackPreview = session.feedbackNotes?.trim()
    const avgPaceSeconds = paceToSeconds(session.actualAvgPace)

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card className="overflow-hidden border-border/70 bg-card/95">
                <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <DisciplineBadge trainingType={session.trainingType} />
                                <Badge variant="outline" className={statusMeta.className}>
                                    <StatusIcon className="mr-1 h-3.5 w-3.5" />
                                    {statusMeta.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{formatDate(session.scheduledDate)}</span>
                            </div>
                            <div className="min-w-0">
                                <h4 className="break-words text-base font-semibold text-foreground sm:text-lg">{session.title}</h4>
                                {subtypeLabel && subtypeLabel.toLowerCase() !== session.title.toLowerCase() && (
                                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                                        <span className={cn('inline-flex items-center gap-1', disciplineMeta.badgeClass.split(' ').find(c => c.startsWith('text-')))}>
                                            {subtypeLabel}
                                        </span>
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                                <span className="text-3xl font-bold tracking-tight text-foreground">
                                    {mainDistance !== null && mainDistance !== undefined ? formatDistance(mainDistance) : 'Sin km'}
                                </span>
                                <span className={cn(
                                    'pb-1 text-sm font-semibold',
                                    session.distanceDeltaKm !== null && session.distanceDeltaKm >= 0 ? 'text-emerald-700' : 'text-amber-700'
                                )}>
                                    {distanceDeltaLabel}
                                </span>
                            </div>
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                <span>
                                    Ritmo {session.actualAvgPace || '—'} · FC {session.avgHeartRate ?? '—'}{session.maxHeartRate !== null ? `/${session.maxHeartRate}` : ''} · RPE {session.rpe !== null ? `${session.rpe}/10` : '—'}
                                </span>
                                {hrZone && (
                                    <span
                                        className={cn(
                                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                            hrZone.badgeClass
                                        )}
                                        title={zoneDistribution
                                            ? 'Zona dominante por tiempo real en zona (stream de Strava, zonas del atleta)'
                                            : `FC media ${session.avgHeartRate} ppm sobre las zonas configuradas del atleta`}
                                    >
                                        {hrZone.label}
                                    </span>
                                )}
                                {zoneDistribution && (
                                    <span
                                        className="inline-flex h-2 w-28 overflow-hidden rounded-full"
                                        title={zoneDistribution.secondsByZone
                                            .map((secs, i) => secs > 0 ? `Z${i + 1} ${Math.round((secs / zoneDistribution.totalSeconds) * 100)}%` : null)
                                            .filter(Boolean)
                                            .join(' · ')}
                                    >
                                        {zoneDistribution.secondsByZone.map((secs, i) => (
                                            secs > 0 ? (
                                                <span
                                                    key={i}
                                                    className={cn('h-full', ZONE_COLORS[i])}
                                                    style={{ width: `${(secs / zoneDistribution.totalSeconds) * 100}%` }}
                                                />
                                            ) : null
                                        ))}
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="w-full space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 xl:max-w-sm">
                            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                                <span>Cumplimiento</span>
                                <span>{formatPct(progressPct)}</span>
                            </div>
                            <Progress value={clampProgress(progressPct)} className="h-2.5 bg-muted" />
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span className="min-w-0 truncate">{displayMetric.summary}</span>
                                {overTarget ? (
                                    <span className="shrink-0 font-medium text-emerald-700">+{Math.round((progressPct ?? 0) - 100)}%</span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {feedbackPreview ? (
                        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2 text-sm leading-6 text-muted-foreground">
                            <span className="font-medium text-emerald-700">Feedback: </span>
                            <span className="break-words line-clamp-2">{feedbackPreview}</span>
                        </div>
                    ) : null}

                    {compactStructure ? (
                        <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
                            <span className="font-medium text-foreground">Plan: </span>
                            <span className="break-words">{compactStructure}</span>
                        </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <SessionMetricCard label="Ritmo" value={session.actualAvgPace || '—'} hint={avgPaceSeconds ? `${formatPaceSeconds(avgPaceSeconds)}` : null} />
                        <SessionMetricCard label="RPE" value={session.rpe !== null ? `${session.rpe}/10` : '—'} />
                        <SessionMetricCard label="Pulso" value={session.avgHeartRate !== null ? `${session.avgHeartRate} ppm` : '—'} hint={session.maxHeartRate !== null ? `Max ${session.maxHeartRate} ppm` : null} />
                        <SessionMetricCard label="Tiempo" value={session.actualDurationMin !== null ? formatHours(session.actualDurationMin) : '—'} hint={session.durationDeltaMin !== null ? `${session.durationDeltaMin > 0 ? '+' : ''}${session.durationDeltaMin.toFixed(0)} min vs plan` : null} />
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
                    <div className="space-y-5 border-t border-border/70 bg-muted/[0.16] px-4 py-5 sm:px-5">
                        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                            <div className="mb-4 flex items-center gap-2">
                                <Activity className="h-4 w-4 text-emerald-600" />
                                <h5 className="font-medium text-foreground">Análisis de la sesión</h5>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                                <SessionMetricCard label="Km hechos" value={session.actualDistanceKm !== null ? formatDistance(session.actualDistanceKm) : 'Sin km'} hint={distanceDeltaLabel} />
                                <SessionMetricCard label="Ritmo medio" value={session.actualAvgPace || '—'} />
                                <SessionMetricCard label="RPE" value={session.rpe !== null ? `${session.rpe}/10` : '—'} />
                                <SessionMetricCard label="FC media" value={session.avgHeartRate !== null ? `${session.avgHeartRate} ppm` : '—'} />
                                <SessionMetricCard label="FC máxima" value={session.maxHeartRate !== null ? `${session.maxHeartRate} ppm` : '—'} />
                            </div>
                            {session.feedbackNotes ? (
                                <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                                        <MessageSquareText className="h-4 w-4" />
                                        Feedback del atleta
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                                        {session.feedbackNotes}
                                    </p>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-primary" />
                                <h5 className="font-medium text-foreground">Entreno programado</h5>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <SessionMetricCard label="Fecha" value={formatFullDate(session.scheduledDate)} />
                                <SessionMetricCard label="Objetivo km" value={session.targetDistanceKm !== null ? formatDistance(session.targetDistanceKm) : '—'} />
                                <SessionMetricCard label="Objetivo tiempo" value={session.targetDurationMin !== null ? formatHours(session.targetDurationMin) : '—'} />
                                <SessionMetricCard label="Ritmo objetivo" value={session.targetPace || '—'} />
                            </div>
                            {session.description && (!compactStructure || session.description.trim() !== compactStructure.trim()) ? (
                                <p className="mt-4 break-words text-sm leading-6 text-muted-foreground">{session.description}</p>
                            ) : null}
                            {structureLines.length > 0 ? (
                                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {structureLines.map((line, index) => (
                                        <div key={`${session.id}-structure-${index}`} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {session.coachNotes ? (
                                <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                                        <MessageSquareText className="h-4 w-4" />
                                        Notas del coach
                                    </div>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                                        {session.coachNotes}
                                    </p>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <RouteIcon className="h-4 w-4 text-primary" />
                                    <h5 className="font-medium text-foreground">Ejecución por bloques</h5>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    Fuente: {session.analysisSource === 'streams' ? 'streams propios' : session.analysisSource === 'laps' ? 'laps Strava' : 'resumen actividad'}
                                </span>
                            </div>
                            <SegmentExecutionView session={session} />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                <h5 className="font-medium text-foreground">Gráficas</h5>
                                <span className="text-xs text-muted-foreground">
                                    eje por {session.chartAxis === 'time' ? 'tiempo' : 'distancia'}
                                </span>
                            </div>
                            <ExecutionCharts session={session} />
                        </div>
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}

// ---------------------------------------------------------------------------
// Discipline filter pills
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { value: DisciplineFilter; label: string; icon: React.ElementType }[] = [
    { value: 'all', label: 'Todos', icon: Activity },
    { value: 'running', label: 'Running', icon: RouteIcon },
    { value: 'bicicleta', label: 'Bicicleta', icon: Bike },
    { value: 'natacion', label: 'Natación', icon: Waves },
    { value: 'hibrido', label: 'Híbrido', icon: Zap },
]

function DisciplineFilterBar({
    value,
    onChange,
    sessionCounts,
}: {
    value: DisciplineFilter
    onChange: (v: DisciplineFilter) => void
    sessionCounts: Record<DisciplineFilter, number>
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => {
                const isActive = value === opt.value
                const count = sessionCounts[opt.value]
                const disciplineMeta = opt.value !== 'all' ? DISCIPLINE_META[opt.value] : null
                const Icon = opt.icon

                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        data-active={isActive}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                            'border-border/70 text-muted-foreground hover:text-foreground hover:border-border',
                            isActive && opt.value === 'all' && 'border-foreground/20 bg-foreground/5 text-foreground',
                            isActive && disciplineMeta && disciplineMeta.badgeClass,
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                        {count > 0 && (
                            <span className={cn(
                                'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                                isActive ? 'bg-current/10' : 'bg-muted text-muted-foreground'
                            )}>
                                {count}
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Distribución de tiempo por zonas de FC
// ---------------------------------------------------------------------------

function ZoneDistributionCard({
    sessions,
    thresholds,
}: {
    sessions: CardioSessionProgress[]
    thresholds?: CardioZoneThresholds | null
}) {
    const distribution = useMemo(() => {
        if (!thresholds || (!thresholds.runBounds && !thresholds.bikeBounds)) return null

        const minutesByZone = [0, 0, 0, 0, 0]
        let classifiedMinutes = 0
        let unclassifiedMinutes = 0
        let exactSessions = 0
        let approxSessions = 0

        for (const session of sessions) {
            const discipline = getDiscipline(session.trainingType)
            const bounds = discipline === 'bicicleta'
                ? (thresholds.bikeBounds ?? thresholds.runBounds)
                : thresholds.runBounds
            if (!bounds) continue

            // 1º: distribución real intra-sesión desde el stream de Strava
            const real = zonesFromHistogram(session.hrHistogram, bounds)
            if (real) {
                real.secondsByZone.forEach((secs, i) => { minutesByZone[i] += secs / 60 })
                classifiedMinutes += real.totalSeconds / 60
                exactSessions += 1
                continue
            }

            // 2º: aproximación por FC media de la sesión
            const duration = session.actualDurationMin
            if (!duration || duration <= 0) continue
            const zoneInfo = session.avgHeartRate ? describeHrZone(bounds, session.avgHeartRate) : null
            if (zoneInfo) {
                minutesByZone[zoneInfo.zone - 1] += duration
                classifiedMinutes += duration
                approxSessions += 1
            } else {
                unclassifiedMinutes += duration
            }
        }

        if (classifiedMinutes === 0) return null

        const pct = (min: number) => (min / classifiedMinutes) * 100
        return {
            minutesByZone,
            classifiedMinutes,
            unclassifiedMinutes,
            exactSessions,
            approxSessions,
            lowPct: pct(minutesByZone[0] + minutesByZone[1]),
            midPct: pct(minutesByZone[2]),
            highPct: pct(minutesByZone[3] + minutesByZone[4]),
        }
    }, [sessions, thresholds])

    if (!distribution) return null

    return (
        <Card className="overflow-hidden border-border/70">
            <div className="border-b border-border/70 bg-muted/10 px-5 py-4">
                <h4 className="font-semibold text-foreground">Distribución por zonas de FC</h4>
                <p className="text-xs text-muted-foreground">
                    Tiempo en cada zona según la FC media de cada sesión (método Friel).
                </p>
            </div>
            <div className="space-y-4 p-5">
                {/* Barra apilada */}
                <div className="flex h-4 w-full overflow-hidden rounded-full">
                    {distribution.minutesByZone.map((minutes, index) => {
                        if (minutes <= 0) return null
                        return (
                            <div
                                key={index}
                                className={cn('h-full transition-all', ZONE_COLORS[index])}
                                style={{ width: `${(minutes / distribution.classifiedMinutes) * 100}%` }}
                                title={`Z${index + 1} ${HR_ZONE_NAMES[index]} · ${formatHours(minutes)}`}
                            />
                        )
                    })}
                </div>

                {/* Desglose por zona */}
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {distribution.minutesByZone.map((minutes, index) => {
                        if (minutes <= 0) return null
                        const share = (minutes / distribution.classifiedMinutes) * 100
                        return (
                            <div key={index} className="flex items-center gap-2 text-sm">
                                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', ZONE_COLORS[index])} />
                                <span className="w-7 shrink-0 font-semibold">Z{index + 1}</span>
                                <span className="w-24 shrink-0 text-muted-foreground">{HR_ZONE_NAMES[index]}</span>
                                <span className="font-medium tabular-nums">{formatHours(minutes)}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">· {Math.round(share)}%</span>
                            </div>
                        )
                    })}
                </div>

                {/* Lectura polarizada */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-sm">
                    <span>
                        Baja (Z1-Z2): <span className="font-semibold text-emerald-600 tabular-nums">{Math.round(distribution.lowPct)}%</span>
                    </span>
                    <span>
                        Media (Z3): <span className="font-semibold text-yellow-600 tabular-nums">{Math.round(distribution.midPct)}%</span>
                    </span>
                    <span>
                        Alta (Z4-Z5): <span className="font-semibold text-red-500 tabular-nums">{Math.round(distribution.highPct)}%</span>
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                        Referencia polarizada: ~80% baja · ~20% alta
                    </span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                    {distribution.exactSessions > 0
                        ? `${distribution.exactSessions} sesión${distribution.exactSessions !== 1 ? 'es' : ''} con distribución real del pulsómetro (segundo a segundo)`
                        : 'Sin streams de FC disponibles'}
                    {distribution.approxSessions > 0
                        ? ` · ${distribution.approxSessions} aproximada${distribution.approxSessions !== 1 ? 's' : ''} por FC media`
                        : ''}
                    {distribution.unclassifiedMinutes > 0
                        ? ` · ${formatHours(distribution.unclassifiedMinutes)} sin FC, excluidas`
                        : ''}.
                </p>
            </div>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CardioProgressView({ data, thresholds }: CardioProgressViewProps) {
    const [mode, setMode] = useState<MetricMode>('km')
    const [disciplineFilter, setDisciplineFilter] = useState<DisciplineFilter>('all')

    // Count sessions per discipline (for filter pill badges)
    const sessionCounts = useMemo((): Record<DisciplineFilter, number> => {
        const counts: Record<DisciplineFilter, number> = {
            all: data.sessions.length,
            running: 0,
            bicicleta: 0,
            natacion: 0,
            hibrido: 0,
        }
        for (const s of data.sessions) {
            const d = getDiscipline(s.trainingType)
            counts[d] += 1
        }
        return counts
    }, [data.sessions])

    // Filter sessions by discipline
    const filteredSessions = useMemo(() =>
        disciplineFilter === 'all'
            ? data.sessions
            : data.sessions.filter(s => getDiscipline(s.trainingType) === disciplineFilter),
        [data.sessions, disciplineFilter]
    )

    // Recalculate week data from filtered sessions
    const filteredWeeks = useMemo(() =>
        disciplineFilter === 'all'
            ? data.weeks
            : reaggregateWeeks(data.weeks, filteredSessions),
        [data.weeks, filteredSessions, disciplineFilter]
    )

    // Recalculate KPIs from filtered data
    const kpis = useMemo(() => {
        const totalDistanceKm = filteredWeeks.reduce((a, w) => a + w.distanceKm, 0)
        const totalDurationMin = filteredWeeks.reduce((a, w) => a + w.durationMin, 0)
        const totalSessions = filteredSessions.length
        const completedSessions = filteredSessions.filter(s => s.completionStatus === 'completed').length
        const weeksWithData = filteredWeeks.filter(w => w.plannedSessionsCount > 0 || w.sessionsCount > 0).length || 1
        return {
            totalDistanceKm,
            totalDurationMin,
            totalSessions,
            completedSessions,
            avgDistanceKmPerWeek: totalDistanceKm / weeksWithData,
            avgDurationMinPerWeek: totalDurationMin / weeksWithData,
        }
    }, [filteredWeeks, filteredSessions])

    const chartHasActualData = filteredWeeks.some((week) =>
        mode === 'km' ? week.distanceKm > 0 : week.durationMin > 0
    )

    const activeFilterLabel = disciplineFilter === 'all'
        ? null
        : DISCIPLINE_META[disciplineFilter].label

    const statCards = [
        {
            icon: MapPin,
            label: 'Total km',
            value: `${kpis.totalDistanceKm.toFixed(1)} km`,
            hint: `${kpis.completedSessions} sesiones con trabajo registrado`,
            color: 'bg-primary/10 text-primary ring-primary/20',
        },
        {
            icon: Timer,
            label: 'Total tiempo',
            value: formatHours(kpis.totalDurationMin),
            hint: 'Volumen real del periodo',
            color: 'bg-sky-500/10 text-sky-600 ring-sky-500/20',
        },
        {
            icon: Activity,
            label: 'Sesiones',
            value: String(kpis.totalSessions),
            hint: `${kpis.completedSessions} completadas · ${kpis.totalSessions - kpis.completedSessions} con margen de mejora`,
            color: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20',
        },
        {
            icon: TrendingUp,
            label: 'Media/semana',
            value: mode === 'km'
                ? `${kpis.avgDistanceKmPerWeek.toFixed(1)} km`
                : formatHours(kpis.avgDurationMinPerWeek),
            hint: 'Promedio sobre semanas activas del rango',
            color: 'bg-amber-500/10 text-amber-600 ring-amber-500/20',
        },
    ]

    return (
        <div className="space-y-6">
            {/* Filter pills */}
            <DisciplineFilterBar
                value={disciplineFilter}
                onChange={setDisciplineFilter}
                sessionCounts={sessionCounts}
            />

            <WeeklyAnalysisSummary weeks={filteredWeeks} sessions={filteredSessions} />

            {/* KPI Cards — recalculated with filter */}
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

            {/* Distribución de intensidad — solo con umbrales configurados */}
            <ZoneDistributionCard sessions={filteredSessions} thresholds={thresholds} />

            {/* Chart — recalculated with filter */}
            <Card className="overflow-hidden border-border/70">
                <div className="border-b border-border/70 bg-muted/10 px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold text-foreground">
                                    Carga semanal
                                    {activeFilterLabel && (
                                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                                            · {activeFilterLabel}
                                        </span>
                                    )}
                                </h3>
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
                    {!kpis.totalSessions ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            {activeFilterLabel
                                ? (() => {
                                    const Icon = disciplineFilter !== 'all' ? DISCIPLINE_META[disciplineFilter].icon : Activity
                                    return (
                                        <>
                                            <Icon className="mb-3 h-10 w-10 opacity-30" />
                                            <p className="text-sm">No hay sesiones de {activeFilterLabel.toLowerCase()} en este período.</p>
                                            <button
                                                onClick={() => setDisciplineFilter('all')}
                                                className="mt-3 text-xs text-primary hover:underline"
                                            >
                                                Ver todas las disciplinas
                                            </button>
                                        </>
                                    )
                                })()
                                : (
                                    <>
                                        <Activity className="mb-3 h-10 w-10 opacity-30" />
                                        <p className="text-sm">No hay sesiones de cardio en este período.</p>
                                    </>
                                )
                            }
                        </div>
                    ) : !chartHasActualData ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
                            <p className="text-sm">
                                {activeFilterLabel
                                    ? `Hay cardio de ${activeFilterLabel.toLowerCase()} planificado, pero todavía no hay carga real registrada.`
                                    : 'Hay cardio planificado, pero todavía no hay carga real registrada para dibujar la tendencia.'
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={filteredWeeks} margin={{ top: 10, right: 8, left: -12, bottom: 4 }}>
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

            {/* Sessions list — filtered */}
            <section className="space-y-4">
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-foreground">
                        Sesiones de cardio
                        {activeFilterLabel && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">· {activeFilterLabel}</span>
                        )}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Compara lo planificado con lo realizado sesión a sesión y abre el detalle cuando necesites contexto adicional.
                    </p>
                </div>

                {filteredSessions.length === 0 ? (
                    <Card className="border-dashed border-border/70 p-8 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                            {disciplineFilter !== 'all'
                                ? (() => {
                                    const Icon = DISCIPLINE_META[disciplineFilter].icon
                                    return <Icon className="h-5 w-5 text-muted-foreground" />
                                })()
                                : <ClipboardList className="h-5 w-5 text-muted-foreground" />
                            }
                        </div>
                        <h4 className="font-semibold text-foreground">
                            {activeFilterLabel
                                ? `Sin sesiones de ${activeFilterLabel.toLowerCase()}`
                                : 'Sin sesiones en el rango'
                            }
                        </h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {activeFilterLabel
                                ? `No hay sesiones de ${activeFilterLabel.toLowerCase()} en este período.`
                                : 'Cuando haya cardio planificado o registrado en este período, aparecerá aquí.'
                            }
                        </p>
                        {activeFilterLabel && (
                            <button
                                onClick={() => setDisciplineFilter('all')}
                                className="mt-3 text-xs text-primary hover:underline"
                            >
                                Ver todas las disciplinas
                            </button>
                        )}
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {filteredSessions.map((session) => (
                            <SessionCard key={session.id} session={session} thresholds={thresholds} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
