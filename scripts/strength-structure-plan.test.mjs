import assert from 'node:assert/strict'
import test from 'node:test'

import {
    findRemovedDayConflicts,
    formatWeekList,
    isLoggedSet,
    planStrengthStructure,
    summarizeStrengthResults,
} from '../src/lib/training/strength-structure-plan.js'

const currentDays = [
    { id: 'd-torso', name: 'Torso A', order_index: 1, default_weekday: 1 },
    { id: 'd-pierna', name: 'Pierna A', order_index: 2, default_weekday: 3 },
]
const currentExercises = [
    { id: 'e-banca', day_id: 'd-torso', exercise_name: 'Press banca', catalog_exercise_id: 'c-banca', order_index: 1 },
    { id: 'e-remo', day_id: 'd-torso', exercise_name: 'Remo con barra', catalog_exercise_id: 'c-remo', order_index: 2 },
    { id: 'e-militar', day_id: 'd-torso', exercise_name: 'Press militar', catalog_exercise_id: 'c-militar', order_index: 3 },
    { id: 'e-sentadilla', day_id: 'd-pierna', exercise_name: 'Sentadilla', catalog_exercise_id: 'c-sentadilla', order_index: 1 },
    { id: 'e-femoral', day_id: 'd-pierna', exercise_name: 'Curl femoral', catalog_exercise_id: 'c-femoral', order_index: 2 },
]
const ex = (catalogId, name, extra = {}) => ({ catalog_exercise_id: catalogId, exercise_name: name, sets: 3, reps: '10', ...extra })

test('isLoggedSet: completada o con algún valor, aunque sea del bloque base', () => {
    assert.equal(isLoggedSet({ completed: true }), true)
    // Así guarda la app del atleta el bloque base: sin completada ni editada.
    assert.equal(isLoggedSet({ completed: false, is_override: false, weight_kg: 80, reps: 5, rir: 2 }), true)
    assert.equal(isLoggedSet({ completed: false, is_override: true, reps: 8 }), true)
    assert.equal(isLoggedSet({ completed: false, notes: 'molestia en la rodilla' }), true)
    assert.equal(isLoggedSet({ completed: false, is_override: false, weight_kg: null, reps: null, rir: null, notes: '  ' }), false)
})

test('summarizeStrengthResults cuenta series, registros y sesiones', () => {
    const results = summarizeStrengthResults({
        sets: [
            { exercise_id: 'e-banca', week_index: 1, completed: true },
            { exercise_id: 'e-banca', week_index: 2, completed: true },
            { exercise_id: 'e-banca', week_index: 2, completed: false, weight_kg: null, reps: null },
        ],
        logs: [{ exercise_id: 'e-remo', day_id: 'd-torso', week_index: 3, sets: [{}, {}] }],
        sessions: [{ day_id: 'd-torso' }, { day_id: 'd-torso' }],
    })
    assert.deepEqual(results.exerciseResults['e-banca'], { sets: 2, weeks: [1, 2] })
    assert.deepEqual(results.exerciseResults['e-remo'], { sets: 2, weeks: [3] })
    assert.deepEqual(results.dayResults['d-torso'], { completedSessions: 2, logs: 1 })
})

test('formatWeekList agrupa semanas seguidas', () => {
    assert.equal(formatWeekList([3, 1, 2]), '1–3')
    assert.equal(formatWeekList([1, 2, 3, 5]), '1–3 y 5')
    assert.equal(formatWeekList([2, 4, 6]), '2, 4 y 6')
    assert.equal(formatWeekList([]), '')
})

