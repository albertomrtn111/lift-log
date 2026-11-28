import assert from 'node:assert/strict'
import test from 'node:test'

import {
    cardioHasRecords,
    cardioRemovalCopy,
    checkinHasRecords,
    checkinRemovalCopy,
    decideMetricRemoval,
    decideProgramRemoval,
    describeCardioRecords,
    describeCheckinRecords,
    describeMetricUsage,
    describeProgramRecords,
    joinList,
    metricRemovalCopy,
    normalizeCheckinRecords,
    normalizeMetricUsage,
    normalizeProgramRecords,
    programRemovalCopy,
} from '../src/lib/safe-delete.js'

test('joinList une en español', () => {
    assert.equal(joinList([]), '')
    assert.equal(joinList(['a']), 'a')
    assert.equal(joinList(['a', 'b']), 'a y b')
    assert.equal(joinList(['a', 'b', 'c']), 'a, b y c')
})

test('programa: con series se oculta y dice cuántas en cuántas semanas', () => {
    const records = normalizeProgramRecords({ sets: 340, weeks: 8, completed_sessions: 12, logs: 0 })
    assert.equal(decideProgramRemoval(records), 'hide')
    assert.equal(describeProgramRecords(records), '340 series en 8 semanas y 12 sesiones completadas')
    const copy = programRemovalCopy('Bloque fuerza', records)
    assert.equal(copy.mode, 'hide')
    assert.equal(copy.confirm, 'Ocultar')
    assert.match(copy.description, /«Bloque fuerza» tiene 340 series en 8 semanas y 12 sesiones completadas del atleta/)
    assert.match(copy.description, /podrás recuperarlo/)
})

test('programa: singular y solo sesiones completadas', () => {
    assert.equal(describeProgramRecords({ sets: 1, weeks: 1, completedSessions: 0, logs: 0 }), '1 serie en 1 semana')
    const onlySessions = normalizeProgramRecords({ completed_sessions: 1 })
    assert.equal(decideProgramRemoval(onlySessions), 'hide')
    assert.equal(describeProgramRecords(onlySessions), '1 sesión completada')
})

test('programa: registros antiguos sin series también lo protegen', () => {
    const records = normalizeProgramRecords({ logs: 3 })
    assert.equal(decideProgramRemoval(records), 'hide')
    assert.match(programRemovalCopy('X', records).description, /registros del atleta/)
})

test('programa vacío o sin datos: se borra', () => {
    assert.equal(decideProgramRemoval(normalizeProgramRecords({ sets: 0, weeks: 0, completed_sessions: 0, logs: 0 })), 'delete')
    assert.equal(decideProgramRemoval(normalizeProgramRecords(null)), 'delete')
    const copy = programRemovalCopy('Vacío', normalizeProgramRecords({}))
    assert.equal(copy.mode, 'delete')
    assert.match(copy.description, /no tiene nada registrado/)
})

test('revisión con respuestas, medidas, fotos, peso y revisión del coach', () => {
    const records = normalizeCheckinRecords({ submitted: true, answers: 22, measures: 9, photos: 4, weight: true, review: true })
    assert.equal(checkinHasRecords(records), true)
    assert.equal(describeCheckinRecords(records), '22 respuestas, 9 medidas, 4 fotos y el peso del atleta, y tu revisión')
    const copy = checkinRemovalCopy(records)
    assert.equal(copy.mode, 'trash')
    assert.match(copy.description, /^Tiene 22 respuestas/)
    assert.match(copy.description, /Revisiones eliminadas/)
})

test('revisión: solo fotos, solo revisión del coach, enviada sin campos', () => {
    assert.equal(describeCheckinRecords(normalizeCheckinRecords({ photos: 1 })), '1 foto del atleta')
    assert.equal(describeCheckinRecords(normalizeCheckinRecords({ review: true })), 'tu revisión')
    assert.equal(describeCheckinRecords(normalizeCheckinRecords({ submitted: true })), 'la respuesta del atleta')
})

test('revisión vacía (pendiente sin responder): se borra', () => {
    const records = normalizeCheckinRecords({ submitted: false, answers: 0, measures: 0, photos: 0, weight: false, review: false })
    assert.equal(checkinHasRecords(records), false)
    assert.equal(checkinRemovalCopy(records).mode, 'delete')
    assert.equal(checkinHasRecords(normalizeCheckinRecords(null)), false)
})

test('cardio planificado: se borra', () => {
    const session = { is_completed: false, actual_distance_km: null, rpe: null, feedback_notes: '  ', strava_activity_id: null }
    assert.equal(cardioHasRecords(session), false)
    assert.equal(cardioRemovalCopy(session).mode, 'delete')
})

test('cardio hecho: papelera con números', () => {
    const session = { is_completed: true, performed_date: '2026-11-20T08:00:00Z', actual_distance_km: '8.25', actual_duration_min: 45, rpe: 7, feedback_notes: 'Bien' }
    assert.equal(cardioHasRecords(session), true)
    assert.equal(describeCardioRecords(session), '8,3 km en 45 min, RPE 7 y el comentario del atleta')
    const copy = cardioRemovalCopy(session)
    assert.equal(copy.mode, 'trash')
    assert.equal(copy.description, 'El atleta ya la ha hecho: 8,3 km en 45 min, RPE 7 y el comentario del atleta. Se quitará del calendario, pero se guarda una copia y podrás deshacerlo.')
})

test('cardio con datos pero sin marcar como hecho, o solo enlazado a Strava', () => {
    assert.equal(cardioHasRecords({ is_completed: false, rpe: 5 }), true)
    assert.match(cardioRemovalCopy({ is_completed: false, rpe: 5 }).description, /^El atleta ya ha registrado RPE 5/)
    assert.equal(cardioHasRecords({ strava_activity_id: 'x' }), true)
    assert.equal(describeCardioRecords({ is_completed: true }), 'la sesión marcada como hecha')
})

test('métrica con valores: se archiva con números', () => {
    const usage = normalizeMetricUsage({ values: 42, athletes: 6 })
    assert.equal(decideMetricRemoval(usage), 'archive')
    assert.equal(describeMetricUsage(usage), '42 valores de 6 atletas')
    const copy = metricRemovalCopy('Cintura', usage)
    assert.equal(copy.mode, 'archive')
    assert.match(copy.description, /«Cintura» tiene 42 valores de 6 atletas/)
    assert.equal(describeMetricUsage({ values: 1, athletes: 1 }), '1 valor de 1 atleta')
})

test('métrica sin valores: se borra', () => {
    const usage = normalizeMetricUsage({ values: 0, athletes: 0 })
    assert.equal(decideMetricRemoval(usage), 'delete')
    assert.equal(metricRemovalCopy('Nueva', usage).mode, 'delete')
    assert.equal(decideMetricRemoval(normalizeMetricUsage(undefined)), 'delete')
})
