'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/card'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getProgressData, getCardioProgressData, ProgressData, CardioProgressData } from '@/app/(coach)/coach/workspace/progress-actions'
import { TrainingProgressView } from './progress/TrainingProgressView'
import { CardioProgressView } from './progress/CardioProgressView'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeKey = '7d' | '15d' | '30d' | '3m' | '6m' | '12m'
type SubTab = 'general' | 'training' | 'cardio'

const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
    { key: '7d', label: '7 días', days: 7 },
    { key: '15d', label: '15 días', days: 15 },
    { key: '30d', label: '30 días', days: 30 },
    { key: '3m', label: '3 meses', days: 90 },
    { key: '6m', label: '6 meses', days: 180 },
    { key: '12m', label: '12 meses', days: 365 },
]

interface ProgresoTabProps {
    clientId: string
    coachId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgresoTab({ clientId, coachId }: ProgresoTabProps) {
    const [subTab, setSubTab] = useState<SubTab>('general')
    const [range, setRange] = useState<RangeKey>('30d')
    const [loading, setLoading] = useState(true)
    const [data, setData] = useState<ProgressData | null>(null)
    const [cardioData, setCardioData] = useState<CardioProgressData | null>(null)
    const [cardioLoading, setCardioLoading] = useState(false)

    const rangeDays = RANGE_OPTIONS.find(r => r.key === range)!.days

    const fetchData = useCallback(async () => {
        setLoading(true)
        const dateTo = new Date()
        const dateFrom = new Date()
        dateFrom.setDate(dateFrom.getDate() - rangeDays)

        const result = await getProgressData(
            clientId,
            dateFrom.toISOString().split('T')[0],
            dateTo.toISOString().split('T')[0]
        )

        if (result.success && result.data) {
            setData(result.data)
        } else {
            setData({ metrics: [], dietAdherence: [], workoutLogs: [] })
        }
        setLoading(false)
    }, [clientId, rangeDays])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (subTab !== 'cardio') return
        const fetchCardio = async () => {
            setCardioLoading(true)
            const dateTo = new Date()
            const dateFrom = new Date()
            dateFrom.setDate(dateFrom.getDate() - rangeDays)
            const result = await getCardioProgressData(
                clientId,
                dateFrom.toISOString().split('T')[0],
                dateTo.toISOString().split('T')[0]
            )
            if (result.success && result.data) setCardioData(result.data)
            setCardioLoading(false)
        }
        fetchCardio()
    }, [subTab, range, clientId, rangeDays])

    // -----------------------------------------------------------------------
    // Computed KPIs
    // -----------------------------------------------------------------------

    const kpis = useMemo(() => {
        if (!data) return null

        // Weight
        const weights = data.metrics.filter(m => m.weight_kg !== null).map(m => m.weight_kg!)
        const avgWeight = weights.length > 0
            ? (weights.reduce((a, b) => a + b, 0) / weights.length)
            : null
        const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null
        const firstWeight = weights.length > 1 ? weights[0] : null
        const weightDelta = lastWeight && firstWeight ? lastWeight - firstWeight : null

        // Training adherence
        const totalWorkouts = data.workoutLogs.length
        const completedWorkouts = data.workoutLogs.filter(w => w.completed).length
        const trainingAdherence = totalWorkouts > 0
            ? Math.round((completedWorkouts / totalWorkouts) * 100)
            : null

        // Diet adherence
        const dietValues = data.dietAdherence.map(d => d.adherence_pct)
        const avgDietAdherence = dietValues.length > 0
            ? Math.round(dietValues.reduce((a, b) => a + b, 0) / dietValues.length)
            : null

        // Steps
        const stepsValues = data.metrics.filter(m => m.steps !== null).map(m => m.steps!)
        const avgSteps = stepsValues.length > 0
            ? Math.round(stepsValues.reduce((a, b) => a + b, 0) / stepsValues.length)
            : null

        // Sleep
        const sleepValues = data.metrics.filter(m => m.sleep_h !== null).map(m => m.sleep_h!)
        const avgSleep = sleepValues.length > 0
            ? +(sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1)
            : null

        return {
            avgWeight,
            lastWeight,
            weightDelta,
            trainingAdherence,
            completedWorkouts,
            totalWorkouts,
            avgDietAdherence,
            avgSteps,
            avgSleep,
        }
    }, [data])

    // -----------------------------------------------------------------------
    // Chart data
    // -----------------------------------------------------------------------

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
                    {/* Range Selector */}
                    <div className="flex w-fit items-center gap-1 rounded-lg border border-border/70 bg-secondary/70 p-1">
                        {RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setRange(opt.key)}
                                className={cn(
                                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                    range === opt.key
                                        ? "bg-background text-foreground shadow-sm dark:bg-card"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

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
                    {/* Range Selector */}
                    <div className="flex w-fit items-center gap-1 rounded-lg border border-border/70 bg-secondary/70 p-1">
                        {RANGE_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setRange(opt.key)}
                                className={cn(
                                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                    range === opt.key
                                        ? "bg-background text-foreground shadow-sm dark:bg-card"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                                <KpiCard
                                    icon={Scale}
                                    label="Peso medio"
                                    value={kpis?.avgWeight != null ? `${kpis.avgWeight.toFixed(1)} kg` : null}
                                    subValue={kpis?.lastWeight != null ? `Último: ${kpis.lastWeight.toFixed(1)} kg` : undefined}
                                    delta={kpis?.weightDelta}
                                    deltaUnit="kg"
                                    color="blue"
                                />
                                <KpiCard
                                    icon={Footprints}
                                    label="Pasos"
                                    value={kpis?.avgSteps != null ? kpis.avgSteps.toLocaleString('es-ES') : null}
                                    subValue="Media diaria"
                                    color="violet"
                                />
                                <KpiCard
                                    icon={Moon}
                                    label="Sueño"
                                    value={kpis?.avgSleep != null ? `${kpis.avgSleep}h` : null}
                                    subValue="Media por noche"
                                    color="indigo"
                                />
                                <KpiCard
                                    icon={Apple}
                                    label="Dieta"
                                    value={kpis?.avgDietAdherence != null ? `${kpis.avgDietAdherence}%` : null}
                                    subValue="Adherencia media"
                                    color="green"
                                />
                            </div>

                            {/* Weight Evolution Chart */}
                            <WeightChart data={weightChartData} />
                        </>
                    )}
                </>
            )}
        </div>
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
    color,
}: {
    icon: React.ElementType
    label: string
    value: string | null
    subValue?: string
    delta?: number | null
    deltaUnit?: string
    color: string
}) {
    const c = COLOR_MAP[color] || COLOR_MAP.blue

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
