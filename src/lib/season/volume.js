// Volumen de temporada: objetivo, programado y realizado por semana y
// disciplina.
//
// - Objetivo: lo que decide el coach en la pestaña Temporada.
// - Programado: lo que hay en el calendario (mismas cifras que "Carga de la
//   semana" en Planificación). Las importaciones de Strava sin plan no cuentan.
// - Realizado: sesiones hechas en NexTrain más actividades de Strava que no
//   estén ya contadas a través de una sesión.
//
// Las semanas empiezan en lunes y las fechas se tratan como días locales
// ("YYYY-MM-DD"), igual que el calendario. Puro (sin dependencias de la app)
// para probarlo con node --test.

import { cardioDiscipline } from '../cardio/discipline.js'

/** @typedef {'run' | 'bike' | 'swim' | 'strength' | 'other'} SeasonDiscipline */
/** @typedef {'time' | 'distance'} SeasonUnit */
/** @typedef {{ minutes: number, km: number, sessions: number }} VolumeAmount */

/** @type {SeasonDiscipline[]} */
export const SEASON_DISCIPLINES = ['run', 'bike', 'swim', 'strength', 'other']

const FROM_CARDIO = { running: 'run', bicicleta: 'bike', natacion: 'swim', hibrido: 'other' }

/**
 * Disciplina de temporada a partir de los campos de una sesión o actividad.
 * Reutiliza la clasificación de Progreso para que las cifras cuadren.
 * @param {...(string | null | undefined)} values
 * @returns {SeasonDiscipline}
 */
export function seasonDiscipline(...values) {
  return /** @type {SeasonDiscipline} */ (FROM_CARDIO[cardioDiscipline(...values)] ?? 'other')
}

