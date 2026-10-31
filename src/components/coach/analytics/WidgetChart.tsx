'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react'
import {
    Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { METRICS, isTimeDimension, type Dimension, type Visual } from '@/lib/analytics/catalog'
import type { WidgetResult } from '@/lib/analytics/engine'
import type { WidgetHeight } from '@/types/analytics'
import { TONE_TEXT, categoryLabel, formatMetric, formatMetricDelta, formatSetDetail, toneOf } from './format'

const HEIGHT_PX: Record<WidgetHeight, number> = { sm: 150, md: 280, lg: 420 }

const TOOLTIP_STYLE = 'rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg'

export type CategoryClick = (dimension: Dimension, key: string) => void

function Empty({ message, height }: { message: string; height: number }) {
    return (
        <div className="flex items-center justify-center rounded-xl bg-muted/40 px-4 text-center text-sm text-muted-foreground" style={{ height }}>
            {message}
        </div>
    )
}

function Kpi({ result, height }: { result: Extract<WidgetResult, { kind: 'kpi' }>; height: number }) {
    const metric = METRICS[result.metric]
    const delta = result.value != null && result.previous != null ? formatMetricDelta(result.metric, result.value, result.previous) : null
    const up = result.value != null && result.previous != null && result.value > result.previous
    const better = metric?.higherIsBetter == null ? null : up === metric.higherIsBetter
    const detail = formatSetDetail(result.detail)
    return (
        <div className="flex flex-col justify-center" style={{ minHeight: Math.min(height, 72) }}>
            <p className={cn('text-2xl font-bold tabular-nums tracking-tight sm:text-3xl', TONE_TEXT[toneOf(result.metric, result.value)])}>
                {formatMetric(result.metric, result.value)}
            </p>
            {delta && (
                <p className={cn('mt-1 flex items-center gap-1 text-xs font-medium', better == null ? 'text-muted-foreground' : better ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {delta} vs periodo anterior ({formatMetric(result.metric, result.previous)})
                </p>
            )}
            {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
    )
}

type SeriesResult = Extract<WidgetResult, { kind: 'series' }>

function seriesRows(result: SeriesResult) {
    return result.categories.map((category, index) => {
        const row: Record<string, unknown> = {
            key: category.key,
            label: categoryLabel(result.axis, category.key, category.label),
        }
        result.series.forEach((series, seriesIndex) => {
            row[`s${seriesIndex}`] = series.values[index]
            row[`d${seriesIndex}`] = series.details[index]
        })
        return row
    })
}

function SeriesTooltip({ active, payload, label, result }: { active?: boolean; payload?: any[]; label?: string; result: SeriesResult }) {
    if (!active || !payload?.length) return null
    const row = payload[0].payload as Record<string, any>
    const entries = result.series
        .map((series, index) => ({ series, value: row[`s${index}`] as number | null, detail: row[`d${index}`] }))
        .filter(entry => entry.value != null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    return (
        <div className={TOOLTIP_STYLE}>
            <p className="mb-1 font-semibold">{label ?? row.label}</p>
            {entries.map(({ series, value, detail }) => (
                <div key={series.key} className="flex items-start gap-2 py-0.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: series.color }} />
                    <div className="min-w-0">
                        <span className="text-muted-foreground">{series.label}: </span>
                        <span className="font-medium tabular-nums">{formatMetric(result.metric, value)}</span>
                        {formatSetDetail(detail) && <span className="block text-muted-foreground">{formatSetDetail(detail)}</span>}
                    </div>
                </div>
            ))}
        </div>
    )
}

function Legend({ result }: { result: SeriesResult }) {
    if (!result.breakdown || result.series.length < 2) return null
    return (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {result.series.map(series => (
                <span key={series.key} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: series.color }} />
                    {series.label}
                </span>
            ))}
        </div>
    )
}

function LineView({ result, height }: { result: SeriesResult; height: number }) {
    const rows = useMemo(() => seriesRows(result), [result])
    return (
        <>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={64} domain={['auto', 'auto']} tickFormatter={value => formatMetric(result.metric, value, { compact: true })} />
                        <Tooltip content={<SeriesTooltip result={result} />} />
                        {result.series.map((series, index) => (
                            <Line
                                key={series.key}
                                type="monotone"
                                dataKey={`s${index}`}
                                name={series.label}
                                stroke={series.color}
                                strokeWidth={2.25}
                                dot={{ r: 2.5, fill: series.color, strokeWidth: 0 }}
                                activeDot={{ r: 4.5 }}
                                connectNulls
                                isAnimationActive={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <Legend result={result} />
        </>
    )
}

function BarView({ result, height, onCategoryClick }: { result: SeriesResult; height: number; onCategoryClick?: CategoryClick }) {
    const rows = useMemo(() => seriesRows(result), [result])
    // Atletas o ejercicios: barras horizontales para que se lean los nombres
    const horizontal = !isTimeDimension(result.axis)
    const chartHeight = horizontal ? Math.max(height, rows.length * (result.series.length > 1 ? 34 : 26) + 30) : height
    const clickable = onCategoryClick && result.axis === 'athlete'
    return (
        <>
            <div style={{ height: horizontal ? Math.min(chartHeight, height * 1.6) : height }} className={cn(horizontal && 'overflow-y-auto')}>
                <div style={{ height: chartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={rows}
                            layout={horizontal ? 'vertical' : 'horizontal'}
                            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                            onClick={clickable ? (state: any) => { const key = state?.activePayload?.[0]?.payload?.key; if (key) onCategoryClick!(result.axis, key) } : undefined}
                        >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" horizontal={!horizontal} vertical={horizontal} />
                            {horizontal ? (
                                <>
                                    <XAxis type="number" tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={value => formatMetric(result.metric, value, { compact: true })} />
                                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" width={130} interval={0} />
                                </>
                            ) : (
                                <>
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" interval="preserveStartEnd" minTickGap={12} />
                                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={64} tickFormatter={value => formatMetric(result.metric, value, { compact: true })} />
                                </>
                            )}
                            <Tooltip content={<SeriesTooltip result={result} />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                            {result.series.map((series, index) => (
                                <Bar
                                    key={series.key}
                                    dataKey={`s${index}`}
                                    name={series.label}
                                    fill={series.color}
                                    stackId={result.breakdown && !horizontal ? 'stack' : undefined}
                                    radius={result.breakdown && !horizontal ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                                    className={cn(clickable && 'cursor-pointer')}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <Legend result={result} />
        </>
    )
}

function HeatmapView({ result, height, onCategoryClick }: { result: SeriesResult; height: number; onCategoryClick?: CategoryClick }) {
    const max = Math.max(1e-9, ...result.series.flatMap(series => series.values.map(value => Math.abs(value ?? 0))))
    const clickable = onCategoryClick && result.breakdown === 'athlete'
    return (
        <div className="overflow-auto" style={{ maxHeight: height * 1.4 }}>
            <table className="w-full border-separate border-spacing-[3px] text-xs">
                <thead>
                    <tr className="text-muted-foreground">
                        <th className="sticky left-0 bg-card text-left font-medium" />
                        {result.categories.map(category => (
                            <th key={category.key} className="whitespace-nowrap px-1 font-medium">{categoryLabel(result.axis, category.key, category.label)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {result.series.map(series => (
                        <tr key={series.key}>
                            <th scope="row" className="sticky left-0 max-w-[140px] truncate bg-card pr-2 text-left font-medium">
                                {clickable ? (
                                    <button type="button" className="truncate hover:text-primary" onClick={() => onCategoryClick!('athlete', series.key)}>{series.label}</button>
                                ) : series.label}
                            </th>
                            {series.values.map((value, index) => {
                                const alpha = value ? 0.12 + (Math.abs(value) / max) * 0.78 : 0
                                return (
                                    <td
                                        key={result.categories[index].key}
                                        title={`${series.label} · ${categoryLabel(result.axis, result.categories[index].key, result.categories[index].label)}: ${formatMetric(result.metric, value)}`}
                                        className={cn('h-7 min-w-[34px] rounded text-center tabular-nums', !value && 'bg-muted/40 text-muted-foreground/60', alpha > 0.55 && 'text-primary-foreground')}
                                        style={value ? { backgroundColor: `hsl(var(--primary) / ${alpha})` } : undefined}
                                    >
                                        {value ? formatMetric(result.metric, value, { compact: true }).replace(/ (kg|km|ppm|m|h|ms)$/, '') : '·'}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function TableView({ result, height, onCategoryClick }: { result: Extract<WidgetResult, { kind: 'table' }>; height: number; onCategoryClick?: CategoryClick }) {
    const [sort, setSort] = useState<{ column: number; dir: 'asc' | 'desc' } | null>(null)
    const rows = useMemo(() => {
        if (!sort) return result.rows
        const sign = sort.dir === 'asc' ? 1 : -1
        return [...result.rows].sort((a, b) => {
            if (sort.column === -1) return sign * a.label.localeCompare(b.label, 'es')
            const va = a.values[sort.column]
            const vb = b.values[sort.column]
            if (va == null && vb == null) return a.label.localeCompare(b.label, 'es')
            if (va == null) return 1
            if (vb == null) return -1
            return sign * (va - vb)
        })
    }, [result.rows, sort])
    const toggle = (column: number) => setSort(current => (current?.column === column
        ? { column, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { column, dir: column === -1 ? 'asc' : 'desc' }))
    const clickable = onCategoryClick && result.axis === 'athlete'
    const SortIcon = ({ column }: { column: number }) => (sort?.column === column ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null)

    return (
        <div className="overflow-auto" style={{ maxHeight: height }}>
            <table className="w-full min-w-max text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border/60 text-xs text-muted-foreground">
                        <th className="px-2 py-2 text-left font-medium">
                            <button type="button" onClick={() => toggle(-1)} className="inline-flex items-center gap-1 hover:text-foreground">
                                {result.axis === 'athlete' ? 'Atleta' : result.axis === 'exercise' ? 'Ejercicio' : 'Valor'}
                                <SortIcon column={-1} />
                            </button>
                        </th>
                        {result.columns.map((column, index) => (
                            <th key={column} className="px-2 py-2 text-right font-medium">
                                <button type="button" title={METRICS[column]?.description} onClick={() => toggle(index)} className="inline-flex items-center gap-1 hover:text-foreground">
                                    {METRICS[column]?.label ?? column}
                                    <SortIcon column={index} />
                                </button>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr
                            key={row.key}
                            onClick={clickable ? () => onCategoryClick!(result.axis, row.key) : undefined}
                            className={cn('border-b border-border/40 last:border-0', clickable && 'cursor-pointer hover:bg-muted/40')}
                        >
                            <td className="max-w-[220px] truncate px-2 py-2 font-medium">{categoryLabel(result.axis, row.key, row.label)}</td>
                            {row.values.map((value, index) => (
                                <td key={result.columns[index]} className={cn('px-2 py-2 text-right tabular-nums', TONE_TEXT[toneOf(result.columns[index], value)])}>
                                    {formatMetric(result.columns[index], value)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function ScatterView({ result, height, onCategoryClick }: { result: Extract<WidgetResult, { kind: 'scatter' }>; height: number; onCategoryClick?: CategoryClick }) {
    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 15, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                    <XAxis type="number" dataKey="x" name={METRICS[result.xMetric]?.label} tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={value => formatMetric(result.xMetric, value, { compact: true })}
                        label={{ value: METRICS[result.xMetric]?.label, position: 'insideBottom', offset: -5, fontSize: 11 }} />
                    <YAxis type="number" dataKey="y" name={METRICS[result.yMetric]?.label} tick={{ fontSize: 11 }} className="text-muted-foreground" width={60} tickFormatter={value => formatMetric(result.yMetric, value, { compact: true })} />
                    <ZAxis range={[70, 70]} />
                    <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                            const point = active ? payload?.[0]?.payload : null
                            if (!point) return null
                            return (
                                <div className={TOOLTIP_STYLE}>
                                    <p className="font-semibold">{point.label}</p>
                                    <p>{METRICS[result.xMetric]?.label}: <span className="font-medium">{formatMetric(result.xMetric, point.x)}</span></p>
                                    <p>{METRICS[result.yMetric]?.label}: <span className="font-medium">{formatMetric(result.yMetric, point.y)}</span></p>
                                </div>
                            )
                        }}
                    />
                    <Scatter
                        data={result.points}
                        fill="#3b82f6"
                        isAnimationActive={false}
                        className={cn(onCategoryClick && result.axis === 'athlete' && 'cursor-pointer')}
                        onClick={onCategoryClick && result.axis === 'athlete' ? (point: any) => onCategoryClick(result.axis, point.key) : undefined}
                    />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    )
}

export function WidgetChart({ result, visual, height, onCategoryClick }: {
    result: WidgetResult
    visual: Visual
    height: WidgetHeight
    onCategoryClick?: CategoryClick
}) {
    const px = HEIGHT_PX[height]
    switch (result.kind) {
        case 'empty': return <Empty message={result.message} height={visual === 'kpi' ? 72 : px} />
        case 'kpi': return <Kpi result={result} height={px} />
        case 'table': return <TableView result={result} height={px} onCategoryClick={onCategoryClick} />
        case 'scatter': return <ScatterView result={result} height={px} onCategoryClick={onCategoryClick} />
        case 'series':
            if (visual === 'heatmap') return <HeatmapView result={result} height={px} onCategoryClick={onCategoryClick} />
            if (visual === 'bar') return <BarView result={result} height={px} onCategoryClick={onCategoryClick} />
            return <LineView result={result} height={px} />
    }
}
