import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { metricTone } from '@/lib/analytics/compute'
import { METRICS, isTimeDimension, type Dimension } from '@/lib/analytics/catalog'
import type { SetDetail } from '@/lib/analytics/engine'

const formatters = new Map<number, Intl.NumberFormat>()

function number(value: number, decimals: number) {
    let formatter = formatters.get(decimals)
    if (!formatter) {
        formatter = new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        formatters.set(decimals, formatter)
    }
    return formatter.format(value)
}

// Unidades que se escriben detrás del número; el resto se sobreentiende por el título
const SHOWN_UNITS = new Set(['kg', 'km', 'ppm', 'm', 'h', 'ms'])

function pace(minutesPerKm: number) {
    const total = Math.round(minutesPerKm * 60)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`
}

/** Valor con la unidad y los decimales del catálogo: "102,5 kg", "84 %", "5:12/km" */
export function formatMetric(metricKey: string, value: number | null | undefined, { compact = false } = {}) {
    if (value == null || !Number.isFinite(value)) return '—'
    const metric = METRICS[metricKey]
    if (!metric) return number(value, 1)
    switch (metric.unit) {
        case '%': return `${number(value * 100, metric.decimals)} %`
        case 'min/km': return pace(value)
        case 'min': return value >= 120 ? `${number(value / 60, 1)} h` : `${number(value, 0)} min`
        default: {
            // En ejes y celdas, sin decimales a partir de 10
            const decimals = compact && Math.abs(value) >= 10 ? 0 : metric.decimals
            return SHOWN_UNITS.has(metric.unit) ? `${number(value, decimals)} ${metric.unit}` : number(value, decimals)
        }
    }
}

/** Diferencia con signo para comparar con el periodo anterior */
export function formatMetricDelta(metricKey: string, value: number, previous: number) {
    const metric = METRICS[metricKey]
    if (metric?.unit === '%') {
        const points = (value - previous) * 100
        return `${points >= 0 ? '+' : '−'}${number(Math.abs(points), 1)} pp`
    }
    if (previous === 0) return null
    const change = (value - previous) / Math.abs(previous)
    return `${change >= 0 ? '+' : '−'}${number(Math.abs(change * 100), 0)} %`
}

export function formatDay(day: string, pattern = 'd MMM') {
    return format(new Date(`${day.slice(0, 10)}T12:00:00`), pattern, { locale: es })
}

/** Etiqueta de una categoría del eje: fechas legibles, el resto tal cual */
export function categoryLabel(dimension: Dimension, key: string, label: string) {
    if (!isTimeDimension(dimension)) return label
    if (dimension === 'month') return formatDay(key, 'MMM yy')
    return formatDay(key)
}

export function formatSetDetail(detail: SetDetail | null) {
    if (!detail) return null
    const rir = detail.rir != null ? ` · RIR ${number(detail.rir, 0)}` : ''
    return `${number(detail.kg, detail.kg % 1 ? 1 : 0)} kg × ${detail.reps}${rir} · ${formatDay(detail.d)}`
}

// Semáforos de las métricas de seguimiento, con los mismos umbrales que antes en Cartera
const TONE_KEYS: Record<string, string> = {
    adherence: 'strength_adherence',
    block_e1rm: 'e1rm_block_delta',
    e1rm_change: 'e1rm_block_delta',
    days_since_log: 'days_since_log',
    rir_dev: 'rir_deviation',
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export function toneOf(metricKey: string, value: number | null): Tone {
    const key = TONE_KEYS[metricKey]
    return key ? metricTone(key, value) : 'neutral'
}

export const TONE_TEXT: Record<Tone, string> = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
    neutral: '',
}
