// Medidas diarias adicionales que el coach puede pedir a cada atleta.
// Peso, pasos y horas de sueño son la base y se registran siempre.

export type DailyMetricExtraKey = 'hrv' | 'sleep_score' | 'fatigue'

export interface DailyMetricExtra {
    key: DailyMetricExtraKey
    /** Columna en client_metrics */
    column: 'hrv_ms' | 'sleep_score' | 'fatigue'
    label: string
    shortLabel: string
    unit: string
    /** Texto del rango para el coach ("de 0 a 100") */
    rangeLabel: string
    description: string
    input: 'number' | 'scale'
    min: number
    max: number
    step?: number
}

export const DAILY_METRIC_EXTRAS: DailyMetricExtra[] = [
    {
        key: 'hrv',
        column: 'hrv_ms',
        label: 'VFC',
        shortLabel: 'VFC',
        unit: 'ms',
        rangeLabel: 'en ms',
        description: 'Variabilidad de la frecuencia cardiaca al despertar (la que marca tu reloj o anillo).',
        input: 'number',
        min: 1,
        max: 400,
        step: 1,
    },
    {
        key: 'sleep_score',
        column: 'sleep_score',
        label: 'Puntuación del sueño',
        shortLabel: 'Sueño',
        unit: '/100',
        rangeLabel: 'de 0 a 100',
        description: 'La puntuación de 0 a 100 que te da tu reloj o anillo.',
        input: 'number',
        min: 0,
        max: 100,
        step: 1,
    },
    {
        key: 'fatigue',
        column: 'fatigue',
        label: 'Fatiga',
        shortLabel: 'Fatiga',
        unit: '/5',
        rangeLabel: 'de 1 a 5',
        description: 'Cansancio general y muscular: 1 = fresco, 5 = muy cargado.',
        input: 'scale',
        min: 1,
        max: 5,
    },
]

export const FATIGUE_LABELS: Record<number, string> = {
    1: 'Fresco',
    2: 'Bien',
    3: 'Normal',
    4: 'Cargado',
    5: 'Muy cargado',
}

export function enabledDailyExtras(keys: string[] | null | undefined) {
    const enabled = new Set(keys ?? [])
    return DAILY_METRIC_EXTRAS.filter(extra => enabled.has(extra.key))
}

export function isDailyMetricExtraKey(value: string): value is DailyMetricExtraKey {
    return DAILY_METRIC_EXTRAS.some(extra => extra.key === value)
}
