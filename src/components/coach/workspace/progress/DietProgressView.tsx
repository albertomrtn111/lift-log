'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
    Beef,
    ChevronDown,
    ChevronRight,
    Droplet,
    Flame,
    Utensils,
    Wheat,
} from 'lucide-react'
import type {
    DietDayProgress,
    DietMacroAdherence,
    DietMacroTotals,
    DietProgressData,
} from '@/app/(coach)/coach/workspace/progress-actions'

interface DietProgressViewProps {
    data: DietProgressData
}

const statusMeta: Record<DietDayProgress['status'], { label: string; className: string }> = {
    empty: { label: 'Sin registro', className: 'border-border bg-muted/30 text-muted-foreground' },
    tracked: { label: 'Registrado', className: 'border-blue-500/20 bg-blue-500/10 text-blue-600' },
    under: { label: 'Bajo objetivo', className: 'border-amber-500/20 bg-amber-500/10 text-amber-600' },
    in_range: { label: 'En rango', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' },
    over: { label: 'Por encima', className: 'border-rose-500/20 bg-rose-500/10 text-rose-500' },
}

function formatDate(date: string) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
    })
}

function formatNumber(value: number) {
    return Number.isInteger(value) ? value.toLocaleString('es-ES') : value.toFixed(1).replace('.', ',')
}

function formatMacro(value: number, unit: string) {
    return `${formatNumber(value)}${unit}`
}

function clampProgress(value: number | null) {
    if (value === null) return 0
    return Math.max(0, Math.min(100, value))
}

function progressTone(value: number | null) {
    if (value === null) return 'bg-muted'
    if (value > 110) return '[&>div]:bg-rose-500'
    if (value >= 90) return '[&>div]:bg-emerald-500'
    return '[&>div]:bg-amber-500'
}

function getTargetText(totals: DietMacroTotals, target: DietMacroTotals | null) {
    if (!target) return 'Sin objetivo'
    return `${formatMacro(totals.kcal, ' kcal')} / ${formatMacro(target.kcal, ' kcal')}`
}

function macroRows(totals: DietMacroTotals, target: DietMacroTotals | null, adherence: DietMacroAdherence) {
    return [
        { label: 'Kcal', actual: totals.kcal, target: target?.kcal ?? null, pct: adherence.kcalPct, unit: '' },
        { label: 'Proteina', actual: totals.protein_g, target: target?.protein_g ?? null, pct: adherence.proteinPct, unit: 'g' },
        { label: 'Carbos', actual: totals.carbs_g, target: target?.carbs_g ?? null, pct: adherence.carbsPct, unit: 'g' },
        { label: 'Grasa', actual: totals.fat_g, target: target?.fat_g ?? null, pct: adherence.fatPct, unit: 'g' },
    ]
}

function KpiCard({
    icon: Icon,
    label,
    value,
    subValue,
    className,
}: {
    icon: React.ElementType
    label: string
    value: string
    subValue: string
    className: string
}) {
    return (
        <Card className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2">
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', className)}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {label}
                </p>
            </div>
            <p className="mt-2 text-lg font-semibold leading-none tracking-tight">{value}</p>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">{subValue}</p>
        </Card>
    )
}

function EmptyState() {
    return (
        <Card className="p-8">
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <Utensils className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <h3 className="text-lg font-semibold">Sin registros de dieta</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Cuando el atleta registre alimentos, veras aqui sus macros por dia y por comida.
                </p>
            </div>
        </Card>
    )
}

