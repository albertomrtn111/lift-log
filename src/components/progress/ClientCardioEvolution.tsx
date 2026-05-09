'use client'

import { useMemo, useState } from 'react'
import { Activity, Bike, MapPin, Route as RouteIcon, Timer, Waves } from 'lucide-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
    ClientCardioProgressData,
    ClientCardioSessionProgress,
    ClientCardioWeekData,
} from '@/data/summary'

type ClientDisciplineFilter = 'all' | 'running' | 'natacion' | 'bicicleta'
type NormalizedDiscipline = ClientDisciplineFilter | 'hibrido'

const DISCIPLINE_MAP: Record<string, NormalizedDiscipline> = {
    rodaje: 'running',
    series: 'running',
    tempo: 'running',
    fartlek: 'running',
    progressive: 'running',
    progresivo: 'running',
    run: 'running',
    running: 'running',
    carrera: 'running',
    bike: 'bicicleta',
    bici: 'bicicleta',
    bicicleta: 'bicicleta',
    cycling: 'bicicleta',
    ciclismo: 'bicicleta',
    swim: 'natacion',
    swimming: 'natacion',
    natacion: 'natacion',
    natación: 'natacion',
    hybrid: 'hibrido',
    hibrido: 'hibrido',
    híbrido: 'hibrido',
    hyrox: 'hibrido',
    mixed: 'hibrido',
}

const FILTER_OPTIONS: {
    value: ClientDisciplineFilter
    label: string
    icon: React.ElementType
    activeClass: string
}[] = [
    { value: 'all', label: 'Todos', icon: Activity, activeClass: 'bg-foreground text-background border-foreground' },
    { value: 'running', label: 'Running', icon: RouteIcon, activeClass: 'bg-teal-600 text-white border-teal-600' },
    { value: 'natacion', label: 'Natación', icon: Waves, activeClass: 'bg-blue-600 text-white border-blue-600' },
    { value: 'bicicleta', label: 'Bici', icon: Bike, activeClass: 'bg-amber-600 text-white border-amber-600' },
]

const FILTER_LABELS: Record<ClientDisciplineFilter, string> = {
    all: 'cardio',
    running: 'running',
    natacion: 'natación',
    bicicleta: 'bici',
}

function getDiscipline(trainingType: string | null): NormalizedDiscipline {
    if (!trainingType) return 'running'
    const key = trainingType.toLowerCase().trim()
    return DISCIPLINE_MAP[key] ?? 'running'
}

function formatHours(min: number) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
}

function reaggregateWeeks(
    baseWeeks: ClientCardioWeekData[],
    sessions: ClientCardioSessionProgress[]
): ClientCardioWeekData[] {
    const weekMap = new Map<string, ClientCardioWeekData>()

    for (const week of baseWeeks) {
        weekMap.set(week.weekStart, {
            ...week,
            distanceKm: 0,
            durationMin: 0,
            sessionsCount: 0,
            plannedDistanceKm: 0,
            plannedDurationMin: 0,
            plannedSessionsCount: 0,
        })
    }

    for (const session of sessions) {
        const d = new Date(`${session.scheduledDate}T12:00:00`)
        const diffToMonday = (d.getDay() + 6) % 7
        d.setDate(d.getDate() - diffToMonday)
        const key = d.toISOString().split('T')[0]
        const week = weekMap.get(key)
        if (!week) continue

        week.plannedSessionsCount += 1
        week.plannedDistanceKm += session.targetDistanceKm ?? 0
        week.plannedDurationMin += session.targetDurationMin ?? 0

        if (session.completionStatus !== 'not_completed') {
            week.sessionsCount += 1
            week.distanceKm += session.actualDistanceKm ?? 0
            week.durationMin += session.actualDurationMin ?? 0
        }
    }

    return Array.from(weekMap.values())
}

function CardioTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    const week = payload[0].payload as ClientCardioWeekData

    return (
        <div className="rounded-lg border border-border bg-background p-3 text-xs shadow-lg">
            <p className="mb-2 font-semibold text-foreground">{week.tooltipLabel || label}</p>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-6">
                    <span className="text-muted-foreground">Realizado</span>
                    <span className="font-medium text-foreground">{week.distanceKm.toFixed(1)} km</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                    <span className="text-muted-foreground">Planificado</span>
                    <span className="font-medium text-foreground">{week.plannedDistanceKm.toFixed(1)} km</span>
                </div>
                <div className="flex items-center justify-between gap-6">
                    <span className="text-muted-foreground">Tiempo</span>
                    <span className="font-medium text-foreground">{formatHours(week.durationMin)}</span>
                </div>
            </div>
        </div>
    )
}

