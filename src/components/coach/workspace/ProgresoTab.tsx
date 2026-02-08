'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    LineChart as ReLineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from 'recharts'
import {
    TrendingUp,
    Scale,
    Footprints,
    Moon,
    Dumbbell,
    Apple,
    Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricData {
    metric_date: string
    weight_kg: number | null
    steps: number | null
    sleep_h: number | null
    training_adherence: number | null
    nutrition_adherence: number | null
}

interface ProgresoTabProps {
    metrics: MetricData[]
}

type RangeOption = 7 | 14 | 30 | 90

export function ProgresoTab({ metrics }: ProgresoTabProps) {
    const [range, setRange] = useState<RangeOption>(30)

    const filteredMetrics = useMemo(() => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - range)
        return metrics.filter(m => new Date(m.metric_date) >= cutoff)
    }, [metrics, range])

    const chartData = useMemo(() => {
        return filteredMetrics.map(m => ({
            date: new Date(m.metric_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            weight: m.weight_kg,
            steps: m.steps,
            sleep: m.sleep_h,
            training: m.training_adherence,
            nutrition: m.nutrition_adherence,
        }))
    }, [filteredMetrics])

    if (metrics.length === 0) {
        return (
            <Card className="p-8 text-center">
                <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h3 className="font-semibold text-lg">Sin datos de progreso</h3>
                <p className="text-muted-foreground mt-2">
                    Los datos aparecerán cuando el cliente envíe check-ins
                </p>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Range Selector */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rango:</span>
                {([7, 14, 30, 90] as RangeOption[]).map(r => (
                    <Button
                        key={r}
                        variant={range === r ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setRange(r)}
                    >
                        {r}d
                    </Button>
                ))}
            </div>

            {/* Charts Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
                <MetricChart
                    title="Peso"
                    icon={Scale}
                    data={chartData}
                    dataKey="weight"
                    unit="kg"
                    color="#10b981"
                />
                <MetricChart
                    title="Pasos diarios"
                    icon={Footprints}
                    data={chartData}
                    dataKey="steps"
                    color="#6366f1"
                />
                <MetricChart
                    title="Sueño"
                    icon={Moon}
                    data={chartData}
                    dataKey="sleep"
                    unit="h"
                    color="#8b5cf6"
                />
                <MetricChart
                    title="Adherencia"
                    icon={TrendingUp}
                    data={chartData}
                    dataKey="training"
                    secondaryDataKey="nutrition"
                    unit="%"
                    color="#f59e0b"
                    secondaryColor="#22c55e"
                    legend={['Entreno', 'Nutrición']}
                />
            </div>

            {/* Recent Data Table */}
            <Card className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Últimos registros
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground border-b">
                                <th className="py-2 px-3">Fecha</th>
                                <th className="py-2 px-3">Peso</th>
                                <th className="py-2 px-3">Pasos</th>
                                <th className="py-2 px-3">Sueño</th>
                                <th className="py-2 px-3">Adherencia E</th>
                                <th className="py-2 px-3">Adherencia N</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMetrics.slice(0, 10).map((m, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    <td className="py-2 px-3">{m.metric_date}</td>
                                    <td className="py-2 px-3">{m.weight_kg ? `${m.weight_kg} kg` : '—'}</td>
                                    <td className="py-2 px-3">{m.steps?.toLocaleString() || '—'}</td>
                                    <td className="py-2 px-3">{m.sleep_h ? `${m.sleep_h}h` : '—'}</td>
                                    <td className={cn('py-2 px-3', m.training_adherence && m.training_adherence < 60 && 'text-destructive')}>
                                        {m.training_adherence ? `${m.training_adherence}%` : '—'}
                                    </td>
                                    <td className={cn('py-2 px-3', m.nutrition_adherence && m.nutrition_adherence < 60 && 'text-destructive')}>
                                        {m.nutrition_adherence ? `${m.nutrition_adherence}%` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

function MetricChart({
    title,
    icon: Icon,
    data,
    dataKey,
    secondaryDataKey,
    unit = '',
    color,
    secondaryColor,
    legend,
}: {
    title: string
    icon: React.ElementType
    data: Record<string, unknown>[]
    dataKey: string
    secondaryDataKey?: string
    unit?: string
    color: string
    secondaryColor?: string
    legend?: string[]
}) {
    const hasData = data.some(d => d[dataKey] !== null && d[dataKey] !== undefined)

    if (!hasData) {
        return (
            <Card className="p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-medium">{title}</h3>
                </div>
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    Sin datos
                </div>
            </Card>
        )
    }

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" style={{ color }} />
                    <h3 className="font-medium">{title}</h3>
                </div>
                {legend && (
                    <div className="flex items-center gap-3 text-xs">
                        {legend.map((l, i) => (
                            <span key={l} className="flex items-center gap-1">
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: i === 0 ? color : secondaryColor }}
                                />
                                {l}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ReLineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            className="text-muted-foreground"
                        />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            className="text-muted-foreground"
                            unit={unit}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls
                        />
                        {secondaryDataKey && (
                            <Line
                                type="monotone"
                                dataKey={secondaryDataKey}
                                stroke={secondaryColor}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                connectNulls
                            />
                        )}
                    </ReLineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    )
}
