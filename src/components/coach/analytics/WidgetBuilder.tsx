'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Grid3x3, Hash, LineChart, Loader2, ScatterChart, Table2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
    DIMENSIONS, DISCIPLINE_LABELS, METRICS, METRIC_FAMILIES, VISUALS,
    axesFor, breakdownsFor, companionMetrics, metricsOfFamily, visualsFor,
    type Dimension, type Visual,
} from '@/lib/analytics/catalog'
import { runWidget, suggestTitle, type AnalyticsFacts, type BoardFilters } from '@/lib/analytics/engine'
import type { WidgetDraft, WidgetHeight, WidgetWidth } from '@/types/analytics'
import { MultiSelect } from './MultiSelect'
import { WidgetChart } from './WidgetChart'

const VISUAL_ICONS: Record<Visual, React.ComponentType<{ className?: string }>> = {
    line: LineChart,
    bar: BarChart3,
    heatmap: Grid3x3,
    table: Table2,
    kpi: Hash,
    scatter: ScatterChart,
}

const WIDTH_OPTIONS: Array<{ value: WidgetWidth; label: string }> = [
    { value: 3, label: 'Pequeño' },
    { value: 4, label: 'Un tercio' },
    { value: 6, label: 'Mitad' },
    { value: 8, label: 'Dos tercios' },
    { value: 12, label: 'Ancho completo' },
]

const HEIGHT_OPTIONS: Array<{ value: WidgetHeight; label: string }> = [
    { value: 'sm', label: 'Bajo' },
    { value: 'md', label: 'Medio' },
    { value: 'lg', label: 'Alto' },
]

const NO_BREAKDOWN = '__none__'

// Al cambiar de visual, el eje que más se suele querer
const PREFERRED_AXIS: Partial<Record<Visual, Dimension[]>> = {
    line: ['week', 'day'],
    bar: ['week', 'athlete'],
    heatmap: ['week'],
    table: ['athlete', 'exercise'],
    scatter: ['athlete'],
}

export const EMPTY_DRAFT: WidgetDraft = {
    title: '',
    metric: 'e1rm',
    visual: 'line',
    dimensions: ['week', 'exercise'],
    filters: {},
    options: {},
    layout: { w: 6, h: 'md' },
}

/** Corrige un borrador para que visual, eje, desglose, filtros y opciones encajen con la métrica */
export function fixDraft(draft: WidgetDraft): WidgetDraft {
    const metric = METRICS[draft.metric] ? draft.metric : 'e1rm'
    const source = METRICS[metric].source
    const visuals = visualsFor(metric)
    const visual = visuals.includes(draft.visual) ? draft.visual : visuals[0]
    const axes = axesFor(metric, visual)
    const preferred = PREFERRED_AXIS[visual]?.find(axis => axes.includes(axis))
    const axis = axes.includes(draft.dimensions[0]) ? draft.dimensions[0] : preferred ?? axes[0]
    const breakdowns = VISUALS[visual].breakdown && axis !== 'none' ? breakdownsFor(metric, axis) : []
    let breakdown: Dimension | null = draft.dimensions[1] && breakdowns.includes(draft.dimensions[1]) ? draft.dimensions[1] : null
    if (visual === 'heatmap' && !breakdown) breakdown = breakdowns.includes('athlete') ? 'athlete' : breakdowns[0] ?? null

    const companions = companionMetrics(axis).map(item => item.key)
    const yMetric = draft.options.yMetric && companions.includes(draft.options.yMetric) && draft.options.yMetric !== metric
        ? draft.options.yMetric
        : companions.find(key => key !== metric && (key === 'e1rm_change' || key === 'adherence')) ?? companions.find(key => key !== metric)

    return {
        ...draft,
        metric,
        visual,
        dimensions: breakdown ? [axis, breakdown] : [axis],
        filters: {
            exerciseKeys: source === 'strength' ? draft.filters.exerciseKeys ?? [] : [],
            groups: source === 'strength' ? draft.filters.groups ?? [] : [],
            disciplines: source === 'cardio' ? draft.filters.disciplines ?? [] : [],
            athleteIds: draft.filters.athleteIds ?? [],
        },
        options: {
            compare: visual === 'kpi' ? draft.options.compare ?? !METRICS[metric].timeless : undefined,
            topN: breakdown ? draft.options.topN : undefined,
            columns: visual === 'table' ? (draft.options.columns ?? []).filter(key => companions.includes(key) && key !== metric) : undefined,
            yMetric: visual === 'scatter' ? yMetric : undefined,
        },
    }
}

function defaultLayout(visual: Visual): WidgetDraft['layout'] {
    if (visual === 'kpi') return { w: 3, h: 'sm' }
    if (visual === 'table' || visual === 'heatmap') return { w: 12, h: 'md' }
    return { w: 6, h: 'md' }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
            {children}
            {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
        </div>
    )
}