export function ClientCardioEvolution({ data }: { data: ClientCardioProgressData }) {
    const [filter, setFilter] = useState<ClientDisciplineFilter>('all')

    const sessionCounts = useMemo(() => {
        const counts: Record<ClientDisciplineFilter, number> = {
            all: data.sessions.length,
            running: 0,
            natacion: 0,
            bicicleta: 0,
        }

        for (const session of data.sessions) {
            const discipline = getDiscipline(session.trainingType)
            if (discipline === 'running' || discipline === 'natacion' || discipline === 'bicicleta') {
                counts[discipline] += 1
            }
        }

        return counts
    }, [data.sessions])

    const filteredSessions = useMemo(() => {
        if (filter === 'all') return data.sessions
        return data.sessions.filter((session) => getDiscipline(session.trainingType) === filter)
    }, [data.sessions, filter])

    const weeks = useMemo(() => {
        if (filter === 'all') return data.weeks
        return reaggregateWeeks(data.weeks, filteredSessions)
    }, [data.weeks, filter, filteredSessions])

    const stats = useMemo(() => {
        const totalDistanceKm = weeks.reduce((sum, week) => sum + week.distanceKm, 0)
        const totalPlannedDistanceKm = weeks.reduce((sum, week) => sum + week.plannedDistanceKm, 0)
        const totalDurationMin = weeks.reduce((sum, week) => sum + week.durationMin, 0)
        const completedSessions = filteredSessions.filter((session) => session.completionStatus === 'completed').length

        return {
            totalDistanceKm,
            totalPlannedDistanceKm,
            totalDurationMin,
            totalSessions: filteredSessions.length,
            completedSessions,
        }
    }, [filteredSessions, weeks])

    const hasSessions = stats.totalSessions > 0
    const hasActualDistance = weeks.some((week) => week.distanceKm > 0)
    const activeLabel = FILTER_LABELS[filter]
    const planPct = stats.totalPlannedDistanceKm > 0
        ? Math.round((stats.totalDistanceKm / stats.totalPlannedDistanceKm) * 100)
        : null

    return (
        <section className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {FILTER_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const isActive = filter === option.value

                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFilter(option.value)}
                            className={cn(
                                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                                isActive
                                    ? option.activeClass
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {option.label}
                            {sessionCounts[option.value] > 0 && (
                                <span className={cn(
                                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                                    isActive ? 'bg-white/20 text-current' : 'bg-muted text-muted-foreground'
                                )}>
                                    {sessionCounts[option.value]}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            <Card className="overflow-hidden p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-semibold text-foreground">
                            Volumen de {activeLabel} (km)
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {planPct !== null
                                ? `${planPct}% del plan registrado`
                                : `${stats.totalSessions} sesiones en el periodo`}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold tabular-nums text-foreground">
                            {stats.totalDistanceKm.toFixed(1)}
                            <span className="ml-1 text-sm font-semibold text-muted-foreground">km</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{formatHours(stats.totalDurationMin)}</p>
                    </div>
                </div>

                <div className="h-[210px] w-full">
                    {!hasSessions ? (
                        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                            <Activity className="mb-3 h-8 w-8 opacity-30" />
                            <p className="text-sm">
                                {filter === 'all'
                                    ? 'Aún no hay sesiones de cardio en este rango.'
                                    : `Aún no hay sesiones de ${activeLabel} en este rango.`}
                            </p>
                        </div>
                    ) : !hasActualDistance ? (
                        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                            <MapPin className="mb-3 h-8 w-8 opacity-30" />
                            <p className="text-sm">Hay sesiones planificadas, pero falta distancia real para dibujar la evolución.</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={weeks} margin={{ top: 8, right: 6, left: -26, bottom: 2 }}>
                                <defs>
                                    <linearGradient id="clientCardioGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.28} />
                                        <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                                <XAxis
                                    dataKey="weekLabel"
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={18}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}`}
                                    width={36}
                                />
                                <Tooltip content={<CardioTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="distanceKm"
                                    stroke="#14b8a6"
                                    strokeWidth={2.5}
                                    fill="url(#clientCardioGradient)"
                                    dot={{ r: 3, fill: '#14b8a6', strokeWidth: 0 }}
                                    activeDot={{ r: 5, fill: '#14b8a6', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                    <div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            Plan
                        </div>
                        <p className="mt-1 text-sm font-semibold">{stats.totalPlannedDistanceKm.toFixed(1)} km</p>
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Activity className="h-3 w-3" />
                            Sesiones
                        </div>
                        <p className="mt-1 text-sm font-semibold">{stats.completedSessions}/{stats.totalSessions}</p>
                    </div>
                    <div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            Tiempo
                        </div>
                        <p className="mt-1 text-sm font-semibold">{formatHours(stats.totalDurationMin)}</p>
                    </div>
                </div>
            </Card>
        </section>
    )
}
