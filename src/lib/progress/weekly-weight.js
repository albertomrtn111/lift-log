/*
 * Peso diario o agrupado por semanas (lunes a domingo) para las gráficas de
 * Progreso del atleta y del coach. Trabaja con fechas 'yyyy-MM-dd' en UTC para
 * que el huso horario del navegador no mueva un registro de semana.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** @param {string} dateStr 'yyyy-MM-dd' */
function toUtcMs(dateStr) {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
}

/** @param {number} ms */
function toDateStr(ms) {
    return new Date(ms).toISOString().slice(0, 10)
}

/** @param {string} dateStr @param {number} days */
export function addDays(dateStr, days) {
    return toDateStr(toUtcMs(dateStr) + days * DAY_MS)
}

/** Lunes de la semana de `dateStr` */
export function startOfWeek(dateStr) {
    const ms = toUtcMs(dateStr)
    const diffToMonday = (new Date(ms).getUTCDay() + 6) % 7
    return toDateStr(ms - diffToMonday * DAY_MS)
}

/** Redondea a un decimal, como se enseña el peso */
export function roundKg(value) {
    return Math.round((value + Number.EPSILON) * 10) / 10
}

/**
 * Media semanal (lunes a domingo) de los pesos registrados.
 * Los días sin registro no cuentan. Las semanas sin ningún registro no salen.
 * Si se pasa el rango, la primera y la última semana se recortan a él y se
 * marcan como incompletas.
 *
 * @param {{ date: string, weight: number | null }[]} entries
 * @param {{ rangeStart?: string, rangeEnd?: string }} [range]
 */
export function groupWeightsByWeek(entries, range = {}) {
    const { rangeStart, rangeEnd } = range
    /** @type {Map<string, number[]>} */
    const byWeek = new Map()

    for (const entry of entries) {
        const weight = entry.weight == null ? NaN : Number(entry.weight)
        if (!Number.isFinite(weight) || weight <= 0) continue
        const date = entry.date.slice(0, 10)
        if (rangeStart && date < rangeStart) continue
        if (rangeEnd && date > rangeEnd) continue
        const week = startOfWeek(date)
        const list = byWeek.get(week)
        if (list) list.push(weight)
        else byWeek.set(week, [weight])
    }

    const weeks = [...byWeek.keys()].sort()
    /** @type {WeeklyWeightPoint[]} */
    const points = []

    for (const weekStart of weeks) {
        const values = /** @type {number[]} */ (byWeek.get(weekStart))
        const weekEnd = addDays(weekStart, 6)
        const from = rangeStart && rangeStart > weekStart ? rangeStart : weekStart
        const to = rangeEnd && rangeEnd < weekEnd ? rangeEnd : weekEnd
        const rawAvg = values.reduce((sum, v) => sum + v, 0) / values.length
        const weight = roundKg(rawAvg)
        const previous = points[points.length - 1] ?? null

        points.push({
            date: weekStart,
            weekStart,
            weekEnd,
            from,
            to,
            weight,
            rawAvg,
            count: values.length,
            partial: from !== weekStart || to !== weekEnd,
            delta: previous ? roundKg(weight - previous.weight) : null,
            previousWeekStart: previous ? previous.weekStart : null,
            previousIsAdjacent: previous ? addDays(previous.weekStart, 7) === weekStart : false,
        })
    }

    return points
}

/**
 * Peso medio y variación de lo que enseña la gráfica:
 * - Día: media de los registros y último menos primero.
 * - Semana: media de las medias semanales y última semana menos la primera.
 *
 * @param {{ weight: number, rawAvg?: number }[]} points
 */
export function summarizeWeightPoints(points) {
    if (points.length === 0) return { avg: null, change: null, count: 0 }
    const avg = points.reduce((sum, p) => sum + (p.rawAvg ?? p.weight), 0) / points.length
    const change = points.length >= 2
        ? roundKg(points[points.length - 1].weight - points[0].weight)
        : null
    return { avg: roundKg(avg), change, count: points.length }
}

/**
 * Serie de la gráfica según el modo elegido.
 *
 * @param {{ date: string, weight: number | null }[]} entries
 * @param {'day' | 'week'} mode
 * @param {{ rangeStart?: string, rangeEnd?: string }} [range]
 */
export function buildWeightSeries(entries, mode, range = {}) {
    if (mode === 'week') {
        const points = groupWeightsByWeek(entries, range)
        return { mode, points, ...summarizeWeightPoints(points) }
    }

    /** @type {DailyWeightPoint[]} */
    const points = []
    for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
        const weight = entry.weight == null ? NaN : Number(entry.weight)
        if (!Number.isFinite(weight) || weight <= 0) continue
        const date = entry.date.slice(0, 10)
        if (range.rangeStart && date < range.rangeStart) continue
        if (range.rangeEnd && date > range.rangeEnd) continue
        const previous = points[points.length - 1] ?? null
        points.push({
            date,
            weight,
            delta: previous ? roundKg(weight - previous.weight) : null,
        })
    }
    return { mode, points, ...summarizeWeightPoints(points) }
}

/** '16 nov' */
export function formatShortDate(dateStr) {
    const ms = toUtcMs(dateStr)
    const d = new Date(ms)
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** '16–22 nov', '27 oct – 2 nov' o '29 dic 2025 – 4 ene 2026' */
export function formatWeekRange(from, to) {
    if (from === to) return formatShortDate(from)
    const a = new Date(toUtcMs(from))
    const b = new Date(toUtcMs(to))
    if (a.getUTCFullYear() !== b.getUTCFullYear()) {
        return `${formatShortDate(from)} ${a.getUTCFullYear()} – ${formatShortDate(to)} ${b.getUTCFullYear()}`
    }
    if (a.getUTCMonth() !== b.getUTCMonth()) {
        return `${formatShortDate(from)} – ${formatShortDate(to)}`
    }
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
}

/** '72,4' */
export function formatKg(value) {
    return roundKg(value).toFixed(1).replace('.', ',')
}

/** '+0,3', '-0,4' o '0,0' */
export function formatKgDelta(value) {
    const rounded = roundKg(value)
    if (rounded === 0) return '0,0'
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1).replace('.', ',')}`
}

/**
 * @typedef {object} WeeklyWeightPoint
 * @property {string} date Lunes de la semana (eje X)
 * @property {string} weekStart
 * @property {string} weekEnd
 * @property {string} from Primer día de la semana dentro del rango
 * @property {string} to Último día de la semana dentro del rango
 * @property {number} weight Media redondeada a un decimal
 * @property {number} rawAvg Media sin redondear
 * @property {number} count Registros de esa semana
 * @property {boolean} partial La semana no cabe entera en el rango
 * @property {number | null} delta Diferencia con el punto anterior
 * @property {string | null} previousWeekStart
 * @property {boolean} previousIsAdjacent El punto anterior es la semana justo antes
 */

/**
 * @typedef {object} DailyWeightPoint
 * @property {string} date
 * @property {number} weight
 * @property {number | null} delta Diferencia con el registro anterior
 */
