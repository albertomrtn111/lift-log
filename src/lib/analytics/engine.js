// Motor de Analítica: convierte la configuración de un gráfico (métrica + eje +
// desglose + filtros + visual) en los datos que pinta. Trabaja sobre los hechos
// ya leídos de la base de datos (una fila por serie, por día de métricas o por
// sesión de cardio), así que cambiar un selector no vuelve a consultar nada.
// Puro, sin dependencias de la app, para probarlo con node --test.

import { addDays, mondayOf } from '../season/volume.js'
import { median } from './compute.js'
import { DISCIPLINE_LABELS, METRICS, PERIODS, SERIES_COLORS, isTimeDimension } from './catalog.js'

/**
 * @typedef {import('./catalog.js').Dimension} Dimension
 * @typedef {import('./catalog.js').Visual} Visual
 * @typedef {{ a: string, d: string, x: string, g: string | null, v: boolean, kg: number, reps: number, rir: number | null, prir: number | null, e1rm: number | null, ton: number }} StrengthFact
 * @typedef {{ a: string, d: string, weight: number | null, steps: number | null, sleep_h: number | null, sleep_score: number | null, hrv: number | null, fatigue: number | null }} BodyFact
 * @typedef {{ a: string, d: string, disc: string, km: number | null, min: number | null, hr: number | null, rpe: number | null, elev: number | null }} CardioFact
 * @typedef {{ a: string, adherence: number | null, block_e1rm: number | null, days_since_log: number | null }} TrackingFact
 * @typedef {{
 *   today: string
 *   loadedFrom: string
 *   athletes: { id: string, name: string, status: string }[]
 *   exercises: { key: string, name: string, group: string | null }[]
 *   strength: StrengthFact[]
 *   body: BodyFact[]
 *   cardio: CardioFact[]
 *   tracking: TrackingFact[]
 * }} AnalyticsFacts
 * @typedef {{ period: string, from?: string | null, to?: string | null, status: 'active' | 'inactive' | 'all', athleteIds: string[] }} BoardFilters
 * @typedef {{ exerciseKeys?: string[], groups?: string[], disciplines?: string[], athleteIds?: string[] }} WidgetFilters
 * @typedef {{ compare?: boolean, topN?: number, columns?: string[], yMetric?: string }} WidgetOptions
 * @typedef {{ metric: string, visual: Visual, dimensions: Dimension[], filters?: WidgetFilters, options?: WidgetOptions }} WidgetSpec
 * @typedef {{ from: string, to: string }} DateRange
 * @typedef {{ kg: number, reps: number, rir: number | null, d: string }} SetDetail
 * @typedef {{ key: string, label: string }} Category
 * @typedef {{ key: string, label: string, color: string, values: (number | null)[], details: (SetDetail | null)[] }} Series
 * @typedef {(
 *   | { kind: 'empty', message: string }
 *   | { kind: 'kpi', metric: string, value: number | null, previous: number | null, detail: SetDetail | null }
 *   | { kind: 'series', metric: string, axis: Dimension, breakdown: Dimension | null, categories: Category[], series: Series[] }
 *   | { kind: 'table', axis: Dimension, columns: string[], rows: { key: string, label: string, values: (number | null)[] }[] }
 *   | { kind: 'scatter', axis: Dimension, xMetric: string, yMetric: string, points: { key: string, label: string, x: number, y: number }[] }
 * )} WidgetResult
 */

const DAY_MS = 86_400_000

