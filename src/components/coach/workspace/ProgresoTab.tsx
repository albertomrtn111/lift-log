'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Area,
    AreaChart,
} from 'recharts'
import {
    Scale,
    Footprints,
    Moon,
    Apple,
    TrendingDown,
    TrendingUp,
    Minus,
    Loader2,
    CalendarDays,
    Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getProgressData, getCardioProgressData, ProgressData, CardioProgressData } from '@/app/(coach)/coach/workspace/progress-actions'
import { TrainingProgressView } from './progress/TrainingProgressView'
import { CardioProgressView } from './progress/CardioProgressView'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubTab = 'general' | 'training' | 'cardio'

// Slider works in "days since (today - MAX_DAYS_BACK)"
// 0 = MAX_DAYS_BACK days ago, MAX_DAYS_BACK = today
const MAX_DAYS_BACK = 365

interface ProgresoTabProps {
    clientId: string
    coachId: string
}

type WeightDetailRow = {
    date: string
    dateLabel: string
    weight: number | null
    delta: number | null
    steps: number | null
    sleep: number | null
    dietAdherence: number | null
}

type GeneralKpis = {
    avgWeight: number | null
    lastWeight: number | null
    weightDelta: number | null
    trainingAdherence: number | null
    completedWorkouts: number
    totalWorkouts: number
    avgDietAdherence: number | null
    avgSteps: number | null
    avgSleep: number | null
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function offsetToDate(offset: number): Date {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - (MAX_DAYS_BACK - offset))
    return d
}

function toDateStr(d: Date) {
    return d.toISOString().split('T')[0]
}

function parseDateStr(date: string) {
    return new Date(`${date}T12:00:00`)
}

function addDaysToDateStr(date: string, days: number) {
    const d = parseDateStr(date)
    d.setDate(d.getDate() + days)
    return toDateStr(d)
}