export function WidgetBuilder({ open, onOpenChange, initial, facts, filters, onSave }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** null: gráfico nuevo */
    initial: WidgetDraft | null
    facts: AnalyticsFacts
    filters: BoardFilters
    onSave: (draft: WidgetDraft) => Promise<boolean>
}) {
    const [draft, setDraft] = useState<WidgetDraft>(() => fixDraft(initial ?? EMPTY_DRAFT))
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (open) setDraft(fixDraft(initial ?? EMPTY_DRAFT))
    }, [open, initial])

    const update = (changes: Partial<WidgetDraft>) => setDraft(current => fixDraft({ ...current, ...changes }))
    const metric = METRICS[draft.metric]
    const [axis, breakdown = null] = draft.dimensions
    const preview = useMemo(() => runWidget(facts, draft, filters), [facts, draft, filters])
    const autoTitle = suggestTitle(facts, draft)

    const exerciseOptions = useMemo(() => {
        const counts = new Map<string, number>()
        for (const row of facts.strength) counts.set(row.x, (counts.get(row.x) ?? 0) + 1)
        return facts.exercises
            .filter(exercise => counts.has(exercise.key))
            .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0))
            .map(exercise => ({ value: exercise.key, label: exercise.name, hint: `${counts.get(exercise.key)} series` }))
    }, [facts])
    const groupOptions = useMemo(() => {
        const groups = new Set<string>()
        for (const row of facts.strength) if (row.g && row.v) groups.add(row.g)
        return [...groups].sort((a, b) => a.localeCompare(b, 'es')).map(group => ({ value: group, label: group }))
    }, [facts])
    const athleteOptions = useMemo(() => [...facts.athletes]
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map(athlete => ({ value: athlete.id, label: athlete.name, hint: athlete.status === 'active' ? undefined : 'inactivo' })), [facts])
    const companions = companionMetrics(axis).filter(item => item.key !== draft.metric)

    const save = async () => {
        setSaving(true)
        const ok = await onSave({ ...draft, title: draft.title.trim() || autoTitle })
        setSaving(false)
        if (ok) onOpenChange(false)
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl">
                <SheetHeader className="border-b border-border/60 px-5 py-4 text-left">
                    <SheetTitle>{initial ? 'Editar gráfico' : 'Añadir gráfico'}</SheetTitle>
                    <SheetDescription>Elige qué medir, cómo agruparlo y cómo verlo. La vista previa usa los filtros del tablero.</SheetDescription>
                </SheetHeader>

                <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[360px_1fr] lg:overflow-hidden">
                    <div className="order-2 space-y-4 border-border/60 p-5 lg:order-1 lg:overflow-y-auto lg:border-r">
                        <Field label="Qué medir" hint={metric?.description}>
                            <Select value={draft.metric} onValueChange={value => update({ metric: value, layout: draft.layout })}>
                                <SelectTrigger aria-label="Métrica"><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-[360px]">
                                    {METRIC_FAMILIES.map(family => (
                                        <SelectGroup key={family}>
                                            <SelectLabel>{family}</SelectLabel>
                                            {metricsOfFamily(family).map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
                                        </SelectGroup>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label="Cómo verlo">
                            <div className="grid grid-cols-3 gap-1.5">
                                {(Object.keys(VISUALS) as Visual[]).map(visual => {
                                    const Icon = VISUAL_ICONS[visual]
                                    const allowed = visualsFor(draft.metric).includes(visual)
                                    return (
                                        <button
                                            key={visual}
                                            type="button"
                                            disabled={!allowed}
                                            aria-pressed={draft.visual === visual}
                                            onClick={() => update({ visual, layout: defaultLayout(visual) })}
                                            className={cn(
                                                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                                                draft.visual === visual ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 hover:bg-muted',
                                                !allowed && 'cursor-not-allowed opacity-40'
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {VISUALS[visual].label}
                                        </button>
                                    )
                                })}
                            </div>
                        </Field>

                        {draft.visual !== 'kpi' && (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={draft.visual === 'scatter' ? 'Un punto por' : draft.visual === 'table' ? 'Una fila por' : 'Eje'}>
                                    <Select value={axis} onValueChange={value => update({ dimensions: [value as Dimension, ...(breakdown ? [breakdown] : [])] })}>
                                        <SelectTrigger aria-label="Eje"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {axesFor(draft.metric, draft.visual).map(dimension => <SelectItem key={dimension} value={dimension}>{DIMENSIONS[dimension].label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </Field>
                                {VISUALS[draft.visual].breakdown && breakdownsFor(draft.metric, axis).length > 0 && (
                                    <Field label={draft.visual === 'heatmap' ? 'Filas' : 'Una serie por'}>
                                        <Select
                                            value={breakdown ?? NO_BREAKDOWN}
                                            onValueChange={value => update({ dimensions: value === NO_BREAKDOWN ? [axis] : [axis, value as Dimension] })}
                                        >
                                            <SelectTrigger aria-label="Desglose"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {draft.visual !== 'heatmap' && <SelectItem value={NO_BREAKDOWN}>Nada (total)</SelectItem>}
                                                {breakdownsFor(draft.metric, axis).map(dimension => <SelectItem key={dimension} value={dimension}>{DIMENSIONS[dimension].label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                )}
                            </div>
                        )}

                        {draft.visual === 'scatter' && (
                            <Field label="Eje vertical" hint="El eje horizontal es la métrica de arriba.">
                                <Select value={draft.options.yMetric} onValueChange={value => update({ options: { ...draft.options, yMetric: value } })}>
                                    <SelectTrigger aria-label="Métrica del eje vertical"><SelectValue placeholder="Elige una métrica" /></SelectTrigger>
                                    <SelectContent className="max-h-[320px]">
                                        {companions.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}

                        {draft.visual === 'table' && (
                            <Field label="Más columnas">
                                <MultiSelect
                                    ariaLabel="Columnas de la tabla"
                                    options={companions.map(item => ({ value: item.key, label: item.label, hint: item.family }))}
                                    value={draft.options.columns ?? []}
                                    onChange={columns => update({ options: { ...draft.options, columns } })}
                                    placeholder="Buscar métrica…"
                                    emptyLabel="Solo la métrica principal"
                                />
                            </Field>
                        )}

                        {breakdown && draft.visual !== 'table' && (
                            <Field label="Máximo de series">
                                <Select value={String(draft.options.topN ?? 8)} onValueChange={value => update({ options: { ...draft.options, topN: Number(value) } })}>
                                    <SelectTrigger aria-label="Máximo de series"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[3, 5, 8, 12, 20].map(value => <SelectItem key={value} value={String(value)}>{value} con más valor</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}

                        {draft.visual === 'kpi' && !metric?.timeless && (
                            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-sm">
                                Comparar con el periodo anterior
                                <Switch checked={!!draft.options.compare} onCheckedChange={compare => update({ options: { ...draft.options, compare } })} />
                            </label>
                        )}

                        <div className="space-y-3 rounded-xl border border-border/70 p-3">
                            <p className="text-xs font-semibold">Filtros de este gráfico</p>
                            {metric?.source === 'strength' && (
                                <>
                                    <Field label="Ejercicios">
                                        <MultiSelect ariaLabel="Ejercicios" options={exerciseOptions} value={draft.filters.exerciseKeys ?? []} onChange={exerciseKeys => update({ filters: { ...draft.filters, exerciseKeys } })} placeholder="Buscar ejercicio…" />
                                    </Field>
                                    <Field label="Grupos musculares">
                                        <MultiSelect ariaLabel="Grupos musculares" options={groupOptions} value={draft.filters.groups ?? []} onChange={groups => update({ filters: { ...draft.filters, groups } })} placeholder="Buscar grupo…" />
                                    </Field>
                                </>
                            )}
                            {metric?.source === 'cardio' && (
                                <Field label="Disciplinas">
                                    <MultiSelect
                                        ariaLabel="Disciplinas"
                                        options={Object.entries(DISCIPLINE_LABELS).map(([value, label]) => ({ value, label }))}
                                        value={draft.filters.disciplines ?? []}
                                        onChange={disciplines => update({ filters: { ...draft.filters, disciplines } })}
                                        placeholder="Buscar disciplina…"
                                    />
                                </Field>
                            )}
                            <Field label="Atletas" hint="Vacío: los del tablero.">
                                <MultiSelect ariaLabel="Atletas del gráfico" options={athleteOptions} value={draft.filters.athleteIds ?? []} onChange={athleteIds => update({ filters: { ...draft.filters, athleteIds } })} placeholder="Buscar atleta…" emptyLabel="Los del tablero" />
                            </Field>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Ancho">
                                <Select value={String(draft.layout.w)} onValueChange={value => update({ layout: { ...draft.layout, w: Number(value) as WidgetWidth } })}>
                                    <SelectTrigger aria-label="Ancho"><SelectValue /></SelectTrigger>
                                    <SelectContent>{WIDTH_OPTIONS.map(option => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </Field>
                            <Field label="Alto">
                                <Select value={draft.layout.h} onValueChange={value => update({ layout: { ...draft.layout, h: value as WidgetHeight } })}>
                                    <SelectTrigger aria-label="Alto"><SelectValue /></SelectTrigger>
                                    <SelectContent>{HEIGHT_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </div>

                    <div className="order-1 space-y-3 bg-muted/30 p-5 lg:order-2 lg:overflow-y-auto">
                        <Field label="Título">
                            <Input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder={autoTitle} maxLength={120} />
                        </Field>
                        <Card className="p-4">
                            <p className="mb-3 truncate text-sm font-semibold">{draft.title.trim() || autoTitle}</p>
                            <WidgetChart result={preview} visual={draft.visual} height={draft.layout.h === 'sm' && draft.visual !== 'kpi' ? 'md' : draft.layout.h} />
                        </Card>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {initial ? 'Guardar cambios' : 'Añadir al tablero'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
