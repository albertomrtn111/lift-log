import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COACH_NOTES_COLUMN_ID,
  COACH_NOTES_KEY,
  athleteNoteCells,
  hasLoggedSetValues,
  isAthleteNotesColumn,
  isClientEditable,
  logFieldForColumnKey,
  mapRoutineColumns,
  nextExerciseLog,
} from '../src/lib/training/exercise-notes.js'

// Columnas por defecto de un programa (src/lib/training/defaultColumns.ts)
const defaultColumns = [
  { id: 'col-exercise', key: 'exercise', label: 'Ejercicio', data_type: 'text', scope: 'exercise', editable_by: 'coach', order_index: 1 },
  { id: 'col-sets', key: 'sets', label: 'Series', data_type: 'number', scope: 'week', editable_by: 'coach', order_index: 2 },
  { id: 'col-tips', key: 'tips', label: 'Tips', data_type: 'text', scope: 'week', editable_by: 'coach', order_index: 6 },
  { id: 'col-weight', key: 'weight', label: 'Peso', data_type: 'number', scope: 'week', editable_by: 'client', order_index: 7 },
  { id: 'col-notes', key: 'notes', label: 'Notas', data_type: 'text', scope: 'week', editable_by: 'both', order_index: 9 },
]

// Programa antiguo: notas del coach en c6 y del atleta en c10
const legacyColumns = [
  { id: 'c6-id', key: 'c6', label: 'Notas', data_type: 'textarea', scope: 'exercise', editable_by: 'coach', order_index: 5 },
  { id: 'c7-id', key: 'c7', label: 'Peso (kg)', data_type: 'number', scope: 'week', editable_by: 'client', order_index: 6 },
  { id: 'c10-id', key: 'c10', label: 'Notas', data_type: 'textarea', scope: 'week', editable_by: 'client', order_index: 9 },
]

test('the notes column shared by coach and athlete is editable by the athlete (NXT-154)', () => {
  assert.equal(isClientEditable('both'), true)
  assert.equal(isClientEditable('client'), true)
  assert.equal(isClientEditable('coach'), false)
  assert.equal(isClientEditable(null), false)

  const columns = mapRoutineColumns(defaultColumns)
  const notes = columns.find((c) => c.key === 'notes')
  assert.equal(notes.editable, true)
  assert.equal(isAthleteNotesColumn(notes), true)
  assert.equal(isAthleteNotesColumn(columns.find((c) => c.key === 'tips')), false)
  assert.equal(isAthleteNotesColumn({ key: 'notes', editable: false }), false)
  assert.equal(isAthleteNotesColumn(undefined), false)
})

test('mapRoutineColumns adds the exercise name and the coach notes, in order', () => {
  const columns = mapRoutineColumns(defaultColumns)
  assert.deepEqual(columns.map((c) => c.id), ['c1', 'col-exercise', 'col-sets', 'col-tips', 'col-weight', COACH_NOTES_COLUMN_ID, 'col-notes'])

  const coach = columns.find((c) => c.id === COACH_NOTES_COLUMN_ID)
  assert.deepEqual(coach, {
    id: COACH_NOTES_COLUMN_ID,
    key: COACH_NOTES_KEY,
    label: 'Notas del coach',
    type: 'textarea',
    scope: 'exercise',
    editable: false,
    order: 8.5,
  })
  assert.deepEqual(columns[0], { id: 'c1', key: 'c1', label: 'Ejercicio', type: 'text', scope: 'exercise', editable: false, order: 0 })
})

test('mapRoutineColumns keeps the coach notes when the program has no notes column', () => {
  const columns = mapRoutineColumns(defaultColumns.filter((c) => c.key !== 'notes'))
  assert.equal(columns.at(-1).id, COACH_NOTES_COLUMN_ID)
  assert.equal(columns.at(-1).order, 8)
  assert.equal(columns.some(isAthleteNotesColumn), false)
  assert.equal(mapRoutineColumns([]).map((c) => c.id).join(','), `c1,${COACH_NOTES_COLUMN_ID}`)
})