test('el mismo ejercicio conserva su id aunque cambien series y posición', () => {
    const plan = planStrengthStructure({
        currentDays,
        currentExercises,
        structure: {
            days: [
                { name: 'Torso A', exercises: [ex('c-militar', 'Press militar'), ex('c-banca', 'Press banca', { sets: 4 }), ex('c-remo', 'Remo con barra')] },
                { name: 'Pierna A', exercises: [ex('c-sentadilla', 'Sentadilla'), ex('c-femoral', 'Curl femoral')] },
            ],
        },
    })
    assert.deepEqual(plan.days.map(day => day.existingId), ['d-torso', 'd-pierna'])
    assert.deepEqual(plan.days[0].exercises.map(e => e.existingId), ['e-militar', 'e-banca', 'e-remo'])
    assert.deepEqual(plan.days[0].exercises.map(e => e.order_index), [1, 2, 3])
    assert.equal(plan.days[0].exercises[1].source.sets, 4)
    assert.equal(plan.days[0].default_weekday, 1)
    assert.deepEqual(plan.deleteExerciseIds, [])
    assert.deepEqual(plan.deleteDayIds, [])
    assert.deepEqual(plan.conflicts, [])
})

test('cambiar un ejercicio por otro: sin registros se quita, con registros es conflicto y se conserva al final', () => {
    const structure = {
        days: [
            { name: 'Torso nuevo', exercises: [ex('c-banca', 'Press banca'), ex('c-jalon', 'Jalón al pecho'), ex('c-militar', 'Press militar')] },
            { name: 'Pierna A', exercises: [ex('c-sentadilla', 'Sentadilla'), ex('c-hip', 'Hip thrust')] },
        ],
    }
    const results = summarizeStrengthResults({
        sets: [
            { exercise_id: 'e-remo', week_index: 1, completed: true },
            { exercise_id: 'e-remo', week_index: 2, completed: true },
        ],
    })
    const plan = planStrengthStructure({ currentDays, currentExercises, structure, results })

    assert.equal(plan.days[0].exercises[1].existingId, null, 'el jalón es nuevo')
    assert.deepEqual(plan.deleteExerciseIds, ['e-femoral'], 'el curl femoral no tiene registros')
    assert.deepEqual(plan.conflicts, [{
        // Con el nombre actual del día, que es el que ve el coach.
        kind: 'exercise', id: 'e-remo', name: 'Remo con barra', dayName: 'Torso A', sets: 2, weeks: [1, 2],
    }])
    assert.deepEqual(plan.days[0].keptExercises, [{ id: 'e-remo', order_index: 4 }])

    const confirmed = planStrengthStructure({ currentDays, currentExercises, structure, results, deleteConfirmedIds: ['e-remo'] })
    assert.deepEqual(confirmed.conflicts, [])
    assert.deepEqual(confirmed.deleteExerciseIds.sort(), ['e-femoral', 'e-remo'])
    assert.deepEqual(confirmed.days[0].keptExercises, [])
})

test('días: por nombre aunque cambie el orden, y por posición si el nombre cambia', () => {
    const byName = planStrengthStructure({
        currentDays,
        currentExercises,
        structure: { days: [{ name: 'pierna a', exercises: [] }, { name: 'Torso A', exercises: [] }] },
    })
    assert.deepEqual(byName.days.map(day => day.existingId), ['d-pierna', 'd-torso'])
    assert.deepEqual(byName.days.map(day => day.default_weekday), [3, 1])

    const byPosition = planStrengthStructure({
        currentDays,
        currentExercises,
        structure: { days: [{ name: 'Full body 1', exercises: [ex('c-banca', 'Press banca')] }, { name: 'Full body 2', exercises: [] }, { name: 'Full body 3', exercises: [] }] },
    })
    assert.deepEqual(byPosition.days.map(day => day.existingId), ['d-torso', 'd-pierna', null])
    assert.equal(byPosition.days[0].exercises[0].existingId, 'e-banca')
    assert.equal(byPosition.days[2].default_weekday, null)
})

