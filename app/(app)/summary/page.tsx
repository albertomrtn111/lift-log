'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    AlertCircle,
    BarChart3,
    ClipboardCheck,
    ClipboardList,
    Dumbbell,
    Loader2,
    PlusCircle,
    Scale,
    Target,
    TrendingUp,
} from 'lucide-react'
import {
    getActiveStrengthProgramSummary,
    getClientCardioProgress,
    getClientDailyMetrics,
    getWeightSeries,
    getMacroAdherence,
    type ClientDailyMetricEntry,
    type ClientCardioProgressData,
    type ProgramSummary,
    type MetricsRange
} from '@/data/summary'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { RegistrarSheet } from '@/components/progress/RegistrarSheet'
import { ClientCardioEvolution } from '@/components/progress/ClientCardioEvolution'
import { ClientReviewsTab } from '@/components/progress/ClientReviewsTab'
import { cn } from '@/lib/utils'

type ProgressTab = 'resumen' | 'revisiones'

function normalizeTab(tab: string | null): ProgressTab {
    return tab === 'revisiones' ? 'revisiones' : 'resumen'
}

interface SummaryOverviewProps {
    range: MetricsRange
    setRange: (range: MetricsRange) => void
    program: ProgramSummary | null
    weightData: { data: any[], avg: string, trend: string | null }
    adherenceData: { percent: number | string, days: number, totalDays: number }
    cardioData: ClientCardioProgressData
    dailyMetrics: ClientDailyMetricEntry[]
    loading: boolean
}

