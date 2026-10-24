/**
 * @typedef {import('@/app/(coach)/coach/workspace/training-progress-actions').ProgressExerciseSet} ProgressExerciseSet
 * @typedef {import('@/app/(coach)/coach/workspace/training-progress-actions').ProgressExercise} ProgressExercise
 * @typedef {import('@/app/(coach)/coach/workspace/training-progress-actions').ProgressDay} ProgressDay
 */

// Umbral del 1% para no marcar como cambio el ruido de redondeos
export const TREND_THRESHOLD = 0.01

/**
 * 1RM estimado (Epley). Compara mejor que "peso del top set" porque captura
 * el trade-off peso/reps: 100kg×5 > 102.5kg×1.
 * @param {ProgressExerciseSet} set
 * @returns {number | null}
 */
export function epley1RM(set) {
  if (set.weightKg == null) return null
  if (set.reps == null || set.reps <= 0) return set.weightKg
  return set.weightKg * (1 + set.reps / 30)
}

/**
 * @param {ProgressExerciseSet[]} sets
 * @returns {number | null}
 */
export function getBestE1RM(sets) {
  /** @type {number | null} */
  let best = null
  for (const set of sets) {
    const value = epley1RM(set)
    if (value != null && (best == null || value > best)) best = value
  }
  return best
}

/**
 * Δ del bloque: e1RM de la primera semana registrada vs la última
 * @param {ProgressExercise} exercise
 * @returns {number | null}
 */
export function getBlockDeltaPct(exercise) {
  const weeksWithData = Object.keys(exercise.setsByWeek)
    .map(Number)
    .filter(w => (exercise.setsByWeek[w] ?? []).length > 0)
    .sort((a, b) => a - b)

  if (weeksWithData.length < 2) return null

  const first = getBestE1RM(exercise.setsByWeek[weeksWithData[0]])
  const last = getBestE1RM(exercise.setsByWeek[weeksWithData[weeksWithData.length - 1]])
  if (first == null || last == null || first === 0) return null
  return (last - first) / first
}

/**
 * Resumen ejecutivo del bloque. `best` solo existe si algún ejercicio mejora
 * por encima del umbral: un ejercicio estable o que baja no es "mejor progreso".
 * @param {ProgressDay[]} days
 * @returns {{
 *   improving: number
 *   declining: number
 *   stable: number
 *   comparable: number
 *   best: { exercise: ProgressExercise; delta: number } | null
 *   weeksTracked: number
 * }}
 */
export function summarizeBlockProgress(days) {
  const deltas = days
    .flatMap(day => day.exercises)
    .map(exercise => ({ exercise, delta: getBlockDeltaPct(exercise) }))
    .filter(/** @returns {entry is { exercise: ProgressExercise; delta: number }} */ entry => entry.delta != null)

  const improvingDeltas = deltas.filter(d => d.delta > TREND_THRESHOLD)
  const declining = deltas.filter(d => d.delta < -TREND_THRESHOLD).length
  const stable = deltas.length - improvingDeltas.length - declining

  const best = improvingDeltas.length > 0
    ? improvingDeltas.reduce((a, b) => (b.delta > a.delta ? b : a))
    : null

  const weeksTracked = new Set()
  for (const day of days) {
    for (const exercise of day.exercises) {
      for (const key of Object.keys(exercise.setsByWeek)) {
        if ((exercise.setsByWeek[Number(key)] ?? []).length > 0) weeksTracked.add(Number(key))
      }
    }
  }

  return {
    improving: improvingDeltas.length,
    declining,
    stable,
    comparable: deltas.length,
    best,
    weeksTracked: weeksTracked.size,
  }
}