function dayNumber(day) {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

function daysBetween(from, to) {
  return dayNumber(to) - dayNumber(from) + 1
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function numbers(rows, pick) {
  const values = []
  for (const row of rows) {
    const value = pick(row)
    if (value != null && Number.isFinite(value)) values.push(value)
  }
  return values
}

function groupBy(rows, keyOf) {
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  for (const row of rows) {
    const key = keyOf(row)
    if (key == null) continue
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return groups
}

// ─── Periodo ─────────────────────────────────────────────────────────

/**
 * @param {BoardFilters} filters
 * @param {string} today
 * @returns {DateRange}
 */
export function resolveRange(filters, today) {
  if (filters.period === 'custom' && filters.from && filters.to && filters.from <= filters.to) {
    return { from: filters.from, to: filters.to }
  }
  const days = PERIODS[filters.period]?.days || PERIODS['12w'].days
  return { from: addDays(today, -(days - 1)), to: today }
}

/** Periodo anterior de la misma duración, para comparar KPIs */
export function previousRange(range) {
  const days = daysBetween(range.from, range.to)
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}

/** Desde qué día hay que leer hechos para un periodo y su comparación */
export function loadStart(range) {
  return previousRange(range).from
}

// ─── Agregados de cada métrica ───────────────────────────────────────

/** @param {StrengthFact[]} rows */
function bestBy(rows, pick) {
  let best = null
  for (const row of rows) {
    const value = pick(row)
    if (value != null && (best == null || value > pick(best))) best = row
  }
  return best
}

/** Δ e1RM primera → última semana con series, por atleta y ejercicio; mediana */
function e1rmChange(rows) {
  const deltas = []
  for (const group of groupBy(rows, row => `${row.a}|${row.x}`).values()) {
    const byWeek = new Map()
    for (const row of group) {
      if (row.e1rm == null) continue
      const week = mondayOf(row.d)
      byWeek.set(week, Math.max(byWeek.get(week) ?? 0, row.e1rm))
    }
    if (byWeek.size < 2) continue
    const weeks = [...byWeek.keys()].sort()
    const first = byWeek.get(weeks[0])
    const last = byWeek.get(weeks[weeks.length - 1])
    if (first > 0) deltas.push((last - first) / first)
  }
  return median(deltas)
}

/** Últimos 7 días con registro menos los 7 primeros, por atleta; media */
function weightChange(rows) {
  const changes = []
  for (const group of groupBy(rows.filter(row => row.weight != null), row => row.a).values()) {
    const days = group.map(row => row.d).sort()
    const first = days[0]
    const last = days[days.length - 1]
    if (daysBetween(first, last) < 8) continue
    const start = mean(group.filter(row => row.d <= addDays(first, 6)).map(row => row.weight))
    const end = mean(group.filter(row => row.d >= addDays(last, -6)).map(row => row.weight))
    if (start != null && end != null) changes.push(end - start)
  }
  return mean(changes)
}

/**
 * Valor de una métrica sobre un conjunto de filas de su fuente.
 * @param {string} metricKey
 * @param {any[]} rows
 * @param {{ days: number }} context días que cubren las filas (para "por semana")
 * @returns {number | null}
 */
export function aggregate(metricKey, rows, context) {
  switch (metricKey) {
    case 'e1rm': return bestBy(rows, row => row.e1rm)?.e1rm ?? null
    case 'top_kg': return bestBy(rows, row => row.kg)?.kg ?? null
    case 'e1rm_change': return e1rmChange(rows)
    case 'sets': return rows.length
    case 'sets_per_week': return context.days > 0 ? rows.length / (context.days / 7) : null
    case 'tonnage': return sum(rows.map(row => row.ton))
    case 'reps': return sum(rows.map(row => row.reps))
    case 'rir_avg': return mean(numbers(rows, row => row.rir))
    case 'rir_dev': return mean(numbers(rows, row => (row.rir != null && row.prir != null ? row.rir - row.prir : null)))
    case 'strength_sessions': return new Set(rows.map(row => `${row.a}|${row.d}`)).size
    case 'weight': return mean(numbers(rows, row => row.weight))
    case 'weight_change': return weightChange(rows)
    case 'steps': return mean(numbers(rows, row => row.steps))
    case 'sleep_h': return mean(numbers(rows, row => row.sleep_h))
    case 'sleep_score': return mean(numbers(rows, row => row.sleep_score))
    case 'hrv': return mean(numbers(rows, row => row.hrv))
    case 'fatigue': return mean(numbers(rows, row => row.fatigue))
    case 'cardio_km': return sum(numbers(rows, row => row.km))
    case 'cardio_min': return sum(numbers(rows, row => row.min))
    case 'cardio_sessions': return rows.length
    case 'cardio_pace': {
      const paced = rows.filter(row => row.km > 0 && row.min > 0)
      const km = sum(paced.map(row => row.km))
      return km > 0 ? sum(paced.map(row => row.min)) / km : null
    }
    case 'cardio_hr': return mean(numbers(rows, row => row.hr))
    case 'cardio_rpe': return mean(numbers(rows, row => row.rpe))
    case 'cardio_elevation': return sum(numbers(rows, row => row.elev))
    case 'adherence': return median(numbers(rows, row => row.adherence))
    case 'block_e1rm': return median(numbers(rows, row => row.block_e1rm))
    case 'days_since_log': return median(numbers(rows, row => row.days_since_log))
    default: return null
  }
}

/** La serie que da el valor de e1RM o carga máxima, para el tooltip */
function detailOf(metricKey, rows) {
  const best = metricKey === 'e1rm' ? bestBy(rows, row => row.e1rm) : metricKey === 'top_kg' ? bestBy(rows, row => row.kg) : null
  return best ? { kg: best.kg, reps: best.reps, rir: best.rir, d: best.d } : null
}

// ─── Filtros y ejes ──────────────────────────────────────────────────

/**
 * Atletas que entran en un gráfico: los del tablero (o los del estado elegido)
 * y, si el gráfico tiene los suyos, la intersección.
 * @param {AnalyticsFacts} facts
 * @param {BoardFilters} board
 * @param {WidgetFilters} filters
 */
export function athleteScope(facts, board, filters = {}) {
  let athletes = board.athleteIds?.length
    ? facts.athletes.filter(athlete => board.athleteIds.includes(athlete.id))
    : facts.athletes.filter(athlete => board.status === 'all' || athlete.status === board.status)
  if (filters.athleteIds?.length) athletes = athletes.filter(athlete => filters.athleteIds.includes(athlete.id))
  return new Set(athletes.map(athlete => athlete.id))
}

/**
 * Filas de la fuente de una métrica que cumplen los filtros
 * @param {AnalyticsFacts} facts
 * @param {string} metricKey
 * @param {{ athletes: Set<string>, range: DateRange, filters: WidgetFilters }} scope
 */
export function rowsFor(facts, metricKey, scope) {
  const metric = METRICS[metricKey]
  if (!metric) return []
  const { athletes, range, filters } = scope
  const inRange = row => row.d >= range.from && row.d <= range.to
  switch (metric.source) {
    case 'strength': {
      const exercises = filters.exerciseKeys?.length ? new Set(filters.exerciseKeys) : null
      const groups = filters.groups?.length ? new Set(filters.groups) : null
      return facts.strength.filter(row => athletes.has(row.a) && inRange(row)
        && (!exercises || exercises.has(row.x)) && (!groups || (row.g != null && groups.has(row.g))))
    }
    case 'body':
      return facts.body.filter(row => athletes.has(row.a) && inRange(row))
    case 'cardio': {
      const disciplines = filters.disciplines?.length ? new Set(filters.disciplines) : null
      return facts.cardio.filter(row => athletes.has(row.a) && inRange(row) && (!disciplines || disciplines.has(row.disc)))
    }
    case 'tracking':
      return facts.tracking.filter(row => athletes.has(row.a))
    default:
      return []
  }
}

/**
 * Valor de una fila en un eje. Las series de grupos que no cuentan para
 * volumen (pliometría, cardio, cuerpo completo) no tienen grupo muscular.
 * @param {Dimension} dimension
 */
function keyOf(dimension, row) {
  switch (dimension) {
    case 'day': return row.d
    case 'week': return mondayOf(row.d)
    case 'month': return `${row.d.slice(0, 7)}-01`
    case 'athlete': return row.a
    case 'exercise': return row.x ?? null
    case 'muscle_group': return row.g && row.v ? row.g : null
    case 'discipline': return row.disc ?? null
    case 'none': return 'all'
    default: return null
  }
}

/** Todos los cubos de tiempo del periodo, también los vacíos */
export function timeBuckets(dimension, range) {
  const keys = []
  if (dimension === 'day') {
    for (let day = range.from; day <= range.to; day = addDays(day, 1)) keys.push(day)
  } else if (dimension === 'week') {
    for (let day = mondayOf(range.from); day <= range.to; day = addDays(day, 7)) keys.push(day)
  } else if (dimension === 'month') {
    let [year, month] = range.from.split('-').map(Number)
    const last = range.to.slice(0, 7)
    for (;;) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      keys.push(`${key}-01`)
      if (key >= last) break
      month += 1
      if (month > 12) { month = 1; year += 1 }
    }
  }
  return keys
}

/** Días que cubre un cubo de tiempo dentro del periodo (para "por semana") */
function bucketDays(dimension, key, range) {
  if (dimension === 'day') return 1
  if (dimension === 'week') {
    const start = key < range.from ? range.from : key
    const end = addDays(key, 6) > range.to ? range.to : addDays(key, 6)
    return daysBetween(start, end)
  }
  if (dimension === 'month') {
    const [year, month] = key.split('-').map(Number)
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    const start = key < range.from ? range.from : key
    const end = monthEnd > range.to ? range.to : monthEnd
    return daysBetween(start, end)
  }
  return daysBetween(range.from, range.to)
}

function labelFor(facts, dimension, key) {
  switch (dimension) {
    case 'athlete': return facts.athletes.find(athlete => athlete.id === key)?.name ?? 'Atleta'
    case 'exercise': return facts.exercises.find(exercise => exercise.key === key)?.name ?? 'Ejercicio'
    case 'discipline': return DISCIPLINE_LABELS[key] ?? key
    case 'none': return 'Total'
    default: return key
  }
}

// ─── Gráfico ─────────────────────────────────────────────────────────

const DEFAULT_TOP_SERIES = 8
const DEFAULT_TOP_CATEGORIES = 20

function emptyResult(message) {
  return /** @type {WidgetResult} */ ({ kind: 'empty', message })
}

/**
 * @param {AnalyticsFacts} facts
 * @param {WidgetSpec} spec
 * @param {BoardFilters} board
 * @returns {WidgetResult}
 */
export function runWidget(facts, spec, board) {
  const metric = METRICS[spec.metric]
  if (!metric) return emptyResult('Métrica desconocida.')
  const filters = spec.filters ?? {}
  const options = spec.options ?? {}
  const range = resolveRange(board, facts.today)
  const athletes = athleteScope(facts, board, filters)
  if (athletes.size === 0) return emptyResult('Ningún atleta con estos filtros.')
  const scope = { athletes, range, filters }
  const rows = rowsFor(facts, spec.metric, scope)
  const [axis = 'none', breakdown = null] = spec.dimensions ?? []
  const periodDays = daysBetween(range.from, range.to)

  if (spec.visual === 'kpi') {
    if (!rows.length) return emptyResult('Sin datos en el periodo.')
    let previous = null
    if (options.compare && !metric.timeless) {
      const before = previousRange(range)
      if (facts.loadedFrom <= before.from) {
        const previousRows = rowsFor(facts, spec.metric, { ...scope, range: before })
        if (previousRows.length) previous = aggregate(spec.metric, previousRows, { days: periodDays })
      }
    }
    return {
      kind: 'kpi',
      metric: spec.metric,
      value: aggregate(spec.metric, rows, { days: periodDays }),
      previous,
      detail: detailOf(spec.metric, rows),
    }
  }

  if (spec.visual === 'table') {
    const columns = [spec.metric, ...(options.columns ?? []).filter(key => key !== spec.metric && METRICS[key])]
    const keys = axis === 'athlete'
      ? [...athletes]
      : [...new Set(rows.map(row => keyOf(axis, row)).filter(key => key != null))]
    const rowsByColumn = columns.map(key => (key === spec.metric ? rows : rowsFor(facts, key, scope)))
    const table = keys.map(key => ({
      key,
      label: labelFor(facts, axis, key),
      values: columns.map((column, index) => {
        const subset = rowsByColumn[index].filter(row => keyOf(axis, row) === key)
        return subset.length ? aggregate(column, subset, { days: isTimeDimension(axis) ? bucketDays(axis, key, range) : periodDays }) : null
      }),
    }))
    if (isTimeDimension(axis)) table.sort((a, b) => a.key.localeCompare(b.key))
    else table.sort((a, b) => a.label.localeCompare(b.label, 'es'))
    if (!table.length) return emptyResult('Sin datos en el periodo.')
    return { kind: 'table', axis, columns, rows: table }
  }

  if (spec.visual === 'scatter') {
    const yMetric = options.yMetric && METRICS[options.yMetric] ? options.yMetric : null
    if (!yMetric) return emptyResult('Elige la métrica del eje vertical.')
    const yRows = rowsFor(facts, yMetric, scope)
    const xGroups = groupBy(rows, row => keyOf(axis, row))
    const yGroups = groupBy(yRows, row => keyOf(axis, row))
    const points = []
    for (const [key, xSubset] of xGroups) {
      const ySubset = yGroups.get(key)
      if (!ySubset) continue
      const x = aggregate(spec.metric, xSubset, { days: periodDays })
      const y = aggregate(yMetric, ySubset, { days: periodDays })
      if (x != null && y != null) points.push({ key, label: labelFor(facts, axis, key), x, y })
    }
    if (!points.length) return emptyResult('Ningún punto con las dos métricas.')
    return { kind: 'scatter', axis, xMetric: spec.metric, yMetric, points }
  }

  // Línea, barras y mapa de calor: categorías en el eje y una serie por valor del desglose
  if (!rows.length) return emptyResult('Sin datos en el periodo.')
  const timeAxis = isTimeDimension(axis)
  const groupsBySeries = breakdown ? groupBy(rows, row => keyOf(breakdown, row)) : new Map([['all', rows]])
  const totalOf = subset => aggregate(spec.metric, subset, { days: periodDays }) ?? -Infinity
  const seriesKeys = [...groupsBySeries.keys()]
    .sort((a, b) => totalOf(groupsBySeries.get(b)) - totalOf(groupsBySeries.get(a)))
    .slice(0, options.topN || DEFAULT_TOP_SERIES)

  let categoryKeys
  if (timeAxis) {
    categoryKeys = timeBuckets(axis, range)
  } else {
    const byCategory = groupBy(rows, row => keyOf(axis, row))
    categoryKeys = [...byCategory.keys()]
      .sort((a, b) => totalOf(byCategory.get(b)) - totalOf(byCategory.get(a)))
      .slice(0, DEFAULT_TOP_CATEGORIES)
  }
  if (!categoryKeys.length) return emptyResult('Sin datos para este eje.')

  const series = seriesKeys.map((seriesKey, index) => {
    const cells = groupBy(groupsBySeries.get(seriesKey), row => keyOf(axis, row))
    const values = []
    const details = []
    for (const key of categoryKeys) {
      const subset = cells.get(key)
      values.push(subset ? aggregate(spec.metric, subset, { days: timeAxis ? bucketDays(axis, key, range) : periodDays }) : null)
      details.push(subset ? detailOf(spec.metric, subset) : null)
    }
    return {
      key: seriesKey,
      label: breakdown ? labelFor(facts, breakdown, seriesKey) : METRICS[spec.metric].label,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values,
      details,
    }
  })

  return {
    kind: 'series',
    metric: spec.metric,
    axis,
    breakdown,
    categories: categoryKeys.map(key => ({ key, label: labelFor(facts, axis, key) })),
    series,
  }
}

/** Título automático: "e1RM por semana · Sentadilla" */
export function suggestTitle(facts, spec) {
  const metric = METRICS[spec.metric]
  if (!metric) return 'Gráfico'
  const [axis, breakdown] = spec.dimensions ?? []
  const parts = [metric.label]
  const axisLabels = { day: 'por día', week: 'por semana', month: 'por mes', athlete: 'por atleta', exercise: 'por ejercicio', muscle_group: 'por grupo muscular', discipline: 'por disciplina' }
  if (spec.visual === 'scatter' && spec.options?.yMetric && METRICS[spec.options.yMetric]) {
    parts[0] = `${metric.label} vs ${METRICS[spec.options.yMetric].label}`
  }
  if (axis && axisLabels[axis]) parts.push(axisLabels[axis])
  if (breakdown && axisLabels[breakdown] && spec.visual !== 'table') parts.push(`y ${axisLabels[breakdown].replace('por ', '')}`)
  let title = parts.join(' ')
  const exercises = spec.filters?.exerciseKeys ?? []
  if (exercises.length === 1) title += ` · ${labelFor(facts, 'exercise', exercises[0])}`
  else if (exercises.length > 1) title += ` · ${exercises.length} ejercicios`
  const groups = spec.filters?.groups ?? []
  if (groups.length) title += ` · ${groups.join(', ')}`
  const disciplines = spec.filters?.disciplines ?? []
  if (disciplines.length) title += ` · ${disciplines.map(key => DISCIPLINE_LABELS[key] ?? key).join(', ')}`
  return title
}