function formatLabel(d: Date) {
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDetailDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

function formatCsvNumber(value: number | null) {
    if (value === null) return ''
    return value.toFixed(1).replace('.', ',')
}

function formatCsvInteger(value: number | null) {
    if (value === null) return ''
    return String(Math.round(value))
}

function downloadWeightCsv(rows: WeightDetailRow[], dateFrom: string, dateTo: string) {
    if (rows.length === 0) return

    const header = ['Fecha', 'Peso (kg)', 'Cambio vs anterior (kg)', 'Pasos', 'Sueño (h)', 'Dieta (%)']
    const lines = rows.map(row => [
        row.date,
        formatCsvNumber(row.weight),
        formatCsvNumber(row.delta),
        formatCsvInteger(row.steps),
        formatCsvNumber(row.sleep),
        formatCsvInteger(row.dietAdherence),
    ])
    const csv = `\uFEFF${[header, ...lines].map(line => line.join(';')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pesos-${dateFrom}-${dateTo}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

function getPeriodComparisonRange(dateFrom: string, selectedDays: number) {
    return {
        from: addDaysToDateStr(dateFrom, -selectedDays),
        to: addDaysToDateStr(dateFrom, -1),
    }
}

function calculateGeneralKpis(data: ProgressData | null): GeneralKpis | null {
    if (!data) return null

    const weights = data.metrics.filter(m => m.weight_kg !== null).map(m => m.weight_kg!)
    const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : null
    const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null
    const firstWeight = weights.length > 1 ? weights[0] : null
    const weightDelta = lastWeight !== null && firstWeight !== null ? lastWeight - firstWeight : null

    const totalWorkouts = data.workoutLogs.length
    const completedWorkouts = data.workoutLogs.filter(w => w.completed).length
    const trainingAdherence = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : null

    const dietValues = data.dietAdherence.map(d => d.adherence_pct)
    const avgDietAdherence = dietValues.length > 0
        ? Math.round(dietValues.reduce((a, b) => a + b, 0) / dietValues.length)
        : null

    const stepsValues = data.metrics.filter(m => m.steps !== null).map(m => m.steps!)
    const avgSteps = stepsValues.length > 0
        ? Math.round(stepsValues.reduce((a, b) => a + b, 0) / stepsValues.length)
        : null

    const sleepValues = data.metrics.filter(m => m.sleep_h !== null).map(m => m.sleep_h!)
    const avgSleep = sleepValues.length > 0
        ? +(sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1)
        : null

    return { avgWeight, lastWeight, weightDelta, trainingAdherence, completedWorkouts, totalWorkouts, avgDietAdherence, avgSteps, avgSleep }
}

function getComparisonDelta(current: number | null | undefined, previous: number | null | undefined) {
    if (current == null || previous == null) return null
    return current - previous
}

function formatComparisonDelta(delta: number, unit?: string) {
    const sign = delta > 0 ? '+' : ''
    const value = unit === 'pasos'
        ? Math.round(delta).toLocaleString('es-ES')
        : delta.toFixed(1).replace('.0', '')
    return `${sign}${value}${unit ? ` ${unit}` : ''}`
}

// Default: last 30 days → offsets [335, 365]
const DEFAULT_OFFSETS: [number, number] = [MAX_DAYS_BACK - 30, MAX_DAYS_BACK]

// Quick presets (days back → convert to offsets)
const PRESETS: { label: string; days: number }[] = [
    { label: '7d', days: 7 },
    { label: '15d', days: 15 },
    { label: '30d', days: 30 },
    { label: '3m', days: 90 },
    { label: '6m', days: 180 },
    { label: '1 año', days: 365 },
]

// ---------------------------------------------------------------------------
// DateRangeSlider
// ---------------------------------------------------------------------------

function DateRangeSlider({
    value,
    onChange,
}: {
    value: [number, number]
    onChange: (v: [number, number]) => void
}) {
    const [localValue, setLocalValue] = useState<[number, number]>(value)

    // Sync external value changes (preset buttons)
    useEffect(() => {
        setLocalValue(value)
    }, [value])

    const dateFrom = offsetToDate(localValue[0])
    const dateTo = offsetToDate(localValue[1])
    const totalDays = localValue[1] - localValue[0]

    const handleChange = (vals: number[]) => {
        const next: [number, number] = [vals[0], vals[1]]
        setLocalValue(next)
    }

    const handleCommit = (vals: number[]) => {
        const next: [number, number] = [vals[0], vals[1]]
        onChange(next)
    }

    // Left thumb label position (as % across the track)
    const leftPct = (localValue[0] / MAX_DAYS_BACK) * 100
    const rightPct = (localValue[1] / MAX_DAYS_BACK) * 100

    return (
        <div className="space-y-4">
            {/* Slider track */}
            <div className="relative px-2.5">
                <SliderPrimitive.Root
                    min={0}
                    max={MAX_DAYS_BACK}
                    step={1}
                    value={localValue}
                    onValueChange={handleChange}
                    onValueCommit={handleCommit}
                    className="relative flex w-full touch-none select-none items-center"
                    minStepsBetweenThumbs={1}
                >
                    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
                        <SliderPrimitive.Range className="absolute h-full bg-primary" />
                    </SliderPrimitive.Track>
                    <SliderPrimitive.Thumb
                        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing shadow-sm"
                        aria-label="Fecha de inicio"
                    />
                    <SliderPrimitive.Thumb
                        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing shadow-sm"
                        aria-label="Fecha de fin"
                    />
                </SliderPrimitive.Root>

                {/* Floating date labels under each thumb */}
                <div className="relative mt-3 h-5 select-none pointer-events-none">
                    <span
                        className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-primary"
                        style={{ left: `${leftPct}%` }}
                    >
                        {formatLabel(dateFrom)}
                    </span>
                    <span
                        className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-primary"
                        style={{ left: `${rightPct}%` }}
                    >
                        {formatLabel(dateTo)}
                    </span>
                </div>
            </div>

            {/* Range summary pill */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>
                    {totalDays === 0
                        ? 'Selecciona un rango'
                        : `${totalDays} día${totalDays !== 1 ? 's' : ''} seleccionado${totalDays !== 1 ? 's' : ''}`
                    }
                </span>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// DateRangeFilter — slider + preset pills together
// ---------------------------------------------------------------------------

function DateRangeFilter({
    value,
    onChange,
}: {
    value: [number, number]
    onChange: (v: [number, number]) => void
}) {
    const activePreset = PRESETS.find(
        p => value[1] === MAX_DAYS_BACK && value[0] === MAX_DAYS_BACK - p.days
    )

    return (
        <Card className="p-4 border-border/70 space-y-4">
            {/* Preset pills */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground mr-1">Rápido:</span>
                {PRESETS.map(preset => {
                    const isActive = activePreset?.label === preset.label
                    return (
                        <button
                            key={preset.label}
                            onClick={() => onChange([MAX_DAYS_BACK - preset.days, MAX_DAYS_BACK])}
                            className={cn(
                                'rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                                isActive
                                    ? 'border-primary/30 bg-primary/10 text-primary'
                                    : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground'
                            )}
                        >
                            {preset.label}
                        </button>
                    )
                })}
            </div>

            {/* Dual-handle slider */}
            <DateRangeSlider value={value} onChange={onChange} />
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgresoTab({ clientId, coachId }: ProgresoTabProps) {
    const [subTab, setSubTab] = useState<SubTab>('general')
    const [offsets, setOffsets] = useState<[number, number]>(DEFAULT_OFFSETS)
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ProgressData | null>(null)
    const [previousData, setPreviousData] = useState<ProgressData | null>(null)
    const [cardioData, setCardioData] = useState<CardioProgressData | null>(null)
    const [cardioLoading, setCardioLoading] = useState(false)

    const dateFrom = useMemo(() => toDateStr(offsetToDate(offsets[0])), [offsets])
    const dateTo = useMemo(() => toDateStr(offsetToDate(offsets[1])), [offsets])
    const selectedDays = useMemo(() => Math.max(1, offsets[1] - offsets[0]), [offsets])

    // Debounce ref so rapid slider drags don't spam requests
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const fetchGeneral = useCallback(async (from: string, to: string) => {
        setLoading(true)
        const previousRange = getPeriodComparisonRange(from, selectedDays)
        const [result, previousResult] = await Promise.all([
            getProgressData(clientId, from, to),
            getProgressData(clientId, previousRange.from, previousRange.to),
        ])
        setData(result.success && result.data ? result.data : { metrics: [], dietAdherence: [], workoutLogs: [] })
        setPreviousData(previousResult.success && previousResult.data ? previousResult.data : { metrics: [], dietAdherence: [], workoutLogs: [] })
        setLoading(false)
    }, [clientId, selectedDays])

    const fetchCardio = useCallback(async (from: string, to: string) => {
        setCardioLoading(true)
        const result = await getCardioProgressData(clientId, from, to)
        if (result.success && result.data) setCardioData(result.data)
        setCardioLoading(false)
    }, [clientId])

    // Fetch general on mount and when dates change
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            fetchGeneral(dateFrom, dateTo)
        }, 300)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [fetchGeneral, dateFrom, dateTo])

    // Fetch cardio when on cardio tab and dates change
    useEffect(() => {
        if (subTab !== 'cardio') return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            fetchCardio(dateFrom, dateTo)
        }, 300)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [subTab, fetchCardio, dateFrom, dateTo])

    // -----------------------------------------------------------------------
    // Computed KPIs
    // -----------------------------------------------------------------------

    const kpis = useMemo(() => {
        return calculateGeneralKpis(data)
    }, [data])

    const previousKpis = useMemo(() => {
        return calculateGeneralKpis(previousData)
    }, [previousData])

    const weightChartData = useMemo(() => {
        if (!data) return []
        return data.metrics
            .filter(m => m.weight_kg !== null)
            .map(m => ({
                date: new Date(m.metric_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                rawDate: m.metric_date,
                weight: m.weight_kg,
            }))
    }, [data])

    const weightDetailRows = useMemo<WeightDetailRow[]>(() => {
        if (!data) return []
        const dietByDate = new Map(data.dietAdherence.map(entry => [entry.log_date, entry.adherence_pct]))
        const rows = data.metrics
            .filter(metric =>
                metric.weight_kg !== null ||
                metric.steps !== null ||
                metric.sleep_h !== null ||
                dietByDate.has(metric.metric_date)
            )

        let previousWeight: number | null = null
        return rows.map((metric) => {
            const currentWeight = metric.weight_kg
            const delta = currentWeight !== null && previousWeight !== null
                ? currentWeight - previousWeight
                : null
            if (currentWeight !== null) previousWeight = currentWeight

            return {
                date: metric.metric_date,
                dateLabel: formatDetailDate(metric.metric_date),
                weight: currentWeight,
                delta,
                steps: metric.steps,
                sleep: metric.sleep_h,
                dietAdherence: dietByDate.get(metric.metric_date) ?? null,
            }
        })
    }, [data])

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="space-y-6">
            {/* Sub-tab toggle */}
            <div className="flex w-fit items-center gap-1 rounded-lg border border-border/70 bg-secondary/70 p-1">
                {[
                    { key: 'general' as SubTab, label: 'General' },
                    { key: 'training' as SubTab, label: 'Entrenamiento' },
                    { key: 'cardio' as SubTab, label: 'Cardio' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setSubTab(tab.key)}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                            subTab === tab.key
                                ? "bg-background text-foreground shadow-sm dark:bg-card"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {subTab === 'training' ? (
                <TrainingProgressView clientId={clientId} coachId={coachId} />
            ) : subTab === 'cardio' ? (
                <>
                    <DateRangeFilter value={offsets} onChange={setOffsets} />
                    {cardioLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : cardioData ? (
                        <CardioProgressView data={cardioData} />
                    ) : null}
                </>
            ) : (
                <>
                    <DateRangeFilter value={offsets} onChange={setOffsets} />
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                                <KpiCard
                                    icon={Scale}
                                    label="Peso medio"
                                    value={kpis?.avgWeight != null ? `${kpis.avgWeight.toFixed(1)} kg` : null}
                                    subValue={kpis?.lastWeight != null ? `Último: ${kpis.lastWeight.toFixed(1)} kg` : undefined}
                                    delta={kpis?.weightDelta}
                                    deltaUnit="kg"
                                    comparisonDelta={getComparisonDelta(kpis?.avgWeight, previousKpis?.avgWeight)}
                                    comparisonUnit="kg"
                                    comparisonLabel={`vs ${selectedDays}d anteriores`}
                                    color="blue"
                                />
                                <KpiCard
                                    icon={Footprints}
                                    label="Pasos"
                                    value={kpis?.avgSteps != null ? kpis.avgSteps.toLocaleString('es-ES') : null}
                                    subValue="Media diaria"
                                    comparisonDelta={getComparisonDelta(kpis?.avgSteps, previousKpis?.avgSteps)}
                                    comparisonUnit="pasos"
                                    comparisonLabel={`vs ${selectedDays}d anteriores`}
                                    comparisonPositiveIsGood
                                    color="violet"
                                />
                                <KpiCard
                                    icon={Moon}
                                    label="Sueño"
                                    value={kpis?.avgSleep != null ? `${kpis.avgSleep}h` : null}
                                    subValue="Media por noche"
                                    comparisonDelta={getComparisonDelta(kpis?.avgSleep, previousKpis?.avgSleep)}
                                    comparisonUnit="h"
                                    comparisonLabel={`vs ${selectedDays}d anteriores`}
                                    comparisonPositiveIsGood
                                    color="indigo"
                                />
                                <KpiCard
                                    icon={Apple}
                                    label="Dieta"
                                    value={kpis?.avgDietAdherence != null ? `${kpis.avgDietAdherence}%` : null}
                                    subValue="Adherencia media"
                                    comparisonDelta={getComparisonDelta(kpis?.avgDietAdherence, previousKpis?.avgDietAdherence)}
                                    comparisonUnit="pp"
                                    comparisonLabel={`vs ${selectedDays}d anteriores`}
                                    comparisonPositiveIsGood
                                    color="green"
                                />
                            </div>
                            <WeightChart data={weightChartData} />
                            <WeightDetail
                                rows={weightDetailRows}
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Weight Detail
// ---------------------------------------------------------------------------

function WeightDetail({
    rows,
    dateFrom,
    dateTo,
}: {
    rows: WeightDetailRow[]
    dateFrom: string
    dateTo: string
}) {
    return (
        <Card className="p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-blue-500" />
                    <div>
                        <h3 className="font-semibold">Detalle de pesos</h3>
                        <p className="text-xs text-muted-foreground">
                            {rows.length} día{rows.length === 1 ? '' : 's'} con métricas en el rango seleccionado
                        </p>
                    </div>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 self-start sm:self-auto"
                    disabled={rows.length === 0}
                    onClick={() => downloadWeightCsv(rows, dateFrom, dateTo)}
                >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="py-4 text-sm italic text-muted-foreground">
                    No hay métricas registradas en este rango.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-[860px] w-full table-fixed">
                        <colgroup>
                            <col className="w-[34%]" />
                            <col className="w-[13%]" />
                            <col className="w-[15%]" />
                            <col className="w-[14%]" />
                            <col className="w-[12%]" />
                            <col className="w-[12%]" />
                        </colgroup>
                        <thead className="border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left">Fecha</th>
                                <th className="px-3 py-2 text-right">Peso</th>
                                <th className="px-3 py-2 text-right">Cambio</th>
                                <th className="px-3 py-2 text-right">Pasos</th>
                                <th className="px-3 py-2 text-right">Sueño</th>
                                <th className="px-3 py-2 text-right">Dieta</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {[...rows].reverse().map(row => (
                                <tr key={row.date} className="text-sm">
                                    <td className="truncate px-3 py-2.5 text-muted-foreground capitalize">
                                        {row.dateLabel}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                        {row.weight !== null ? `${row.weight.toFixed(1)} kg` : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <span className={cn(
                                            'inline-flex justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
                                            row.delta === null && 'border-border bg-muted/30 text-muted-foreground',
                                            row.delta !== null && row.delta < 0 && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                                            row.delta !== null && row.delta > 0 && 'border-rose-500/20 bg-rose-500/10 text-rose-500',
                                            row.delta === 0 && 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                                        )}>
                                            {row.delta === null
                                                ? '—'
                                                : `${row.delta > 0 ? '+' : ''}${row.delta.toFixed(1)} kg`
                                            }
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                        {row.steps !== null ? row.steps.toLocaleString('es-ES') : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                        {row.sleep !== null ? `${row.sleep.toFixed(1).replace('.0', '')}h` : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                        {row.dietAdherence !== null ? `${Math.round(row.dietAdherence)}%` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    )
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<string, { bg: string; icon: string; ring: string }> = {
    blue: { bg: 'bg-blue-500/10', icon: 'text-blue-500', ring: 'ring-blue-500/20' },
    green: { bg: 'bg-emerald-500/10', icon: 'text-emerald-500', ring: 'ring-emerald-500/20' },
    violet: { bg: 'bg-violet-500/10', icon: 'text-violet-500', ring: 'ring-violet-500/20' },
    indigo: { bg: 'bg-indigo-500/10', icon: 'text-indigo-500', ring: 'ring-indigo-500/20' },
}

function KpiCard({
    icon: Icon,
    label,
    value,
    subValue,
    delta,
    deltaUnit,
    comparisonDelta,
    comparisonUnit,
    comparisonLabel,
    comparisonPositiveIsGood = false,
    color,
}: {
    icon: React.ElementType
    label: string
    value: string | null
    subValue?: string
    delta?: number | null
    deltaUnit?: string
    comparisonDelta?: number | null
    comparisonUnit?: string
    comparisonLabel?: string
    comparisonPositiveIsGood?: boolean
    color: string
}) {
    const c = COLOR_MAP[color] || COLOR_MAP.blue
    const hasComparison = comparisonDelta != null

    return (
        <Card className="h-full rounded-xl border bg-card px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <div className={cn('flex h-6 w-6 items-center justify-center rounded-md ring-1', c.bg, c.ring)}>
                        <Icon className={cn('h-3 w-3', c.icon)} />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {label}
                    </p>
                </div>
                {delta != null && (
                    <div className={cn(
                        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[10px] font-semibold',
                        delta < 0 && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                        delta > 0 && 'border-rose-500/20 bg-rose-500/10 text-rose-500',
                        delta === 0 && 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    )}>
                        {delta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}{deltaUnit ? ` ${deltaUnit}` : ''}
                    </div>
                )}
            </div>
            <p className="mt-1.5 text-lg font-semibold leading-none tracking-tight">
                {value ?? '—'}
            </p>
            {subValue && (
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">{subValue}</p>
            )}
            {hasComparison && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
                    <span className="min-w-0 truncate text-muted-foreground">
                        {comparisonLabel || 'vs periodo anterior'}
                    </span>
                    <span className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0 font-semibold tabular-nums',
                        comparisonDelta === 0 && 'border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
                        comparisonDelta !== 0 && comparisonPositiveIsGood && comparisonDelta > 0 && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
                        comparisonDelta !== 0 && comparisonPositiveIsGood && comparisonDelta < 0 && 'border-rose-500/20 bg-rose-500/10 text-rose-500',
                        comparisonDelta !== 0 && !comparisonPositiveIsGood && comparisonDelta < 0 && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                        comparisonDelta !== 0 && !comparisonPositiveIsGood && comparisonDelta > 0 && 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                    )}>
                        {comparisonDelta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : comparisonDelta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                        {formatComparisonDelta(comparisonDelta, comparisonUnit)}
                    </span>
                </div>
            )}
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Weight Chart
// ---------------------------------------------------------------------------

function WeightChart({ data }: { data: { date: string; weight: number | null }[] }) {
    if (data.length === 0) {
        return (
            <Card className="p-8">
                <div className="flex flex-col items-center justify-center text-center py-8">
                    <Scale className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="font-semibold text-lg">Sin datos de peso</h3>
                    <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                        Cuando el cliente registre su peso, la evolución aparecerá aquí.
                    </p>
                </div>
            </Card>
        )
    }

    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
                <Scale className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold">Evolución de peso</h3>
                <span className="text-xs text-muted-foreground ml-auto">
                    {data.length} registros
                </span>
            </div>
            <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <defs>
                            <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                            domain={['dataMin - 1', 'dataMax + 1']}
                            unit=" kg"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '13px',
                            }}
                            formatter={(value: number) => [`${value} kg`, 'Peso']}
                        />
                        <Area
                            type="monotone"
                            dataKey="weight"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            fill="url(#weightGradient)"
                            dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                            connectNulls
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    )
}
