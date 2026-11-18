'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    formatKg,
    formatKgDelta,
    formatShortDate,
    formatWeekRange,
    type DailyWeightPoint,
    type WeeklyWeightPoint,
} from '@/lib/progress/weekly-weight'
import { cn } from '@/lib/utils'

export type WeightGrouping = 'day' | 'week'

export const WEIGHT_GROUPING_OPTIONS: Array<{ value: WeightGrouping; label: string }> = [
    { value: 'day', label: 'Día' },
    { value: 'week', label: 'Semana' },
]

/**
 * Día o semana para la gráfica de peso, recordado en este navegador.
 * Empieza en «Día» y lee lo guardado al montar para no romper la hidratación.
 */
export function useWeightGrouping(storageKey: string) {
    const [grouping, setGroupingState] = useState<WeightGrouping>('day')

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(storageKey)
            if (saved === 'day' || saved === 'week') setGroupingState(saved)
        } catch {
            // Sin almacenamiento (modo privado): se queda en «Día»
        }
    }, [storageKey])

    const setGrouping = useCallback((value: WeightGrouping) => {
        setGroupingState(value)
        try {
            window.localStorage.setItem(storageKey, value)
        } catch {
            // Sin almacenamiento: la elección vale solo para esta visita
        }
    }, [storageKey])

    return [grouping, setGrouping] as const
}

export type WeightChartPoint = DailyWeightPoint | WeeklyWeightPoint

function isWeekly(point: WeightChartPoint): point is WeeklyWeightPoint {
    return 'weekStart' in point
}

/** Etiqueta del eje X: el día o el lunes de la semana */
export function formatWeightAxisDate(date: string) {
    return formatShortDate(date)
}

function DeltaLine({ delta, label }: { delta: number | null; label: string }) {
    if (delta === null) return <p className="text-muted-foreground">{label}</p>
    return (
        <p className="text-muted-foreground">
            <span className={cn(
                'font-semibold tabular-nums',
                delta > 0 && 'text-rose-500',
                delta < 0 && 'text-primary',
                delta === 0 && 'text-foreground/70'
            )}>
                {formatKgDelta(delta)} kg
            </span>{' '}
            {label}
        </p>
    )
}

/** Tooltip de la gráfica de peso, para recharts (`content={<WeightTooltip />}`) */
export function WeightTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WeightChartPoint }> }) {
    const point = active ? payload?.[0]?.payload : undefined
    if (!point) return null

    if (isWeekly(point)) {
        const deltaLabel = point.previousWeekStart === null
            ? 'Primera semana del rango'
            : point.previousIsAdjacent
                ? 'vs semana anterior'
                : `vs semana del ${formatShortDate(point.previousWeekStart)}`
        return (
            <div className="min-w-[170px] space-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                <p className="font-medium text-foreground">Semana {formatWeekRange(point.from, point.to)}</p>
                <p className="text-base font-bold tabular-nums text-foreground">
                    {formatKg(point.weight)} <span className="text-xs font-normal text-muted-foreground">kg de media</span>
                </p>
                {point.delta === null
                    ? <p className="text-muted-foreground">{deltaLabel}</p>
                    : <DeltaLine delta={point.delta} label={deltaLabel} />}
                <p className="text-muted-foreground">
                    Media de {point.count} {point.count === 1 ? 'registro' : 'registros'}
                    {point.partial && <span className="text-amber-600 dark:text-amber-400"> · semana incompleta</span>}
                </p>
            </div>
        )
    }

    return (
        <div className="min-w-[150px] space-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
            <p className="font-medium text-foreground">{formatShortDate(point.date)} {point.date.slice(0, 4)}</p>
            <p className="text-base font-bold tabular-nums text-foreground">
                {formatKg(point.weight)} <span className="text-xs font-normal text-muted-foreground">kg</span>
            </p>
            {point.delta !== null && <DeltaLine delta={point.delta} label="vs registro anterior" />}
        </div>
    )
}

/**
 * Punto de cada semana en la gráfica: relleno si la semana está entera y
 * hueco si el rango la corta (primera o última).
 */
export function WeightWeekDot({ cx, cy, payload, color = 'hsl(var(--primary))' }: {
    cx?: number
    cy?: number
    payload?: WeightChartPoint
    color?: string
}) {
    if (cx == null || cy == null || !payload) return null
    const partial = isWeekly(payload) && payload.partial
    return (
        <circle
            cx={cx}
            cy={cy}
            r={partial ? 3.5 : 4}
            fill={partial ? 'hsl(var(--card))' : color}
            stroke={color}
            strokeWidth={partial ? 2 : 0}
        />
    )
}