function SummaryOverview({
    range,
    setRange,
    program,
    weightData,
    adherenceData,
    cardioData,
    dailyMetrics,
    loading,
}: SummaryOverviewProps) {
    const ranges: { label: string, value: MetricsRange }[] = [
        { label: '7D', value: '7d' },
        { label: '14D', value: '14d' },
        { label: '30D', value: '30d' },
        { label: '3M', value: '3m' },
        { label: '6M', value: '6m' },
        { label: '1A', value: '1y' },
    ]

    if (loading) {
        return (
            <div className="flex min-h-[360px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
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
                                <YAxis domain={['auto', 'auto']} hide />
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
                            <p className="text-xs mt-1 text-muted-foreground/70">Pulsa "Registrar" para añadir métricas.</p>
                        </div>
                    )}
                </div>
            </Card>

            <ClientCardioEvolution data={cardioData} />

            <Card className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b px-4 py-4">
                    <div>
                        <h3 className="font-semibold flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            Registro diario
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Peso, pasos, sueño y notas del rango seleccionado.
                        </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                        {dailyMetrics.length} días
                    </Badge>
                </div>

                {dailyMetrics.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[620px] text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                                    <th className="px-4 py-3 text-left font-semibold">Día</th>
                                    <th className="px-3 py-3 text-right font-semibold">Peso</th>
                                    <th className="px-3 py-3 text-right font-semibold">Pasos</th>
                                    <th className="px-3 py-3 text-right font-semibold">Sueño</th>
                                    <th className="px-4 py-3 text-left font-semibold">Notas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyMetrics.map((entry) => (
                                    <tr key={entry.date} className="border-b last:border-0">
                                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                                            {format(new Date(`${entry.date}T12:00:00`), 'd MMM', { locale: es })}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-right">
                                            {entry.weightKg !== null ? `${entry.weightKg.toFixed(1)} kg` : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-right">
                                            {entry.steps !== null ? entry.steps.toLocaleString('es-ES') : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-right">
                                            {entry.sleepHours !== null ? `${entry.sleepHours.toFixed(1)} h` : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                                            {entry.notes ? (
                                                <span className="line-clamp-1">{entry.notes}</span>
                                            ) : (
                                                <span>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin registros diarios en este rango.
                    </div>
                )}
            </Card>
        </div>
    )
}

export default function SummaryPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [activeTab, setActiveTab] = useState<ProgressTab>(() => normalizeTab(searchParams.get('tab')))
    const [range, setRange] = useState<MetricsRange>('14d')
    const [program, setProgram] = useState<ProgramSummary | null>(null)
    const [weightData, setWeightData] = useState<{ data: any[], avg: string, trend: string | null }>({ data: [], avg: '--', trend: null })
    const [adherenceData, setAdherenceData] = useState<{ percent: number | string, days: number, totalDays: number }>({ percent: '--', days: 0, totalDays: 0 })
    const [dailyMetrics, setDailyMetrics] = useState<ClientDailyMetricEntry[]>([])
    const [cardioData, setCardioData] = useState<ClientCardioProgressData>({
        weeks: [],
        sessions: [],
        totalDistanceKm: 0,
        totalDurationMin: 0,
        totalSessions: 0,
        completedSessions: 0,
    })
    const [loading, setLoading] = useState(true)
    const [registrarOpen, setRegistrarOpen] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [prog, weight, adh, cardio, metrics] = await Promise.all([
                getActiveStrengthProgramSummary(),
                getWeightSeries(range),
                getMacroAdherence(range),
                getClientCardioProgress(range),
                getClientDailyMetrics(range),
            ])
            setProgram(prog)
            setWeightData(weight)
            setAdherenceData(adh)
            setCardioData(cardio)
            setDailyMetrics(metrics)
        } catch (error) {
            console.error('Error loading summary data:', error)
        } finally {
            setLoading(false)
        }
    }, [range])

    useEffect(() => {
        loadData()
    }, [loadData, refreshKey])

    useEffect(() => {
        const nextTab = normalizeTab(searchParams.get('tab'))
        setActiveTab(prev => prev === nextTab ? prev : nextTab)
    }, [searchParams])

    const handleTabChange = (value: string) => {
        const tab = normalizeTab(value)
        setActiveTab(tab)

        const params = new URLSearchParams(searchParams.toString())
        if (tab === 'resumen') {
            params.delete('tab')
            params.delete('checkin')
        } else {
            params.set('tab', tab)
        }

        const query = params.toString()
        router.replace(query ? `/summary?${query}` : '/summary', { scroll: false })
    }

    const checkinId = searchParams.get('checkin')

    return (
        <div className="app-mobile-page min-h-screen pb-28">
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3 pr-24">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            {activeTab === 'revisiones' ? (
                                <ClipboardCheck className="h-5 w-5 text-primary" />
                            ) : (
                                <BarChart3 className="h-5 w-5 text-primary" />
                            )}
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Progreso</h1>
                            <p className="text-sm text-muted-foreground">
                                {activeTab === 'revisiones' ? 'Tus revisiones enviadas' : 'Tu evolución general'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <div className="border-b border-border bg-background/95 px-4">
                    <TabsList className="grid h-12 w-full grid-cols-2 rounded-none bg-transparent p-0 text-muted-foreground">
                        <TabsTrigger
                            value="resumen"
                            className={cn(
                                'relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-2 text-sm font-semibold shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                                activeTab === 'resumen' ? 'border-primary text-primary' : 'text-muted-foreground'
                            )}
                        >
                            Resumen
                        </TabsTrigger>
                        <TabsTrigger
                            value="revisiones"
                            className={cn(
                                'relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-2 text-sm font-semibold shadow-none transition-colors data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                                activeTab === 'revisiones' ? 'border-primary text-primary' : 'text-muted-foreground'
                            )}
                        >
                            Revisiones
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="resumen" className="mt-4 px-4">
                    <SummaryOverview
                        range={range}
                        setRange={setRange}
                        program={program}
                        weightData={weightData}
                        adherenceData={adherenceData}
                        cardioData={cardioData}
                        dailyMetrics={dailyMetrics}
                        loading={loading}
                    />
                </TabsContent>

                <TabsContent value="revisiones" className="mt-4 px-4">
                    <ClientReviewsTab initialCheckinId={checkinId} />
                </TabsContent>
            </Tabs>

            {activeTab === 'resumen' && (
                <div className="fixed bottom-[calc(var(--safe-area-bottom,0px)+68px)] left-4 right-4 z-40">
                    <Button
                        size="lg"
                        className="w-full shadow-lg shadow-primary/30 gap-2"
                        onClick={() => setRegistrarOpen(true)}
                    >
                        <PlusCircle className="h-5 w-5" />
                        Registrar
                    </Button>
                </div>
            )}

            <RegistrarSheet
                open={registrarOpen}
                onOpenChange={setRegistrarOpen}
                onSaved={() => setRefreshKey(k => k + 1)}
            />
        </div>
    )
}