test('legacy programs keep c10 as the athlete notes column', () => {
  const columns = mapRoutineColumns(legacyColumns)
  assert.equal(isAthleteNotesColumn(columns.find((c) => c.key === 'c10')), true)
  assert.equal(isAthleteNotesColumn(columns.find((c) => c.key === 'c6')), false)
})

test('logFieldForColumnKey maps the athlete columns to the log', () => {
  assert.equal(logFieldForColumnKey('notes'), 'notes')
  assert.equal(logFieldForColumnKey('c10'), 'notes')
  assert.equal(logFieldForColumnKey('c7'), 'weight')
  assert.equal(logFieldForColumnKey('c8'), 'reps')
  assert.equal(logFieldForColumnKey('c9'), 'rir')
  assert.equal(logFieldForColumnKey('tips'), null)
  assert.equal(logFieldForColumnKey(undefined), null)
})

test('athleteNoteCells puts each week note in the notes column', () => {
  const logs = [
    { id: 'log-1', exercise_id: 'ex-1', week_index: 1, notes: 'Rodilla bien' },
    { id: 'log-2', exercise_id: 'ex-1', week_index: 2, notes: '   ' },
    { id: 'log-3', exercise_id: 'ex-2', week_index: 1, notes: null },
  ]
  assert.deepEqual(athleteNoteCells(defaultColumns, logs), [
    { id: 'log-log-1-notes', exercise_id: 'ex-1', column_id: 'col-notes', week_index: 1, value: 'Rodilla bien' },
  ])
  assert.equal(athleteNoteCells(legacyColumns, logs)[0].column_id, 'c10-id')
  assert.deepEqual(athleteNoteCells([], logs), [])
})

test('saving a note does not invent an empty set', () => {
  assert.deepEqual(nextExerciseLog(null, 'notes', 'Me costó la última'), {
    sets: [],
    notes: 'Me costó la última',
    empty: false,
  })

  const existing = { sets: [{ set: 1, weight: 80 }], notes: 'Antes' }
  assert.deepEqual(nextExerciseLog(existing, 'notes', 'Después'), {
    sets: [{ set: 1, weight: 80 }],
    notes: 'Después',
    empty: false,
  })
  // No cambia el registro que había
  assert.equal(existing.notes, 'Antes')
})

test('clearing the only note leaves an empty log to remove', () => {
  assert.equal(nextExerciseLog({ sets: [], notes: 'Algo' }, 'notes', '  ').empty, true)
  assert.equal(nextExerciseLog({ sets: [{ set: 1 }], notes: 'Algo' }, 'notes', '').empty, true)
  const withWeight = nextExerciseLog({ sets: [{ set: 1, weight: 60 }], notes: 'Algo' }, 'notes', '')
  assert.equal(withWeight.empty, false)
  assert.equal(withWeight.notes, null)
})

test('legacy weight, reps and RIR still go to the first set', () => {
  assert.deepEqual(nextExerciseLog(null, 'weight', '82,5'), { sets: [{ set: 1, weight: 82.5 }], notes: null, empty: false })
  assert.deepEqual(nextExerciseLog(null, 'reps', '10').sets, [{ set: 1, reps: 10 }])
  assert.deepEqual(nextExerciseLog(null, 'reps', '8-10').sets, [{ set: 1, reps: '8-10' }])
  assert.deepEqual(nextExerciseLog({ sets: [{ set: 1, weight: 60 }], notes: 'Ok' }, 'rir', '2'), {
    sets: [{ set: 1, weight: 60, rir: 2 }],
    notes: 'Ok',
    empty: false,
  })
  assert.equal(nextExerciseLog({ sets: [{ set: 1, weight: 60 }] }, 'weight', '').empty, true)
})

test('hasLoggedSetValues ignores the set number alone', () => {
  assert.equal(hasLoggedSetValues([{ set: 1 }]), false)
  assert.equal(hasLoggedSetValues([{ set: 1, weight: null, reps: '' }]), false)
  assert.equal(hasLoggedSetValues([{ set: 1, reps: 0 }]), true)
  assert.equal(hasLoggedSetValues('x'), false)
})