function parseDay(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatDay(date) {
  return date.toISOString().slice(0, 10)
}

/** Suma días a una fecha "YYYY-MM-DD" */
export function addDays(day, days) {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDay(date)
}

/** Lunes de la semana de una fecha (acepta también "YYYY-MM-DDTHH:mm…") */
export function mondayOf(day) {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return formatDay(date)
}

export function isMonday(day) {
  return mondayOf(day) === String(day).slice(0, 10)
}

/** Lunes de cada semana de la temporada */
export function seasonWeekStarts(startDate, weekCount) {
  const monday = mondayOf(startDate)
  return Array.from({ length: Math.max(0, weekCount) }, (_, index) => addDays(monday, index * 7))
}

/** Semanas completas entre el lunes de inicio y la fecha final (incluida) */
export function weekCountBetween(startDate, endDate) {
  const diff = (parseDay(mondayOf(endDate)).getTime() - parseDay(mondayOf(startDate)).getTime()) / 86400000
  return Math.max(1, Math.round(diff / 7) + 1)
}

/**
 * @returns {'past' | 'current' | 'future'}
 */
export function weekTiming(weekStart, today) {
  const currentMonday = mondayOf(today)
  if (weekStart < currentMonday) return 'past'
  if (weekStart > currentMonday) return 'future'
  return 'current'
}

/** @returns {VolumeAmount} */
function emptyAmount() {
  return { minutes: 0, km: 0, sessions: 0 }
}

function addTo(amount, minutes, km) {
  amount.minutes += Number(minutes) > 0 ? Number(minutes) : 0
  amount.km += Number(km) > 0 ? Number(km) : 0
  amount.sessions += 1
}

function round(amount) {
  return {
    minutes: Math.round(amount.minutes),
    km: Math.round(amount.km * 10) / 10,
    sessions: amount.sessions,
  }
}

/**
 * Agrega programado y realizado por semana y disciplina.
 *
 * Una actividad de Strava enlazada (o emparejada) con una sesión que ya cuenta
 * como realizada no se suma otra vez. Si está emparejada con una sesión que el
 * atleta no ha marcado, sí cuenta: la actividad existe aunque falte el enlace.
 *
 * @param {{
 *   weekStarts: string[],
 *   plannedCardio: Array<{ date: string, discipline: SeasonDiscipline, minutes: number | null, km: number | null }>,
 *   plannedStrength: Array<{ date: string }>,
 *   doneCardio: Array<{ id: string, date: string, discipline: SeasonDiscipline, minutes: number | null, km: number | null, stravaActivityId?: string | null }>,
 *   stravaActivities: Array<{ id: string, date: string, discipline: SeasonDiscipline, minutes: number | null, km: number | null, cardioSessionId?: string | null, matchedSessionId?: string | null }>,
 *   doneStrength: Array<{ date: string }>,
 * }} input
 * @returns {Record<string, Record<SeasonDiscipline, { planned: VolumeAmount, done: VolumeAmount, doneMissingData: number }>>}
 */
export function aggregateSeasonVolume({ weekStarts, plannedCardio, plannedStrength, doneCardio, stravaActivities, doneStrength }) {
  /** @type {Record<string, Record<string, { planned: VolumeAmount, done: VolumeAmount, doneMissingData: number }>>} */
  const result = {}
  for (const weekStart of weekStarts) {
    result[weekStart] = Object.fromEntries(SEASON_DISCIPLINES.map((discipline) => [
      discipline,
      { planned: emptyAmount(), done: emptyAmount(), doneMissingData: 0 },
    ]))
  }
  const cell = (date, discipline) => result[mondayOf(date)]?.[discipline]

  for (const session of plannedCardio) {
    const target = cell(session.date, session.discipline)
    if (target) addTo(target.planned, session.minutes, session.km)
  }
  for (const session of plannedStrength) {
    const target = cell(session.date, 'strength')
    if (target) target.planned.sessions += 1
  }

  const stravaById = new Map(stravaActivities.map((activity) => [activity.id, activity]))
  const countedSessionIds = new Set()
  const countedStravaIds = new Set()

  for (const session of doneCardio) {
    countedSessionIds.add(session.id)
    const linked = session.stravaActivityId ? stravaById.get(session.stravaActivityId) : null
    if (linked) countedStravaIds.add(linked.id)
    const target = cell(session.date, session.discipline)
    if (!target) continue
    // Marcada como hecha sin datos: se toman los de Strava si está enlazada
    const hasData = Number(session.minutes) > 0 || Number(session.km) > 0
    const minutes = hasData ? session.minutes : linked?.minutes
    const km = hasData ? session.km : linked?.km
    if (!(Number(minutes) > 0) && !(Number(km) > 0)) target.doneMissingData += 1
    addTo(target.done, minutes, km)
  }

  for (const activity of stravaActivities) {
    if (countedStravaIds.has(activity.id)) continue
    if (activity.cardioSessionId && countedSessionIds.has(activity.cardioSessionId)) continue
    if (activity.matchedSessionId && countedSessionIds.has(activity.matchedSessionId)) continue
    const target = cell(activity.date, activity.discipline)
    if (target) addTo(target.done, activity.minutes, activity.km)
  }

  for (const session of doneStrength) {
    const target = cell(session.date, 'strength')
    if (target) target.done.sessions += 1
  }

  for (const week of Object.values(result)) {
    for (const value of Object.values(week)) {
      value.planned = round(value.planned)
      value.done = round(value.done)
    }
  }
  return /** @type {any} */ (result)
}

/**
 * Magnitud con la que se mide una disciplina: la fuerza siempre en sesiones;
 * el resto en la unidad de la temporada.
 * @param {SeasonDiscipline} discipline
 * @param {SeasonUnit} unit
 * @returns {'minutes' | 'km' | 'sessions'}
 */
export function measureFor(discipline, unit) {
  if (discipline === 'strength') return 'sessions'
  return unit === 'distance' ? 'km' : 'minutes'
}

/**
 * Valor de un objetivo guardado en la magnitud de la disciplina.
 * @param {{ target_minutes?: number | null, target_km?: number | null, target_sessions?: number | null } | null | undefined} target
 */
export function targetAmount(target, measure) {
  if (!target) return null
  const value = measure === 'sessions' ? target.target_sessions : measure === 'km' ? target.target_km : target.target_minutes
  return value === null || value === undefined ? null : Number(value)
}

/**
 * Lectura de un valor frente a su referencia, con la banda verde 90-110 %.
 * - none: no hay referencia
 * - empty: hay referencia y el valor es 0 ("sin planificar" si es programado)
 * @returns {'none' | 'empty' | 'low' | 'ok' | 'high'}
 */
export function deviationStatus(reference, value) {
  if (!(Number(reference) > 0)) return 'none'
  if (!(Number(value) > 0)) return 'empty'
  const ratio = Number(value) / Number(reference)
  if (ratio < 0.9) return 'low'
  if (ratio > 1.1) return 'high'
  return 'ok'
}

/** Porcentaje entero (null sin referencia) */
export function percentOf(reference, value) {
  if (!(Number(reference) > 0)) return null
  return Math.round((Number(value || 0) / Number(reference)) * 100)
}

/**
 * Texto que escribe el coach en una celda a su magnitud: el tiempo en horas
 * ("3", "3,5" o "3:30" → 210 min), la distancia en km y la fuerza en sesiones.
 * Vacío → null; texto no válido → NaN.
 */
export function parseTargetInput(text, measure) {
  const value = String(text ?? '').trim().replace(',', '.')
  if (!value) return null
  if (measure === 'minutes') {
    const clock = value.match(/^(\d{1,3}):([0-5]\d)$/)
    if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  }
  if (!/^\d+(\.\d+)?$/.test(value)) return NaN
  const number = Number(value)
  if (measure === 'minutes') return Math.round(number * 60)
  if (measure === 'sessions') return Number.isInteger(number) ? number : NaN
  return Math.round(number * 10) / 10
}

/** Valor guardado como texto editable (inverso de parseTargetInput) */
export function targetInputValue(value, measure) {
  if (value === null || value === undefined) return ''
  const number = Number(value)
  if (measure !== 'minutes') return String(number).replace('.', ',')
  const hours = Math.floor(number / 60)
  const minutes = Math.round(number % 60)
  return minutes ? `${hours}:${String(minutes).padStart(2, '0')}` : String(hours)
}

/** «3 h 15 min», «45 min» */
export function formatMinutes(minutes) {
  const total = Math.round(Number(minutes) || 0)
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Texto de una cantidad en su magnitud */
export function formatAmount(value, measure) {
  const number = Number(value) || 0
  if (measure === 'minutes') return formatMinutes(number)
  if (measure === 'km') return `${number.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
  return `${number} ${number === 1 ? 'sesión' : 'sesiones'}`
}
