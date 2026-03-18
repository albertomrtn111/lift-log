'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts'
import { Activity, Timer, MapPin, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CardioProgressData } from '@/app/(coach)/coach/workspace/progress-actions'

type MetricMode = 'km' | 'horas'

interface CardioProgressViewProps {
    data: CardioProgressData
}

function formatHours(min: number) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
}

function CustomTooltip({ active, payload, label, mode }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm">
            <p className="font-semibold text-foreground mb-1">{d?.tooltipLabel || label}</p>
            <p className="text-muted-foreground">
                {mode === 'km'
                    ? `${d?.distanceKm?.toFixed(1)} km`
                    : formatHours(d?.durationMin ?? 0)}
            </p>
            <p className="text-muted-foreground text-xs mt-1">
                {d?.sessionsCount} sesión{d?.sessionsCount !== 1 ? 'es' : ''}
            </p>
        </div>
    )
}

export function CardioProgressView({ data }: CardioProgressViewProps) {
    const [mode, setMode] = useState<MetricMode>('km')

    const statCards = [
        {
            icon: MapPin,
            label: 'Total km',
            value: `${data.totalDistanceKm.toFixed(1)} km`,
            color: 'text-primary',
        },
        {
            icon: Timer,
            label: 'Total tiempo',
            value: formatHours(data.totalDurationMin),
            color: 'text-accent',
        },
        {
            icon: Activity,
            label: 'Sesiones',
            value: String(data.totalSessions),
            color: 'text-success',
        },
        {
            icon: TrendingUp,
            label: 'Media/semana',
            value: mode === 'km'
                ? `${data.avgDistanceKmPerWeek.toFixed(1)} km`
                : formatHours(data.avgDurationMinPerWeek),
            color: 'text-warning',
        },
    ]

    const hasData = data.totalSessions > 0

    return (
        <div className="space-y-5">
            {/* Stats summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statCards.map(({ icon: Icon, label, value, color }) => (
                    <Card key={label} className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Icon className={cn('h-4 w-4', color)} />
                            <span className="text-xs text-muted-foreground">{label}</span>
                        </div>
                        <p className="text-xl font-bold">{value}</p>
                    </Card>
                ))}
            </div>

            {/* Chart card */}
            <Card>
                <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Carga semanal</h3>
                    {/* Toggle km / horas */}
                    <div className="flex gap-1 bg-muted rounded-lg p-1">
                        <button
                            onClick={() => setMode('km')}
                            className={cn(
                                'px-3 py-1 text-xs rounded-md font-medium transition-all',
                                mode === 'km'
                                    ? 'bg-background shadow text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Kilómetros
                        </button>
                        <button
                            onClick={() => setMode('horas')}
                            className={cn(
                                'px-3 py-1 text-xs rounded-md font-medium transition-all',
                                mode === 'horas'
                                    ? 'bg-background shadow text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            Horas
                        </button>
                    </div>
                </div>

                <CardContent className="pt-4">
                    {!hasData ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <Activity className="h-10 w-10 mb-3 opacity-30" />
                            <p className="text-sm">Sin sesiones de cardio completadas en este período</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={data.weeks} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis
                                    dataKey="weekLabel"
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) =>
                                        mode === 'km'
                                            ? `${v}km`
                                            : v < 60
                                                ? `${v}min`
                                                : `${(v / 60).toFixed(1)}h`
                                    }
                                    width={48}
                                />
                                <Tooltip
                                    content={<CustomTooltip mode={mode} />}
                                    cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                                />
                                <Bar
                                    dataKey={mode === 'km' ? 'distanceKm' : 'durationMin'}
                                    fill="hsl(var(--primary))"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
