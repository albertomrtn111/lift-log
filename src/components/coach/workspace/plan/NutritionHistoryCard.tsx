'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, ArrowRight, ChevronDown, ChevronUp, Eye, History, Scale } from 'lucide-react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useNutritionHistory } from '@/hooks/useNutritionHistory'
import type { NutritionHistoryEntry, WeightPoint } from '@/data/nutrition/history'
import { DietPlanViewerModal } from './DietPlanViewerModal'

interface NutritionHistoryCardProps {
    coachId: string
    clientId: string
}

type KindFilter = 'all' | 'macros' | 'options'

const FILTERS: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'Todo' },
    { value: 'macros', label: 'Macros' },
    { value: 'options', label: 'Dietas' },
]

const STATUS_LABEL: Record<NutritionHistoryEntry['status'], string> = {
    active: 'Vigente',
    scheduled: 'Programado',
    archived: 'Archivado',
}

const COLLAPSED_COUNT = 5

const toTime = (date: string) => parseISO(date).getTime()
const fmtDate = (date: string) => format(parseISO(date), 'd MMM yyyy', { locale: es })
const fmtKg = (kg: number) => kg.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtInt = (n: number) => n.toLocaleString('es-ES')

function durationLabel(days: number): string {
    if (days <= 0) return 'sustituido el mismo día'
    if (days < 14) return `${days} ${days === 1 ? 'día' : 'días'}`
    return `${Math.round(days / 7)} semanas`
}