test('un día que sobra con registros o sesiones completadas es conflicto y se conserva entero', () => {
    const results = summarizeStrengthResults({
        sets: [{ exercise_id: 'e-sentadilla', week_index: 1, completed: true }],
        sessions: [{ day_id: 'd-pierna' }],
    })
    const structure = { days: [{ name: 'Torso A', exercises: [ex('c-banca', 'Press banca'), ex('c-remo', 'Remo con barra'), ex('c-militar', 'Press militar')] }] }
    const plan = planStrengthStructure({ currentDays, currentExercises, structure, results })
    assert.deepEqual(plan.deleteDayIds, [])
    assert.deepEqual(plan.keptDays, [{ id: 'd-pierna', order_index: 2 }])
    assert.equal(plan.conflicts.length, 1)
    assert.equal(plan.conflicts[0].kind, 'day')
    assert.equal(plan.conflicts[0].sets, 1)
    assert.equal(plan.conflicts[0].completedSessions, 1)

    const confirmed = planStrengthStructure({ currentDays, currentExercises, structure, results, deleteConfirmedIds: ['d-pierna'] })
    assert.deepEqual(confirmed.deleteDayIds, ['d-pierna'])
    assert.deepEqual(confirmed.conflicts, [])

    const noResults = planStrengthStructure({ currentDays, currentExercises, structure })
    assert.deepEqual(noResults.deleteDayIds, ['d-pierna'])
})

test('un programa vacío solo crea', () => {
    const plan = planStrengthStructure({
        currentDays: [],
        currentExercises: [],
        structure: { days: [{ name: 'Día 1', exercises: [ex('c-banca', 'Press banca')] }] },
    })
    assert.equal(plan.days[0].existingId, null)
    assert.equal(plan.days[0].exercises[0].existingId, null)
    assert.deepEqual([plan.deleteDayIds, plan.deleteExerciseIds, plan.conflicts], [[], [], []])
})

test('ejercicios anteriores a la biblioteca se emparejan por nombre', () => {
    const plan = planStrengthStructure({
        currentDays: [{ id: 'd1', name: 'Día 1', order_index: 1 }],
        currentExercises: [{ id: 'e-old', day_id: 'd1', exercise_name: 'Press Banca ', catalog_exercise_id: null, order_index: 1 }],
        structure: { days: [{ name: 'Día 1', exercises: [ex('c-banca', 'press banca')] }] },
    })
    assert.equal(plan.days[0].exercises[0].existingId, 'e-old')
})

test('un ejercicio repetido en el día se empareja una sola vez', () => {
    const plan = planStrengthStructure({
        currentDays: [{ id: 'd1', name: 'Día 1', order_index: 1 }],
        currentExercises: [
            { id: 'e-1', day_id: 'd1', exercise_name: 'Sentadilla', catalog_exercise_id: 'c-s', order_index: 1 },
            { id: 'e-2', day_id: 'd1', exercise_name: 'Sentadilla', catalog_exercise_id: 'c-s', order_index: 2 },
        ],
        structure: { days: [{ name: 'Día 1', exercises: [ex('c-s', 'Sentadilla')] }] },
    })
    assert.equal(plan.days[0].exercises[0].existingId, 'e-1')
    assert.deepEqual(plan.deleteExerciseIds, ['e-2'])
})

test('findRemovedDayConflicts avisa solo de los días quitados con resultados', () => {
    const results = summarizeStrengthResults({ sets: [{ exercise_id: 'e-femoral', week_index: 2, completed: true }] })
    const conflicts = findRemovedDayConflicts({ currentDays, currentExercises, keepDayIds: ['d-torso'], results })
    assert.deepEqual(conflicts.map(c => [c.kind, c.id, c.sets, c.default_weekday]), [['day', 'd-pierna', 1, 3]])
    assert.deepEqual(findRemovedDayConflicts({ currentDays, currentExercises, keepDayIds: ['d-pierna'], results }), [])
    assert.deepEqual(findRemovedDayConflicts({ currentDays, currentExercises, keepDayIds: ['d-torso'], results, deleteConfirmedIds: ['d-pierna'] }), [])
})
