// Entreno del día y resumen de la semana del atleta. Puro (fechas YYYY-MM-DD)
// para probarlo con node --test. Sigue la misma regla que el calendario del
// atleta: los días del programa activo caen en su día de la semana y una
// sesión programada a mano sustituye a la del mismo día del programa.

/** @param {string} key */
function toUtc(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** @param {number} ms */
function fromUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. @param {string} key */
export function isoWeekday(key) {
  const day = new Date(toUtc(key)).getUTCDay()
  return day === 0 ? 7 : day
}

/** Lunes de la semana de esa fecha. @param {string} key */
export function mondayOf(key) {
  return fromUtc(toUtc(key) - (isoWeekday(key) - 1) * 86_400_000)
}

/** @param {string} key @param {number} days */
export function addDays(key, days) {
  return fromUtc(toUtc(key) + days * 86_400_000)
}

/**
 * @typedef {{ id: string; name: string | null; default_weekday: number | null }} TrainingDay
 * @typedef {{ effective_from: string | null; weeks: number | null; training_days: TrainingDay[] }} ActiveProgram
 * @typedef {{ day_id: string; scheduled_date: string; is_completed?: boolean | null }} ScheduledStrength
 */

/**
 * Sesiones de fuerza de una fecha: las programadas a mano ese día y los días
 * del programa que caen ese día de la semana (si no se han movido esa semana).
 * @param {{ program: ActiveProgram | null; scheduled: ScheduledStrength[]; dateKey: string }} input
 * @returns {string[]} nombres de los días
 */
export function strengthSessionsOn({ program, scheduled, dateKey }) {
  const days = new Map((program?.training_days ?? []).map((day) => [day.id, day]))
  const weekStart = mondayOf(dateKey)
  const weekEnd = addDays(weekStart, 6)
  const movedThisWeek = new Set(
    scheduled.filter((s) => s.scheduled_date >= weekStart && s.scheduled_date <= weekEnd).map((s) => s.day_id),
  )

  /** @type {string[]} */
  const names = []
  for (const session of scheduled) {
    if (session.scheduled_date !== dateKey || session.is_completed) continue
    names.push(days.get(session.day_id)?.name?.trim() || 'Sesión de fuerza')
  }

  if (program?.effective_from) {
    const firstMonday = mondayOf(program.effective_from.slice(0, 10))
    const totalWeeks = program.weeks && program.weeks > 0 ? program.weeks : 4
    const lastDay = addDays(firstMonday, totalWeeks * 7 - 1)
    if (dateKey >= firstMonday && dateKey <= lastDay) {
      const weekday = isoWeekday(dateKey)
      for (const day of program.training_days ?? []) {
        if (day.default_weekday !== weekday || movedThisWeek.has(day.id)) continue
        names.push(day.name?.trim() || 'Sesión de fuerza')
      }
    }
  }
  return names
}

/**
 * @typedef {{ name?: string | null; training_type?: string | null; target_duration_min?: number | null; target_distance_km?: number | null }} CardioSession
 */

/** «Rodaje · 45 min», «Series · 8 km» @param {CardioSession} session */
export function describeCardio(session) {
  const name = session.name?.trim() || session.training_type?.trim() || 'Cardio'
  if (session.target_duration_min) return `${name} · ${Math.round(session.target_duration_min)} min`
  if (session.target_distance_km) return `${name} · ${String(Math.round(session.target_distance_km * 10) / 10).replace('.', ',')} km`
  return name
}

/**
 * Push del entreno del día. null si hoy no hay nada.
 * @param {{ strength: string[]; cardio: CardioSession[] }} input
 */
export function buildTodayWorkoutCopy({ strength, cardio }) {
  const items = [...strength, ...cardio.map(describeCardio)]
  if (items.length === 0) return null
  const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
  return {
    title: `Hoy toca: ${list}`,
    body: 'Lo tienes listo en la app. Registra la sesión al terminar.',
    url: strength.length > 0 && cardio.length === 0 ? '/routine' : '/planning',
  }
}

/**
 * Aviso de los lunes con la semana del atleta. null si no tiene nada programado.
 * @param {{ strengthCount: number; cardioCount: number }} input
 */
export function buildWeekSummaryCopy({ strengthCount, cardioCount }) {
  if (strengthCount + cardioCount === 0) return null
  const parts = []
  if (strengthCount > 0) parts.push(`${strengthCount} ${strengthCount === 1 ? 'sesión de fuerza' : 'sesiones de fuerza'}`)
  if (cardioCount > 0) parts.push(`${cardioCount} de cardio`)
  if (strengthCount === 0 && cardioCount > 0) parts[0] = `${cardioCount} ${cardioCount === 1 ? 'sesión de cardio' : 'sesiones de cardio'}`
  return {
    title: `Tu semana: ${parts.join(' y ')}`,
    body: 'Échale un vistazo a tu planificación para organizarte.',
    url: '/planning',
  }
}
