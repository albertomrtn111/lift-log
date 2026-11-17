// Días de fuerza que el coach quita en una semana concreta del programa
// (tabla strength_day_week_skips). Puro y con fechas YYYY-MM-DD para que lo
// usen igual la web, los avisos y el MCP, y probarlo con node --test.
//
// La semana es la del programa: la 1 es la semana (lunes a domingo) de
// effective_from, como training_exercise_sets.week_index y la pantalla Fuerza.

const DAY_MS = 86_400_000

/** @param {string} key */
function toUtc(key) {
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** @param {number} ms */
function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Lunes de la semana de esa fecha. @param {string} key */
export function mondayOfDate(key) {
  const day = new Date(toUtc(key)).getUTCDay()
  return fromUtc(toUtc(key) - ((day + 6) % 7) * DAY_MS)
}

/**
 * Semana del programa (1, 2…) a la que pertenece una fecha. Sin tope por
 * arriba: quien la usa decide si está dentro de la duración.
 * @param {string | null | undefined} effectiveFrom
 * @param {string | null | undefined} dateKey
 * @returns {number | null}
 */
export function programWeekOfDate(effectiveFrom, dateKey) {
  if (!effectiveFrom || !dateKey) return null
  const week = Math.round((toUtc(mondayOfDate(dateKey)) - toUtc(mondayOfDate(effectiveFrom))) / (7 * DAY_MS)) + 1
  return week >= 1 ? week : null
}

/**
 * Fecha en la que cae un día del programa en una semana, por su default_weekday.
 * @param {string | null | undefined} effectiveFrom
 * @param {number} week
 * @param {number | null | undefined} weekday 1 = lunes … 7 = domingo
 */
export function programDayDate(effectiveFrom, week, weekday) {
  const value = Number(weekday)
  if (!effectiveFrom || !Number.isInteger(value) || value < 1 || value > 7 || !(week >= 1)) return null
  return fromUtc(toUtc(mondayOfDate(effectiveFrom)) + ((week - 1) * 7 + value - 1) * DAY_MS)
}

/** Lunes y domingo de una semana del programa. @param {string} effectiveFrom @param {number} week */
export function programWeekRange(effectiveFrom, week) {
  const start = fromUtc(toUtc(mondayOfDate(effectiveFrom)) + (week - 1) * 7 * DAY_MS)
  return { start, end: fromUtc(toUtc(start) + 6 * DAY_MS) }
}

/** @param {string} programId @param {string} dayId @param {number} week */
export function skipKey(programId, dayId, week) {
  return `${programId}:${dayId}:${week}`
}

/**
 * @typedef {{ program_id?: string; programId?: string; day_id?: string; dayId?: string; week_index?: number; week?: number }} SkipRow
 */

/**
 * Conjunto de claves programa:día:semana a partir de filas de la tabla
 * (snake_case) o de objetos ya mapeados (camelCase).
 * @param {SkipRow[] | null | undefined} rows
 */
export function buildSkipSet(rows) {
  const set = new Set()
  for (const row of rows ?? []) {
    const programId = row.program_id ?? row.programId
    const dayId = row.day_id ?? row.dayId
    const week = Number(row.week_index ?? row.week)
    if (programId && dayId && Number.isInteger(week)) set.add(skipKey(programId, dayId, week))
  }
  return set
}

/**
 * ¿Ese día de ese programa está quitado en esa semana?
 * @param {Set<string>} skipSet @param {string | null | undefined} programId
 * @param {string | null | undefined} dayId @param {number | null | undefined} week
 */
export function isDaySkipped(skipSet, programId, dayId, week) {
  if (!skipSet?.size || !programId || !dayId || !week) return false
  return skipSet.has(skipKey(programId, dayId, week))
}

/**
 * ¿Una sesión programada (fila de scheduled_strength_sessions) cae en una semana
 * en la que su día está quitado? La semana sale de su fecha, no de la plantilla.
 * @param {Set<string>} skipSet
 * @param {{ program_id: string; day_id: string; scheduled_date: string }} session
 * @param {string | null | undefined} effectiveFrom inicio del programa de esa sesión
 */
export function isSessionSkipped(skipSet, session, effectiveFrom) {
  return isDaySkipped(skipSet, session.program_id, session.day_id, programWeekOfDate(effectiveFrom, session.scheduled_date))
}

/**
 * Semanas en las que se han quitado todos los días con día de la semana fijo
 * (en las demás aún toca algo). Sirve para no contarlas como pendientes.
 * @param {Set<string>} skipSet @param {string} programId
 * @param {{ id: string; default_weekday?: number | null; defaultWeekday?: number | null }[]} days
 * @param {number} totalWeeks
 * @returns {number[]}
 */
export function fullySkippedWeeks(skipSet, programId, days, totalWeeks) {
  const scheduled = (days ?? []).filter((day) => (day.default_weekday ?? day.defaultWeekday) != null)
  const pool = scheduled.length > 0 ? scheduled : days ?? []
  if (pool.length === 0) return []
  const weeks = []
  for (let week = 1; week <= totalWeeks; week++) {
    if (pool.every((day) => isDaySkipped(skipSet, programId, day.id, week))) weeks.push(week)
  }
  return weeks
}
