import assert from 'node:assert/strict'
import test from 'node:test'
import {
    clipFromCell,
    clipFromSession,
    clipItemFields,
    firstNumber,
    routineItemFields,
    routinesBySession,
    routinesForClient,
    sessionToTemplateDay,
    templateDayItems,
} from '../src/lib/studio/copy-rules.js'

const item = {
    id: 'i1', catalog_exercise_id: 'e1', exercise_name: 'Press', sets: 3, reps: '10', time_seconds: null,
    load_kg: '42.50', rir: '2.0', rpe: null, circuit: [], tags: ['barra'], note: 'Ojo', is_done: true, next_load: 'up',
}

test('copiar una celda no se lleva la nota ni lo realizado', () => {
    const clip = clipFromCell(item)
    assert.equal(clip.kind, 'cell')
    assert.equal(clip.item.load_kg, 42.5)
    assert.equal('note' in clip.item, false)
    assert.equal('is_done' in clip.item, false)
    assert.equal('next_load' in clip.item, false)
})

test('pegar en otra fila usa el ejercicio de esa fila', () => {
    const fields = clipItemFields(clipFromCell(item).item, 'e9')
    assert.equal(fields.catalog_exercise_id, 'e9')
    assert.equal('exercise_name' in fields, false)
})

test('copiar una sesión lleva cada ejercicio con su subbloque', () => {
    const entries = [
        { type: 'item', item },
        { type: 'section', section: { title: 'Fuerza' } },
        { type: 'item', item: { ...item, id: 'i2', catalog_exercise_id: 'e2' } },
    ]
    const clip = clipFromSession({ id: 's1' }, entries, 'Sesión del 5 nov')
    assert.deepEqual(clip.items.map(entry => entry.section_title), [null, 'Fuerza'])
    assert.equal(clip.fromSessionId, 's1')
})

test('los rangos de la plantilla se quedan con el primer número', () => {
    assert.equal(firstNumber('1-2'), 1)
    assert.equal(firstNumber('7,5'), 7.5)
    assert.equal(firstNumber(''), null)
    assert.equal(firstNumber(null), null)
})

test('un día de plantilla entra en orden y sin lo que no está en el catálogo', () => {
    const items = templateDayItems({
        exercises: [
            { order: 2, catalog_exercise_id: 'e2', sets: 4, reps: '6-8', rir: '1-2', notes: ' Pesado ' },
            { order: 1, catalog_exercise_id: 'e1', sets: 99, reps: '', rir: '', notes: '' },
            { order: 3, exercise_name: 'Sin vincular', sets: 3 },
        ],
    })
    assert.deepEqual(items.map(entry => entry.catalog_exercise_id), ['e1', 'e2'])
    assert.equal(items[0].sets, null)
    assert.equal(items[0].note, null)
    assert.deepEqual([items[1].sets, items[1].reps, items[1].rir, items[1].note], [4, '6-8', 1, 'Pesado'])
})

test('una sesión se guarda como un día de plantilla', () => {
    let next = 0
    const structure = sessionToTemplateDay('Fuerza A', [
        { type: 'section', section: { title: 'Calentamiento' } },
        { type: 'item', item },
    ], () => `id${next++}`)
    const [day] = structure.days
    assert.equal(day.name, 'Fuerza A')
    assert.deepEqual(
        [day.exercises[0].order, day.exercises[0].sets, day.exercises[0].rir, day.exercises[0].notes],
        [1, 3, '2', 'Calentamiento · Ojo']
    )
})

test('cada sesión lista sus rutinas una vez', () => {
    const result = routinesBySession(
        [
            { session_id: 's1', routine_id: 'r1' },
            { session_id: 's1', routine_id: 'r1' },
            { session_id: 's1', routine_id: 'gone' },
            { session_id: 's2', routine_id: null },
        ],
        [{ id: 'r1', name: 'Movilidad 1' }]
    )
    assert.deepEqual(result.get('s1'), ['Movilidad 1'])
    assert.equal(result.has('s2'), false)
})

test('primero las rutinas de la persona y fuera las de otros clientes', () => {
    const routines = [
        { id: 'a', client_id: null },
        { id: 'b', client_id: 'c1' },
        { id: 'c', client_id: 'c2' },
    ]
    assert.deepEqual(routinesForClient(routines, 'c1').map(routine => routine.id), ['b', 'a'])
})

test('un ejercicio de rutina entra con sus valores', () => {
    const fields = routineItemFields({ catalog_exercise_id: 'e1', sets: 2, reps: '10', time_seconds: null, load_kg: '5.00', rir: null, rpe: null, note: 'Lento' })
    assert.deepEqual([fields.load_kg, fields.rir, fields.note], [5, null, 'Lento'])
})
