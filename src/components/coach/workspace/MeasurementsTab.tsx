'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    ArrowDown,
    ArrowUp,
    CalendarDays,
    Check,
    GitCompareArrows,
    Minus,
    Ruler,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CheckinWithReview } from '@/data/workspace'
import type { MetricCategory, MetricDefinition } from '@/types/metrics'

/**
 * Pestaña "Medidas": el equivalente de la galería para los datos numéricos.
 * Cada revisión enviada con métricas es un snapshot; el coach selecciona
 * hasta 4 snapshots en la línea temporal y compara la evolución en una tabla
 * con deltas entre columnas y el cambio total del periodo.
 */

const MAX_COMPARE = 4

const CATEGORY_LABELS: Record<MetricCategory, string> = {
    body: 'Medidas corporales',
    performance: 'Rendimiento',
    general: 'Generales',
}

const CATEGORY_ORDER: MetricCategory[] = ['body', 'performance', 'general']

interface Snapshot {
    checkinId: string
    /** ISO de la fecha de la revisión */
    dateIso: string
    values: Map<string, number>
}

function checkinDate(c: CheckinWithReview): string | null {
    return c.submitted_at ?? c.period_end ?? c.period_start
}

function parseSnapshotValues(payload: Record<string, unknown> | null): Map<string, number> {
    const values = new Map<string, number>()
    if (!payload) return values
    for (const [key, raw] of Object.entries(payload)) {
        if (!key.startsWith('metric_')) continue
        if (raw === null || raw === '') continue
        const value = Number(raw)
        if (Number.isFinite(value)) values.set(key.replace('metric_', ''), value)
    }
    return values
}

