import test from 'node:test'
import assert from 'node:assert/strict'

const { diffDays, median, metricTone, trackingRows } = await import('../src/lib/analytics/compute.js')
const { getBlockDeltaPct } = await import('../src/lib/training/progress-summary.js')

// Viernes 30-10-2026. Ana: programa activo desde el lunes 05-10, 3 ejercicios × 3 series = 9 series/semana.
const TODAY = '2026-10-30'

function baseInput() {
  return {
    today: TODAY,
    athletes: [
      { id: 'ana', name: 'Ana', status: 'active' },
      { id: 'bea', name: 'Bea', status: 'active' },
    ],
    programs: [
      { id: 'p-ana', clientId: 'ana', name: 'Bloque fuerza', status: 'active', effectiveFrom: '2026-10-05' },
      { id: 'p-ana-old', clientId: 'ana', name: 'Bloque viejo', status: 'archived', effectiveFrom: '2026-08-01' },
      { id: 'p-bea', clientId: 'bea', name: 'Bea base', status: 'active', effectiveFrom: '2026-10-26' },
    ],
    exercises: [
      { id: 'squat', programId: 'p-ana', name: 'Sentadilla', exerciseKey: 'squat', group: 'Cuádriceps', countsForVolume: true, prescribedSets: 3, prescribedRir: 2 },
      { id: 'bench', programId: 'p-ana', name: 'Press banca', exerciseKey: 'bench', group: 'Pecho', countsForVolume: true, prescribedSets: 3, prescribedRir: 2 },
      { id: 'jump', programId: 'p-ana', name: 'Salto al cajón', exerciseKey: 'jump', group: 'Piernas', countsForVolume: false, prescribedSets: 3, prescribedRir: null },
      { id: 'old-row', programId: 'p-ana-old', name: 'Remo', exerciseKey: 'row', group: 'Espalda', countsForVolume: true, prescribedSets: 3, prescribedRir: 1 },
      { id: 'bea-squat', programId: 'p-bea', name: 'Sentadilla', exerciseKey: 'squat', group: 'Cuádriceps', countsForVolume: true, prescribedSets: 4, prescribedRir: 2 },
    ],
    sets: [
      ...[0, 1, 2].map(() => ({ exerciseId: 'squat', weekIndex: 1, weightKg: 100, reps: 5, rir: 2, day: '2026-10-05' })),
      ...[0, 1, 2].map(() => ({ exerciseId: 'squat', weekIndex: 4, weightKg: 110, reps: 5, rir: 3, day: '2026-10-26' })),
      ...[0, 1, 2].map(() => ({ exerciseId: 'bench', weekIndex: 4, weightKg: 80, reps: 8, rir: 1, day: '2026-10-27' })),
      { exerciseId: 'jump', weekIndex: 4, weightKg: 0, reps: 5, rir: null, day: '2026-10-27' },
      { exerciseId: 'old-row', weekIndex: 3, weightKg: 70, reps: 10, rir: 1, day: '2026-09-10' },
    ],
  }
}

const rowOf = (rows, id) => rows.find(row => row.id === id)

test('fechas y mediana', () => {
  assert.equal(diffDays('2026-10-26', TODAY), 4)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([]), null)
})

test('seguimiento: último registro, adherencia y Δ del bloque como en Progreso', () => {
  const ana = rowOf(trackingRows(baseInput()), 'ana')
  assert.equal(ana.lastLogDay, '2026-10-27')
  assert.equal(ana.daysSinceLog, 3)
  // 26 días de programa (05-10 a 30-10) → 9 × 26/7 series esperadas; 10 hechas
  assert.ok(Math.abs(ana.adherence - 10 / (9 * 26 / 7)) < 1e-9)
  const progreso = getBlockDeltaPct({ setsByWeek: { 1: [{ weightKg: 100, reps: 5 }], 4: [{ weightKg: 110, reps: 5 }] } })
  assert.equal(ana.e1rmDelta, progreso)
  assert.equal(ana.e1rmExercises, 1, 'la banca solo tiene una semana')
})

test('adherencia: sin dato con menos de 7 días de programa', () => {
  const bea = rowOf(trackingRows(baseInput()), 'bea')
  assert.equal(bea.adherence, null, 'Bea empezó el lunes 26-10')
  assert.equal(bea.daysSinceLog, null)
})

test('adherencia: un programa reactivado empieza en su primera serie, no en effective_from', () => {
  const input = baseInput()
  input.sets = [0, 1, 2, 3].map(() => ({ exerciseId: 'bea-squat', weekIndex: 1, weightKg: 80, reps: 5, rir: 2, day: '2026-10-12' }))
  const bea = rowOf(trackingRows(input), 'bea')
  // Ventana 12-10 a 30-10 = 19 días → 4 × 19/7 series esperadas
  assert.ok(Math.abs(bea.adherence - 4 / (4 * 19 / 7)) < 1e-9)
})

test('sin programa activo: sin adherencia ni Δ', () => {
  const input = baseInput()
  input.programs = input.programs.map(program => ({ ...program, status: 'archived' }))
  const ana = rowOf(trackingRows(input), 'ana')
  assert.equal(ana.adherence, null)
  assert.equal(ana.e1rmDelta, null)
  assert.equal(ana.daysSinceLog, 3, 'el último registro no depende del programa')
})

test('semáforos', () => {
  assert.equal(metricTone('strength_adherence', 0.9), 'good')
  assert.equal(metricTone('strength_adherence', 0.7), 'warn')
  assert.equal(metricTone('strength_adherence', 0.3), 'bad')
  assert.equal(metricTone('e1rm_block_delta', 0.005), 'neutral', 'bajo el umbral del 1 % de Progreso')
  assert.equal(metricTone('e1rm_block_delta', -0.03), 'bad')
  assert.equal(metricTone('days_since_log', 15), 'bad')
  assert.equal(metricTone('rir_deviation', -1.5), 'warn')
  assert.equal(metricTone('rir_deviation', null), 'neutral')
})