export function NutritionHistoryCard({ coachId, clientId }: NutritionHistoryCardProps) {
    const { data, isLoading, error, refetch } = useNutritionHistory(coachId, clientId)
    const [filter, setFilter] = useState<KindFilter>('all')
    const [expanded, setExpanded] = useState(false)
    const [viewingDietId, setViewingDietId] = useState<string | null>(null)

    const plans = useMemo(
        () => (data?.plans ?? []).filter(p => filter === 'all' || p.kind === filter),
        [data, filter],
    )

    if (isLoading) {
        return (
            <Card className="rounded-2xl border-border/70 p-4 sm:p-5 space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-40 w-full" />
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="rounded-2xl border-border/70 p-4 sm:p-5">
                <div className="text-center text-destructive">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                    <p className="text-sm">Error al cargar el historial de nutrición</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        Reintentar
                    </Button>
                </div>
            </Card>
        )
    }

    const allPlans = data?.plans ?? []
    const visible = expanded ? plans : plans.slice(0, COLLAPSED_COUNT)

    return (
        <Card className="rounded-2xl border-border/70 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                        <History className="h-5 w-5 text-primary" />
                        Historial de nutrición
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Cada cambio de macros y dieta, con el peso de ese momento.
                    </p>
                </div>
                {allPlans.length > 0 && (
                    <div className="flex rounded-full border border-border/70 p-0.5">
                        {FILTERS.map(f => (
                            <button
                                key={f.value}
                                type="button"
                                onClick={() => setFilter(f.value)}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                    filter === f.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {allPlans.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                    <History className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p className="text-sm">Aún no hay planes de nutrición.</p>
                    <p className="text-xs mt-1">Cuando crees o cambies un plan aparecerá aquí.</p>
                </div>
            ) : (
                <>
                    <WeightWithChanges weights={data?.weights ?? []} plans={plans} />

                    {plans.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No hay planes de este tipo.</p>
                    ) : (
                        <ol className="relative mt-4 space-y-3 border-l border-border/70 pl-5">
                            {visible.map(plan => (
                                <HistoryItem
                                    key={`${plan.kind}-${plan.id}`}
                                    plan={plan}
                                    onViewDiet={() => setViewingDietId(plan.id)}
                                />
                            ))}
                        </ol>
                    )}

                    {plans.length > COLLAPSED_COUNT && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-3 w-full"
                            onClick={() => setExpanded(e => !e)}
                        >
                            {expanded ? (
                                <><ChevronUp className="mr-1 h-4 w-4" /> Ver menos</>
                            ) : (
                                <><ChevronDown className="mr-1 h-4 w-4" /> Ver todo ({plans.length})</>
                            )}
                        </Button>
                    )}
                </>
            )}

            <DietPlanViewerModal
                planId={viewingDietId}
                open={!!viewingDietId}
                onOpenChange={(open) => !open && setViewingDietId(null)}
            />
        </Card>
    )
}

// ============================================================================
// WEIGHT CHART WITH PLAN CHANGES
// ============================================================================

function WeightWithChanges({ weights, plans }: { weights: WeightPoint[]; plans: NutritionHistoryEntry[] }) {
    if (weights.length < 2) {
        return (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Scale className="h-4 w-4" />
                Sin registros de peso suficientes para dibujar la evolución.
            </div>
        )
    }

    const points = weights.map(w => ({ t: toTime(w.date), weight: w.weight }))
    const minT = points[0].t
    const maxT = points[points.length - 1].t
    const changes = plans.filter(p => p.days > 0 && toTime(p.effective_from) >= minT && toTime(p.effective_from) <= maxT)

    return (
        <div>
            <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                        <XAxis
                            dataKey="t"
                            type="number"
                            scale="time"
                            domain={[minT, maxT]}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                            tickFormatter={(t: number) => format(t, 'd MMM', { locale: es })}
                        />
                        <YAxis
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                            domain={['dataMin - 1', 'dataMax + 1']}
                            tickFormatter={(v: number) => fmtKg(v)}
                            unit=" kg"
                            width={64}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '13px',
                            }}
                            labelFormatter={(t: number) => format(t, 'd MMM yyyy', { locale: es })}
                            formatter={(value: number) => [`${fmtKg(value)} kg`, 'Peso']}
                        />
                        {changes.map(p => (
                            <ReferenceLine
                                key={`${p.kind}-${p.id}`}
                                x={toTime(p.effective_from)}
                                stroke={p.kind === 'macros' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                                strokeDasharray="4 3"
                                strokeOpacity={0.7}
                            />
                        ))}
                        <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-0 w-4 border-t-2 border-dashed border-primary" />
                    Cambio de macros
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
                    Cambio de dieta
                </span>
            </div>
        </div>
    )
}

// ============================================================================
// TIMELINE ITEM
// ============================================================================

function HistoryItem({ plan, onViewDiet }: { plan: NutritionHistoryEntry; onViewDiet: () => void }) {
    const isMacros = plan.kind === 'macros'
    const endLabel = plan.status === 'archived' && plan.days <= 0 ? null
        : plan.effective_to ? fmtDate(plan.effective_to)
        : plan.status === 'active' ? 'hoy' : null
    const weightDelta = plan.start_weight_kg !== null && plan.end_weight_kg !== null
        ? plan.end_weight_kg - plan.start_weight_kg
        : null

    return (
        <li className="relative">
            <span
                className={cn(
                    'absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-background',
                    plan.status === 'archived' ? 'bg-muted-foreground/50' : 'bg-primary',
                )}
            />
            <div className="rounded-xl border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{isMacros ? 'Macros' : 'Dieta'}</Badge>
                    <Badge variant={plan.status === 'archived' ? 'outline' : 'default'} className="text-xs">
                        {STATUS_LABEL[plan.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                        {fmtDate(plan.effective_from)}
                        {endLabel && ` → ${endLabel}`}
                        {' · '}
                        {plan.status === 'scheduled' ? 'aún no ha empezado' : durationLabel(plan.days)}
                    </span>
                </div>

                <div className="mt-2 text-sm">
                    {isMacros ? <MacroSummary plan={plan} /> : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                                {plan.name || 'Dieta sin nombre'}
                                {plan.meals_count ? (
                                    <span className="ml-1 font-normal text-muted-foreground">· {plan.meals_count} comidas</span>
                                ) : null}
                            </span>
                            <Button variant="outline" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={onViewDiet}>
                                <Eye className="mr-1 h-3.5 w-3.5" />
                                Ver dieta
                            </Button>
                        </div>
                    )}
                </div>

                {(plan.start_weight_kg !== null || plan.end_weight_kg !== null) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Scale className="h-3.5 w-3.5" />
                        <span>{plan.start_weight_kg !== null ? `${fmtKg(plan.start_weight_kg)} kg` : '—'}</span>
                        {plan.status !== 'scheduled' && (
                            <>
                                <ArrowRight className="h-3 w-3" />
                                <span>{plan.end_weight_kg !== null ? `${fmtKg(plan.end_weight_kg)} kg` : '—'}</span>
                            </>
                        )}
                        {weightDelta !== null && plan.days > 0 && (
                            <span className="font-medium text-foreground">
                                ({weightDelta > 0 ? '+' : weightDelta < 0 ? '−' : '±'}{fmtKg(Math.abs(weightDelta))} kg)
                            </span>
                        )}
                    </div>
                )}

                {plan.change_note && (
                    <p className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs">
                        <span className="font-medium">Motivo: </span>{plan.change_note}
                    </p>
                )}
            </div>
        </li>
    )
}

function MacroSummary({ plan }: { plan: NutritionHistoryEntry }) {
    const cfg = plan.day_type_config
    const line = (v: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }) => (
        <span className="tabular-nums">
            <span className="font-medium">{fmtInt(v.kcal ?? 0)} kcal</span>
            <span className="text-muted-foreground"> · P {v.protein_g ?? 0} · HC {v.carbs_g ?? 0} · G {v.fat_g ?? 0}</span>
        </span>
    )

    return (
        <div className="space-y-0.5">
            {cfg?.training && cfg?.rest ? (
                <>
                    <div><span className="text-muted-foreground">Entreno: </span>{line(cfg.training)}</div>
                    <div><span className="text-muted-foreground">Descanso: </span>{line(cfg.rest)}</div>
                </>
            ) : line(plan)}
            {plan.steps ? (
                <div className="text-xs text-muted-foreground">{fmtInt(plan.steps)} pasos/día</div>
            ) : null}
        </div>
    )
}
