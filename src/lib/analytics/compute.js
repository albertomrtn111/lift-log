// Seguimiento de cada atleta para Analítica: adherencia de fuerza, Δ e1RM del
// bloque activo y último registro. No dependen del periodo del tablero (son el
// estado actual). Puro, sin dependencias de la app, para probarlo con node --test.
//
// - Las fechas son días locales "YYYY-MM-DD".
// - La fecha de una serie es su performed_at, nunca effective_from + semana:
//   activar un programa reescribe effective_from.
// - El Δ del bloque reutiliza progress-summary.js para que cuadre con Progreso.

import { getBlockDeltaPct, TREND_THRESHOLD } from '../training/progress-summary.js'
import { addDays } from '../season/volume.js'
import { STALE_LOG_DAYS, WINDOW_DAYS } from './metrics.js'

/**
 * @typedef {{ id: string, name: string, status: string }} AnalyticsAthlete
 * @typedef {{ id: string, clientId: string, name: string, status: string, effectiveFrom: string | null }} AnalyticsProgram
 * @typedef {{
 *   id: string
 *   programId: string
 *   name: string
 *   exerciseKey: string
 *   group: string | null
 *   countsForVolume: boolean
 *   prescribedSets: number | null
 *   prescribedRir: number | null
 * }} AnalyticsExercise
 * @typedef {{ exerciseId: string, weekIndex: number, weightKg: number, reps: number, rir: number | null, day: string }} AnalyticsSet
 * @typedef {{
 *   today: string
 *   athletes: AnalyticsAthlete[]
 *   programs: AnalyticsProgram[]
 *   exercises: AnalyticsExercise[]
 *   sets: AnalyticsSet[]
 * }} AnalyticsInput
 * @typedef {{
 *   id: string
 *   lastLogDay: string | null
 *   daysSinceLog: number | null
 *   adherence: number | null
 *   e1rmDelta: number | null
 *   e1rmExercises: number
 * }} TrackingRow
 */

const DAY_MS = 86_400_000

function dayNumber(day) {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Días de `from` a `to` (positivo si `to` es posterior) */
export function diffDays(from, to) {
  return dayNumber(to) - dayNumber(from)
}

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function pushTo(map, key, value) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** Sets de una lista agrupados por semana del programa, con la forma de Progreso */
function setsByWeek(sets) {
  /** @type {Record<number, { weightKg: number, reps: number }[]>} */
  const byWeek = {}
  for (const set of sets) (byWeek[set.weekIndex] ??= []).push(set)
  return byWeek
}

/** @param {AnalyticsInput} input */
function indexInput(input) {
  const programById = new Map(input.programs.map(program => [program.id, program]))
  const exerciseById = new Map(input.exercises.map(exercise => [exercise.id, exercise]))

  /** @type {Map<string, AnalyticsProgram>} */
  const activeProgramByClient = new Map()
  for (const program of input.programs) {
    if (program.status !== 'active') continue
    const current = activeProgramByClient.get(program.clientId)
    if (!current || (program.effectiveFrom ?? '') > (current.effectiveFrom ?? '')) {
      activeProgramByClient.set(program.clientId, program)
    }
  }

  /** @type {Map<string, AnalyticsExercise[]>} */
  const exercisesByProgram = new Map()
  for (const exercise of input.exercises) pushTo(exercisesByProgram, exercise.programId, exercise)

  /** @type {Map<string, AnalyticsSet[]>} */
  const setsByClient = new Map()
  /** @type {Map<string, AnalyticsSet[]>} */
  const setsByExercise = new Map()
  for (const set of input.sets) {
    const exercise = exerciseById.get(set.exerciseId)
    const program = exercise && programById.get(exercise.programId)
    if (!program) continue
    pushTo(setsByClient, program.clientId, set)
    pushTo(setsByExercise, set.exerciseId, set)
  }

  return { activeProgramByClient, exercisesByProgram, setsByClient, setsByExercise }
}

/**
 * Adherencia de fuerza: series efectivas del programa activo frente a las
 * prescritas en la ventana (28 días, o desde que empezó el programa). El
 * programa empieza en effective_from o en su primera serie si es anterior:
 * reactivar un programa reescribe effective_from aunque ya llevara semanas.
 */
function strengthAdherence(ctx, program, today) {
  if (!program) return null
  const exercises = ctx.exercisesByProgram.get(program.id) ?? []
  const prescribedPerWeek = exercises.reduce((sum, exercise) => sum + (exercise.prescribedSets ?? 0), 0)
  if (!prescribedPerWeek) return null

  const sets = exercises.flatMap(exercise => ctx.setsByExercise.get(exercise.id) ?? [])
  let programStart = program.effectiveFrom
  for (const set of sets) if (!programStart || set.day < programStart) programStart = set.day

  let start = addDays(today, -(WINDOW_DAYS - 1))
  if (programStart && programStart > start) start = programStart
  const days = diffDays(start, today) + 1
  if (days < 7) return null

  const done = sets.filter(set => set.day >= start && set.day <= today).length
  return done / (prescribedPerWeek * days / 7)
}

/** Mediana del Δ de bloque de los ejercicios del programa (como Progreso) */
function blockDelta(ctx, program) {
  if (!program) return { delta: null, comparable: 0 }
  const deltas = (ctx.exercisesByProgram.get(program.id) ?? [])
    .map(exercise => getBlockDeltaPct({ setsByWeek: setsByWeek(ctx.setsByExercise.get(exercise.id) ?? []) }))
    .filter(delta => delta != null)
  return { delta: median(deltas), comparable: deltas.length }
}

/**
 * @param {AnalyticsInput} input
 * @returns {TrackingRow[]}
 */
export function trackingRows(input) {
  const ctx = indexInput(input)
  const { today } = input
  return input.athletes.map(athlete => {
    let lastLogDay = null
    for (const set of ctx.setsByClient.get(athlete.id) ?? []) {
      if (set.day <= today && (!lastLogDay || set.day > lastLogDay)) lastLogDay = set.day
    }
    const program = ctx.activeProgramByClient.get(athlete.id) ?? null
    const { delta, comparable } = blockDelta(ctx, program)
    return {
      id: athlete.id,
      lastLogDay,
      daysSinceLog: lastLogDay ? diffDays(lastLogDay, today) : null,
      adherence: strengthAdherence(ctx, program, today),
      e1rmDelta: delta,
      e1rmExercises: comparable,
    }
  })
}

/**
 * Semáforo de las métricas de seguimiento
 * @param {string} key
 * @param {number | null} value
 * @returns {'good' | 'warn' | 'bad' | 'neutral'}
 */
export function metricTone(key, value) {
  if (value == null) return 'neutral'
  switch (key) {
    case 'strength_adherence':
      return value >= 0.85 ? 'good' : value >= 0.6 ? 'warn' : 'bad'
    case 'e1rm_block_delta':
      return value > TREND_THRESHOLD ? 'good' : value < -TREND_THRESHOLD ? 'bad' : 'neutral'
    case 'days_since_log':
      return value <= 7 ? 'good' : value <= STALE_LOG_DAYS ? 'warn' : 'bad'
    case 'rir_deviation':
      return Math.abs(value) <= 1 ? 'good' : Math.abs(value) < 2 ? 'warn' : 'bad'
    default:
      return 'neutral'
  }
}
