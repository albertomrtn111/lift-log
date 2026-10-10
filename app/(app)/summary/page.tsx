'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
    AlertCircle,
    HeartPulse,
    ClipboardList,
    Dumbbell,
    Loader2,
    PlusCircle,
    Scale,
    Target,
    TrendingUp,
} from 'lucide-react'
import {
    getClientSummaryBundle,
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
import { ClientGalleryTab } from '@/components/progress/ClientGalleryTab'
import { cn } from '@/lib/utils'
import { ClientTabSwitcher } from '@/components/ui/client-tab-switcher'

type ProgressTab = 'resumen' | 'revisiones' | 'galeria'

const PROGRESS_TAB_OPTIONS: Array<{ value: ProgressTab; label: string }> = [
    { value: 'resumen', label: 'Resumen' },
    { value: 'revisiones', label: 'Revisiones' },
    { value: 'galeria', label: 'Galería' },
]

function normalizeTab(tab: string | null): ProgressTab {
    return tab === 'revisiones' || tab === 'galeria' ? tab : 'resumen'
}

function DayChip({ label, tone }: { label: string; tone?: 'rose' }) {
    return (
        <span className={cn(
            'rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
            tone === 'rose' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted text-foreground/80'
        )}>
            {label}
        </span>
    )
}

function average(values: number[]) {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

/** Medias de VFC, puntuación del sueño y fatiga del rango; con tendencia de la VFC */
function RecoveryCard({ entries }: { entries: ClientDailyMetricEntry[] }) {
    const hrv = entries.filter(entry => entry.hrvMs !== null).map(entry => entry.hrvMs as number)
    const sleepScore = entries.filter(entry => entry.sleepScore !== null).map(entry => entry.sleepScore as number)
    const fatigue = entries.filter(entry => entry.fatigue !== null).map(entry => entry.fatigue as number)
    if (hrv.length === 0 && sleepScore.length === 0 && fatigue.length === 0) return null

    // entries viene del más reciente al más antiguo: últimos 7 registros frente a la media del rango
    const hrvAvg = average(hrv)
    const hrvRecent = average(hrv.slice(0, 7))
    const hrvTrend = hrvAvg && hrvRecent && hrv.length >= 10 ? ((hrvRecent - hrvAvg) / hrvAvg) * 100 : null

    const stats = [
        hrv.length > 0 && { label: 'VFC media', value: `${Math.round(hrvAvg as number)}`, unit: 'ms', hint: hrvTrend !== null ? `${hrvTrend > 0 ? '+' : ''}${Math.round(hrvTrend)}% últimos 7` : `${hrv.length} días` },
        sleepScore.length > 0 && { label: 'Sueño', value: `${Math.round(average(sleepScore) as number)}`, unit: '/100', hint: `${sleepScore.length} días` },
        fatigue.length > 0 && { label: 'Fatiga', value: (average(fatigue) as number).toFixed(1).replace('.', ','), unit: '/5', hint: `${fatigue.length} días` },
    ].filter(Boolean) as { label: string; value: string; unit: string; hint: string }[]

    return (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                <HeartPulse className="h-4 w-4 text-rose-500" />
                Recuperación
            </h3>
            <div className={cn('mt-3 grid gap-3', stats.length === 1 ? 'grid-cols-1' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                {stats.map(stat => (
                    <div key={stat.label}>
                        <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                        <p className="text-xl font-bold tabular-nums">
                            {stat.value}<span className="text-xs font-normal text-muted-foreground"> {stat.unit}</span>
                        </p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">{stat.hint}</p>
                    </div>
                ))}
            </div>
        </section>
    )
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
    onOpenDay: (date: string) => void
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
    onOpenDay,
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

            <RecoveryCard entries={dailyMetrics} />

            <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                            <ClipboardList className="h-4 w-4 text-primary" />
                            Registro diario
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">Toca un día para editarlo.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                        {dailyMetrics.length} días
                    </span>
                </div>

                {dailyMetrics.length > 0 ? (
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                        {dailyMetrics.map((entry) => (
                            <li key={entry.date}>
                                <button
                                    type="button"
                                    onClick={() => onOpenDay(entry.date)}
                                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                                >
                                    <div className="w-11 shrink-0 text-center">
                                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                                            {format(new Date(`${entry.date}T12:00:00`), 'EEE', { locale: es })}
                                        </p>
                                        <p className="text-lg font-bold leading-tight tabular-nums">
                                            {format(new Date(`${entry.date}T12:00:00`), 'd')}
                                        </p>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap gap-1.5">
                                            {entry.weightKg !== null && <DayChip label={`${entry.weightKg.toFixed(1).replace('.', ',')} kg`} />}
                                            {entry.steps !== null && <DayChip label={`${entry.steps.toLocaleString('es-ES')} pasos`} />}
                                            {entry.sleepHours !== null && <DayChip label={`${entry.sleepHours.toFixed(1).replace('.', ',').replace(',0', '')} h sueño`} />}
                                            {entry.hrvMs !== null && <DayChip label={`VFC ${Math.round(entry.hrvMs)} ms`} tone="rose" />}
                                            {entry.sleepScore !== null && <DayChip label={`Sueño ${entry.sleepScore}/100`} tone="rose" />}
                                            {entry.fatigue !== null && <DayChip label={`Fatiga ${entry.fatigue}/5`} tone="rose" />}
                                        </div>
                                        {entry.notes && (
                                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{entry.notes}</p>
                                        )}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="border-t border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin registros en este rango.
                    </div>
                )}
            </section>
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
    const [registrarDate, setRegistrarDate] = useState<Date | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            // Una sola server action: el servidor paraleliza las 5 consultas
            const bundle = await getClientSummaryBundle(range)
            setProgram(bundle.program)
            setWeightData(bundle.weight)
            setAdherenceData(bundle.adherence)
            setCardioData(bundle.cardio)
            setDailyMetrics(bundle.dailyMetrics)
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
        } else {
            params.set('tab', tab)
        }
        if (tab !== 'revisiones') params.delete('checkin')

        const query = params.toString()
        router.replace(query ? `/summary?${query}` : '/summary', { scroll: false })
    }

    const checkinId = searchParams.get('checkin')
    const headerSubtitle = activeTab === 'revisiones'
        ? 'Revisiones con tu coach'
        : activeTab === 'galeria'
            ? 'Fotos por revisión'
            : 'Tu evolución'

    return (
        <div className="app-mobile-page min-h-screen pb-28">
            <header className="app-mobile-header border-b border-border/60 bg-background/90 backdrop-blur-xl">
                <div className="px-4 pb-3 pt-4">
                    <div className="flex min-h-10 items-end pr-24">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{headerSubtitle}</p>
                            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">Progreso</h1>
                        </div>
                    </div>
                    <ClientTabSwitcher
                        className="mt-3"
                        value={activeTab}
                        options={PROGRESS_TAB_OPTIONS}
                        onValueChange={handleTabChange}
                    />
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={handleTabChange}>
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
                        onOpenDay={(date) => {
                            setRegistrarDate(new Date(`${date}T12:00:00`))
                            setRegistrarOpen(true)
                        }}
                    />
                </TabsContent>

                <TabsContent value="revisiones" className="mt-4 px-4">
                    <ClientReviewsTab initialCheckinId={checkinId} />
                </TabsContent>

                <TabsContent value="galeria" className="mt-4 px-4">
                    <ClientGalleryTab />
                </TabsContent>
            </Tabs>

            {activeTab === 'resumen' && (
                <div className="fixed bottom-[calc(var(--safe-area-bottom,0px)+68px)] left-4 right-4 z-40">
                    <Button
                        size="lg"
                        className="w-full shadow-lg shadow-primary/30 gap-2"
                        onClick={() => {
                            setRegistrarDate(null)
                            setRegistrarOpen(true)
                        }}
                    >
                        <PlusCircle className="h-5 w-5" />
                        Registrar
                    </Button>
                </div>
            )}

            <RegistrarSheet
                open={registrarOpen}
                initialDate={registrarDate}
                onOpenChange={setRegistrarOpen}
                onSaved={() => setRefreshKey(k => k + 1)}
            />
        </div>
    )
}