function DayCard({ day, expanded, onToggle }: { day: DietDayProgress; expanded: boolean; onToggle: () => void }) {
    const meta = statusMeta[day.status]

    return (
        <Card className="overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                className="flex min-h-16 w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                        <Utensils className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold capitalize">{formatDate(day.date)}</p>
                            <Badge variant="outline" className={cn('h-6 border text-[11px]', meta.className)}>
                                {meta.label}
                            </Badge>
                            <Badge variant="secondary" className="h-6 text-[11px]">
                                {day.dayType === 'training' ? 'Entreno' : 'Descanso'}
                            </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {getTargetText(day.totals, day.target)}
                        </p>
                    </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[360px] sm:grid-cols-5">
                    <MetricPill label="Kcal" value={formatNumber(day.totals.kcal)} />
                    <MetricPill label="Prot" value={formatMacro(day.totals.protein_g, 'g')} />
                    <MetricPill label="Carb" value={formatMacro(day.totals.carbs_g, 'g')} />
                    <MetricPill label="Grasa" value={formatMacro(day.totals.fat_g, 'g')} />
                    <div className="col-span-2 flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-2 text-xs sm:col-span-1">
                        <span className="font-medium text-muted-foreground">Total</span>
                        <span className="font-semibold tabular-nums">{day.adherence.overallPct ?? '-'}%</span>
                    </div>
                </div>

                <div className="hidden shrink-0 text-muted-foreground sm:block">
                    {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </div>
            </button>

            {expanded && (
                <div className="space-y-4 border-t bg-muted/10 p-4">
                    {day.target && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {macroRows(day.totals, day.target, day.adherence).map((row) => (
                                <div key={row.label} className="rounded-lg border bg-background p-3">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="font-semibold text-muted-foreground">{row.label}</span>
                                        <span className="font-semibold tabular-nums">{row.pct ?? '-'}%</span>
                                    </div>
                                    <Progress value={clampProgress(row.pct)} className={cn('mt-2 h-2', progressTone(row.pct))} />
                                    <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                                        {formatNumber(row.actual)}{row.unit} / {row.target !== null ? `${formatNumber(row.target)}${row.unit}` : '-'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {day.meals.length === 0 ? (
                        <p className="rounded-lg border border-dashed p-4 text-sm italic text-muted-foreground">
                            No hay alimentos registrados este dia.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {day.meals.map((meal) => (
                                <div key={meal.key} className="rounded-lg border bg-background p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="font-semibold">{meal.label}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {meal.items.length} alimento{meal.items.length === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 text-xs">
                                            <Badge variant="secondary">{formatMacro(meal.totals.kcal, ' kcal')}</Badge>
                                            <Badge variant="outline">{formatMacro(meal.totals.protein_g, 'g P')}</Badge>
                                            <Badge variant="outline">{formatMacro(meal.totals.carbs_g, 'g C')}</Badge>
                                            <Badge variant="outline">{formatMacro(meal.totals.fat_g, 'g G')}</Badge>
                                        </div>
                                    </div>

                                    <div className="mt-3 divide-y">
                                        {meal.items.map((item) => (
                                            <div key={item.id} className="grid gap-2 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.quantity_g ? `${formatNumber(item.quantity_g)}g` : item.servings ? `${formatNumber(item.servings)} porcion` : 'Cantidad no indicada'}
                                                        {item.notes ? ` · ${item.notes}` : ''}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-xs sm:justify-end">
                                                    <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{formatMacro(item.kcal, ' kcal')}</span>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{formatMacro(item.protein_g, 'g P')}</span>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{formatMacro(item.carbs_g, 'g C')}</span>
                                                    <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">{formatMacro(item.fat_g, 'g G')}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
}

function MetricPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
            <p className="font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
        </div>
    )
}

export function DietProgressView({ data }: DietProgressViewProps) {
    const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
        const latestTracked = data.days.findLast((day) => day.hasEntries)
        return new Set(latestTracked ? [latestTracked.date] : [])
    })

    const visibleDays = useMemo(() => [...data.days].reverse(), [data.days])

    const toggleDay = (date: string) => {
        setExpandedDates((current) => {
            const next = new Set(current)
            if (next.has(date)) next.delete(date)
            else next.add(date)
            return next
        })
    }

    if (data.summary.trackedDays === 0) return <EmptyState />

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
                <KpiCard
                    icon={Flame}
                    label="Kcal"
                    value={formatMacro(data.summary.avgKcal, ' kcal')}
                    subValue="Media diaria"
                    className="bg-orange-500/10 text-orange-600"
                />
                <KpiCard
                    icon={Beef}
                    label="Proteina"
                    value={formatMacro(data.summary.avgProteinG, 'g')}
                    subValue="Media diaria"
                    className="bg-rose-500/10 text-rose-600"
                />
                <KpiCard
                    icon={Wheat}
                    label="Carbos"
                    value={formatMacro(data.summary.avgCarbsG, 'g')}
                    subValue="Media diaria"
                    className="bg-amber-500/10 text-amber-600"
                />
                <KpiCard
                    icon={Droplet}
                    label="Grasa"
                    value={formatMacro(data.summary.avgFatG, 'g')}
                    subValue="Media diaria"
                    className="bg-sky-500/10 text-sky-600"
                />
                <KpiCard
                    icon={Utensils}
                    label="Adherencia"
                    value={data.summary.avgOverallAdherencePct !== null ? `${data.summary.avgOverallAdherencePct}%` : '-'}
                    subValue={`${data.summary.trackedDays}/${data.summary.totalDays} dias`}
                    className="bg-emerald-500/10 text-emerald-600"
                />
            </div>

            <div className="space-y-3">
                {visibleDays.map((day) => (
                    <DayCard
                        key={day.date}
                        day={day}
                        expanded={expandedDates.has(day.date)}
                        onToggle={() => toggleDay(day.date)}
                    />
                ))}
            </div>
        </div>
    )
}