function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
    return new Date(iso).toLocaleDateString('es-ES', opts ?? {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

function formatValue(value: number): string {
    return value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

function formatDelta(delta: number): string {
    const rounded = Math.round(delta * 10) / 10
    return `${rounded > 0 ? '+' : ''}${formatValue(rounded)}`
}

/** Dirección sin juicio de valor: subir un brazo es bueno, subir la cintura no.
 *  Azul = sube, naranja = baja; el coach interpreta. */
function deltaClass(delta: number): string {
    if (delta > 0) return 'text-sky-600 dark:text-sky-400'
    if (delta < 0) return 'text-orange-600 dark:text-orange-400'
    return 'text-muted-foreground'
}

function DeltaIcon({ delta, className }: { delta: number; className?: string }) {
    if (delta > 0) return <ArrowUp className={className} />
    if (delta < 0) return <ArrowDown className={className} />
    return <Minus className={className} />
}

interface MeasurementsTabProps {
    checkins: CheckinWithReview[]
    metricDefinitions: MetricDefinition[]
}

export function MeasurementsTab({ checkins, metricDefinitions }: MeasurementsTabProps) {
    // Snapshots ordenados cronológicamente (más antiguo primero)
    const snapshots: Snapshot[] = useMemo(() => {
        return checkins
            .filter(c => c.type === 'checkin' && c.submitted_at)
            .map(c => ({
                checkinId: c.id,
                dateIso: checkinDate(c)!,
                values: parseSnapshotValues(c.raw_payload as Record<string, unknown> | null),
            }))
            .filter(s => s.values.size > 0)
            .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    }, [checkins])

    // Por defecto comparamos el primer y el último snapshot (el "antes y después")
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    useEffect(() => {
        if (snapshots.length === 0) {
            setSelectedIds([])
            return
        }
        setSelectedIds(
            snapshots.length === 1
                ? [snapshots[0].checkinId]
                : [snapshots[0].checkinId, snapshots[snapshots.length - 1].checkinId]
        )
    }, [snapshots])

    const toggleSelect = (checkinId: string) => {
        setSelectedIds(prev => {
            if (prev.includes(checkinId)) {
                if (prev.length <= 1) return prev // siempre al menos uno
                return prev.filter(id => id !== checkinId)
            }
            if (prev.length >= MAX_COMPARE) return prev
            return [...prev, checkinId]
        })
    }

    // Columnas seleccionadas, siempre en orden cronológico
    const selectedSnapshots = useMemo(
        () => snapshots.filter(s => selectedIds.includes(s.checkinId)),
        [snapshots, selectedIds]
    )

    // Métricas visibles: con valor en algún snapshot seleccionado, agrupadas
    // por categoría y respetando el orden configurado en la página de Métricas
    const groupedMetrics = useMemo(() => {
        const visible = metricDefinitions
            .filter(m => selectedSnapshots.some(s => s.values.has(m.id)))
            .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))

        return CATEGORY_ORDER
            .map(category => ({
                category,
                metrics: visible.filter(m => (m.category as MetricCategory) === category),
            }))
            .filter(group => group.metrics.length > 0)
    }, [metricDefinitions, selectedSnapshots])

    if (snapshots.length === 0) {
        return (
            <Card className="p-10 text-center">
                <Ruler className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Sin medidas todavía</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Cuando el atleta responda revisiones con métricas, cada envío aparecerá aquí
                    como un punto en el tiempo para comparar su evolución.
                </p>
            </Card>
        )
    }

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-5">
                {/* Cabecera */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Evolución de medidas</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                            {snapshots.length} registro{snapshots.length !== 1 ? 's' : ''}
                        </Badge>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitCompareArrows className="h-3.5 w-3.5" />
                        {selectedIds.length}/{MAX_COMPARE} fechas seleccionadas
                    </span>
                </div>

                {/* Línea temporal de snapshots */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {snapshots.map((snapshot, index) => {
                        const isSelected = selectedIds.includes(snapshot.checkinId)
                        const isFirst = index === 0
                        const isLast = index === snapshots.length - 1
                        const disabled = !isSelected && selectedIds.length >= MAX_COMPARE
                        return (
                            <button
                                key={snapshot.checkinId}
                                type="button"
                                onClick={() => toggleSelect(snapshot.checkinId)}
                                className={cn(
                                    'shrink-0 rounded-xl border px-3 py-2 text-left transition-all',
                                    isSelected
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                        : 'border-border hover:border-primary/30 hover:bg-muted/30',
                                    disabled && 'opacity-40'
                                )}
                            >
                                <div className="flex items-center gap-1.5">
                                    <CalendarDays className={cn('h-3.5 w-3.5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                                    <span className="text-xs font-semibold whitespace-nowrap">
                                        {formatDate(snapshot.dateIso, { day: 'numeric', month: 'short', year: '2-digit' })}
                                    </span>
                                    {isSelected && <Check className="h-3 w-3 text-primary" />}
                                </div>
                                <p className="mt-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                                    {snapshot.values.size} medida{snapshot.values.size !== 1 ? 's' : ''}
                                    {isFirst && ' · primera'}
                                    {isLast && ' · última'}
                                </p>
                            </button>
                        )
                    })}
                </div>

                {/* Tabla comparativa */}
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="sticky left-0 z-10 bg-background text-left px-4 py-3 font-medium text-muted-foreground min-w-[160px] sm:min-w-[200px]">
                                        Medida
                                    </th>
                                    {selectedSnapshots.map(snapshot => (
                                        <th
                                            key={snapshot.checkinId}
                                            className="text-center px-3 py-3 font-medium text-muted-foreground min-w-[110px] whitespace-nowrap"
                                        >
                                            {formatDate(snapshot.dateIso, { day: 'numeric', month: 'short', year: '2-digit' })}
                                        </th>
                                    ))}
                                    {selectedSnapshots.length >= 2 && (
                                        <th className="text-center px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">
                                            Δ total
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {groupedMetrics.map(group => (
                                    <MetricGroup
                                        key={group.category}
                                        label={CATEGORY_LABELS[group.category]}
                                        metrics={group.metrics}
                                        snapshots={selectedSnapshots}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {selectedSnapshots.length < 2 && (
                        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                            Selecciona al menos dos fechas para ver los cambios.
                        </p>
                    )}
                </Card>
            </div>
        </TooltipProvider>
    )
}

function MetricGroup({
    label,
    metrics,
    snapshots,
}: {
    label: string
    metrics: MetricDefinition[]
    snapshots: Snapshot[]
}) {
    const columns = snapshots.length + (snapshots.length >= 2 ? 2 : 1)

    return (
        <>
            <tr className="bg-muted/40">
                <td
                    colSpan={columns}
                    className="sticky left-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                    {label}
                </td>
            </tr>
            {metrics.map(metric => (
                <MetricRow key={metric.id} metric={metric} snapshots={snapshots} />
            ))}
        </>
    )
}

function MetricRow({
    metric,
    snapshots,
}: {
    metric: MetricDefinition
    snapshots: Snapshot[]
}) {
    // Primer y último snapshot seleccionados CON valor para esta métrica
    const withValue = snapshots.filter(s => s.values.has(metric.id))
    const totalDelta = withValue.length >= 2
        ? withValue[withValue.length - 1].values.get(metric.id)! - withValue[0].values.get(metric.id)!
        : null

    return (
        <tr className="border-b border-muted/30 transition-colors hover:bg-muted/10">
            <td className="sticky left-0 z-10 bg-background border-r border-muted/20 px-4 py-2.5">
                <span className="text-sm font-medium">{metric.name}</span>
                {metric.unit && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{metric.unit}</span>
                )}
            </td>

            {snapshots.map((snapshot, index) => {
                const value = snapshot.values.get(metric.id)
                if (value === undefined) {
                    return (
                        <td key={snapshot.checkinId} className="px-3 py-2.5 text-center text-muted-foreground/40">
                            —
                        </td>
                    )
                }

                // Delta respecto a la columna seleccionada anterior con valor
                const prevWithValue = snapshots
                    .slice(0, index)
                    .reverse()
                    .find(s => s.values.has(metric.id))
                const stepDelta = prevWithValue
                    ? value - prevWithValue.values.get(metric.id)!
                    : null

                return (
                    <td key={snapshot.checkinId} className="px-3 py-2.5 text-center align-middle">
                        <span className="text-sm font-semibold tabular-nums">{formatValue(value)}</span>
                        {stepDelta !== null && Math.abs(stepDelta) >= 0.05 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className={cn('ml-1.5 inline-flex items-center text-[11px] font-medium tabular-nums', deltaClass(stepDelta))}>
                                        <DeltaIcon delta={stepDelta} className="h-3 w-3" />
                                        {formatDelta(stepDelta)}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    Cambio respecto a la fecha anterior seleccionada
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </td>
                )
            })}

            {snapshots.length >= 2 && (
                <td className="px-3 py-2.5 text-center align-middle">
                    {totalDelta !== null ? (
                        <Badge
                            variant="outline"
                            className={cn(
                                'gap-1 tabular-nums text-xs',
                                Math.abs(totalDelta) < 0.05
                                    ? 'border-border bg-muted/40 text-muted-foreground'
                                    : totalDelta > 0
                                        ? 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                        : 'border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            )}
                        >
                            <DeltaIcon delta={Math.abs(totalDelta) < 0.05 ? 0 : totalDelta} className="h-3 w-3" />
                            {formatDelta(totalDelta)}
                            {metric.unit ? ` ${metric.unit}` : ''}
                        </Badge>
                    ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                </td>
            )}
        </tr>
    )
}
