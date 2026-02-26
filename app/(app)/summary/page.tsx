'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    BarChart3,
    TrendingUp,
    Target,
    Scale,
    Dumbbell,
    AlertCircle
} from 'lucide-react'
import {
    getActiveStrengthProgramSummary,
    getWeightSeries,
    getMacroAdherence,
    type ProgramSummary,
    type MetricsRange
} from '@/data/summary'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function SummaryPage() {
    const [range, setRange] = useState<MetricsRange>('7d')
    const [program, setProgram] = useState<ProgramSummary | null>(null)
    const [weightData, setWeightData] = useState<{ data: any[], avg: string, trend: string | null }>({ data: [], avg: '--', trend: null })
    const [adherenceData, setAdherenceData] = useState<{ percent: number | string, days: number, totalDays: number }>({ percent: '--', days: 0, totalDays: 0 })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        async function loadData() {
            setLoading(true)
            try {
                const [prog, weight, adh] = await Promise.all([
                    getActiveStrengthProgramSummary(),
                    getWeightSeries(range),
                    getMacroAdherence(range)
                ])

                if (isMounted) {
                    setProgram(prog)
                    setWeightData(weight)
                    setAdherenceData(adh)
                }
            } catch (error) {
                console.error('Error loading summary data:', error)
            } finally {
                if (isMounted) setLoading(false)
            }
        }

        loadData()
        return () => { isMounted = false }
    }, [range])

    const ranges: { label: string, value: MetricsRange }[] = [
        { label: '7D', value: '7d' },
        { label: '14D', value: '14d' },
        { label: '30D', value: '30d' },
        { label: '3M', value: '3m' },
        { label: '6M', value: '6m' },
        { label: '1A', value: '1y' },
    ]

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Resumen</h1>
                            <p className="text-sm text-muted-foreground">Tu progreso general</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 pt-4 space-y-4">
                {/* Current program */}
                <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                    {program ? (
                        <>
                            <div className="flex items-start justify-between">
                                <div>
                                    <Badge variant="secondary" className="mb-2 bg-primary/20 text-primary border-0">
                                        Programa activo
                                    </Badge>
                                    <h2 className="font-bold text-lg">{program.name}</h2>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Semana {program.currentWeek} de {program.totalWeeks}
                                    </p>
                                </div>
                                <Dumbbell className="h-8 w-8 text-primary/40" />
                            </div>
                            <div className="mt-4">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-muted-foreground">Progreso semanal</span>
                                    <span className="font-medium">{program.progressPercent}%</span>
                                </div>
                                <div className="h-2 w-full bg-primary/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-500"
                                        style={{ width: `${program.progressPercent}%` }}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                                <AlertCircle className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-medium text-foreground">Sin programa activo</h3>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                No tienes un programa de fuerza asignado o activo actualmente.
                            </p>
                        </div>
                    )}
                </Card>

                {/* Range Selector */}
                <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none">
                    {ranges.map((r) => (
                        <Button
                            key={r.value}
                            variant={range === r.value ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs rounded-full px-3"
                            onClick={() => setRange(r.value)}
                        >
                            {r.label}
                        </Button>
                    ))}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Scale className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Peso medio</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-xl sm:text-2xl font-bold">{weightData.avg}</span>
                            <span className="text-muted-foreground text-sm mb-0.5">kg</span>
                        </div>
                        {weightData.trend && (
                            <div className="flex items-center gap-1 mt-1">
                                <TrendingUp className={`h-3 w-3 ${parseFloat(weightData.trend) > 0 ? 'text-success' : 'text-destructive'}`} />
                                <span className="text-xs text-muted-foreground">
                                    {parseFloat(weightData.trend) > 0 ? '+' : ''}{weightData.trend} kg
                                </span>
                            </div>
                        )}
                    </Card>

                    <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="h-4 w-4 text-success" />
                            <span className="text-sm text-muted-foreground">Adherencia</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-xl sm:text-2xl font-bold">
                                {typeof adherenceData.percent === 'number' ? `${adherenceData.percent}%` : adherenceData.percent}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {adherenceData.days}/{adherenceData.totalDays} analizados
                        </p>
                    </Card>
                </div>

                {/* Weight Chart */}
                <Card className="p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Evolución peso
                    </h3>
                    <div className="h-[200px] w-full">
                        {weightData.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={weightData.data}>
                                    <defs>
                                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(date) => format(new Date(date), 'dd MMM', { locale: es })}
                                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        domain={['auto', 'auto']}
                                        hide
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--background))',
                                            borderRadius: '8px',
                                            border: '1px solid hsl(var(--border))',
                                            fontSize: '12px'
                                        }}
                                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                                        formatter={(value: number) => [`${value} kg`, 'Peso']}
                                        labelFormatter={(label) => format(new Date(label), 'd MMMM yyyy', { locale: es })}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="weight"
                                        stroke="hsl(var(--primary))"
                                        fillOpacity={1}
                                        fill="url(#colorWeight)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                <p className="text-sm italic">Sin datos de peso en este rango.</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}
