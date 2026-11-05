import assert from 'node:assert/strict'
import test from 'node:test'
import {
    cellFields,
    formFromPrevious,
    itemToForm,
    libraryDefaults,
    listLayout,
    moveEntry,
    parseNumber,
    previousItem,
    previousWellness,
    sessionList,
    sessionLoad,
    sessionPatch,
    sessionToForm,
    setRows,
    setsFields,
    timeAgo,
    wellnessScore,
} from '../src/lib/studio/editor-rules.js'

const form = (overrides = {}) => ({ ...itemToForm(null), ...overrides })
const session = (id, session_date, extra = {}) => ({ id, session_date, status: 'planned', sort_order: null, start_time: null, ...extra })

test('los números admiten coma y lo vacío es null', () => {
    assert.equal(parseNumber('42,5'), 42.5)
    assert.equal(parseNumber('  '), null)
    assert.ok(Number.isNaN(parseNumber('mucho')))
})

test('una celda vacía se guarda sin valores', () => {
    const { fields } = cellFields(form())
    assert.equal(fields.sets, null)
    assert.equal(fields.reps, null)
    assert.deepEqual(fields.circuit, [])
})

test('la celda limpia lo escrito', () => {
    const { fields } = cellFields(form({
        sets: '3', reps: ' 8-10 ', loadKg: '42,5', rir: '2', circuit: [' Remo ', ''], note: '  ', tags: ['banda'],
    }))
    assert.deepEqual(
        [fields.sets, fields.reps, fields.load_kg, fields.rir, fields.note, fields.circuit, fields.tags],
        [3, '8-10', 42.5, 2, null, ['Remo'], ['banda']]
    )
})

test('la celda avisa de lo que no vale', () => {
    assert.match(cellFields(form({ sets: '0' })).error, /series/)
    assert.match(cellFields(form({ sets: '2,5' })).error, /series/)
    assert.match(cellFields(form({ rpe: '11' })).error, /RPE/)
    assert.match(cellFields(form({ loadKg: 'x' })).error, /carga/)
})

test('Usar copia la prescripción, no la nota ni el realizado', () => {
    const result = formFromPrevious(
        form({ note: 'Mía', isDone: true }),
        { sets: 4, reps: '6', load_kg: '50.00', note: 'Vieja', is_done: true, tags: ['barra'] }
    )
    assert.deepEqual([result.sets, result.reps, result.loadKg, result.note, result.isDone, result.tags], ['4', '6', '50', 'Mía', true, ['barra']])
})

test('una celda nueva toma lo que diga la biblioteca', () => {
    const blocks = [{ key: 'b', defaultSets: 4, defaultReps: '8' }]
    const entries = [
        { catalogExerciseId: 'x', blockKey: 'b', defaultSets: 3, defaultReps: null },
        { catalogExerciseId: 'y', blockKey: 'b', defaultSets: null, defaultReps: null },
    ]
    assert.deepEqual(libraryDefaults(entries, blocks, 'x'), { sets: 3, reps: '8' })
    assert.deepEqual(libraryDefaults(entries, blocks, 'y'), { sets: 4, reps: '8' })
    assert.deepEqual(libraryDefaults(entries, blocks, 'z'), { sets: null, reps: null })
})

test('Por series nace con tantas filas como series y respeta lo guardado', () => {
    assert.equal(setRows([], 3).length, 3)
    assert.equal(setRows([], 0).length, 1)
    assert.equal(setRows([{ load_kg: '40.00', reps: 10, time_seconds: null, rir: null, rpe: null }], 3)[0].loadKg, '40')
})

test('Por series deja vacío lo que hereda', () => {
    const { sets } = setsFields([{ loadKg: '40', reps: '', timeSeconds: '', rir: '', rpe: '8' }])
    assert.deepEqual(sets, [{ load_kg: 40, reps: null, time_seconds: null, rir: null, rpe: 8 }])
    assert.match(setsFields([{ loadKg: '', reps: '1,5', timeSeconds: '', rir: '', rpe: '' }]).error, /Serie 1/)
    assert.ok(setsFields([]).error)
})

test('lo anterior busca hacia atrás y salta las anuladas', () => {
    const sessions = [
        session('a', '2026-11-01'),
        session('b', '2026-11-02', { status: 'cancelled' }),
        session('c', '2026-11-03'),
        session('d', '2026-11-04'),
    ]
    const items = [
        { id: '1', session_id: 'a', catalog_exercise_id: 'x' },
        { id: '2', session_id: 'b', catalog_exercise_id: 'x' },
        { id: '3', session_id: 'd', catalog_exercise_id: 'x' },
    ]
    assert.equal(previousItem(sessions, items, 'c', 'x').item.id, '1')
    assert.equal(previousItem(sessions, items, 'a', 'x'), null)
    assert.equal(previousItem(sessions, items, 'c', 'y'), null)
})

test('la nota de cómo llega necesita las cuatro respuestas', () => {
    const answers = { wellness_sleep: 8, wellness_fatigue: 2, wellness_stress: 4, wellness_soreness: 2 }
    assert.equal(wellnessScore(answers), 7.5)
    assert.equal(wellnessScore({ ...answers, wellness_stress: null }), null)
    assert.equal(wellnessScore({ ...answers, wellness_sleep: 0, wellness_fatigue: 10, wellness_stress: 10, wellness_soreness: 10 }), 0)
})

test('compara con la última sesión que tiene nota', () => {
    const sessions = [
        session('a', '2026-11-01', { wellness_score: '6.50' }),
        session('b', '2026-11-02', { wellness_score: null }),
        session('c', '2026-11-03'),
    ]
    assert.equal(previousWellness(sessions, 'c'), 6.5)
    assert.equal(previousWellness(sessions, 'a'), null)
})

test('la carga es RPE por minutos, con 60 por defecto', () => {
    assert.equal(sessionLoad(7, 45), 315)
    assert.equal(sessionLoad(7, null), 420)
    assert.equal(sessionLoad(null, 45), null)
})

test('el estado de la sesión solo cambia al anular o reabrir', () => {
    const planned = session('a', '2026-11-01')
    assert.equal(sessionPatch(sessionToForm(planned), planned).patch.status, undefined)
    assert.equal(sessionPatch({ ...sessionToForm(planned), status: 'no_show' }, planned).patch.status, 'no_show')
    const cancelled = session('b', '2026-11-01', { status: 'cancelled' })
    assert.equal(sessionPatch({ ...sessionToForm(cancelled), status: 'normal' }, cancelled).patch.status, 'planned')
    const done = session('c', '2026-11-01', { status: 'done' })
    assert.equal(sessionPatch(sessionToForm(done), done).patch.status, undefined)
})

test('el RPE sin minutos guarda 60', () => {
    const planned = session('a', '2026-11-01')
    assert.equal(sessionPatch({ ...sessionToForm(planned), rpe: '7' }, planned).patch.duration_min, 60)
    assert.equal(sessionPatch(sessionToForm(planned), planned).patch.duration_min, null)
    assert.match(sessionPatch({ ...sessionToForm(planned), duration: '0' }, planned).error, /duración/)
})

const items = [
    { id: 'i1', section_id: null, sort_order: 10 },
    { id: 'i2', section_id: 's1', sort_order: 20 },
    { id: 'i3', section_id: 's2', sort_order: 30 },
    { id: 'i4', section_id: 'gone', sort_order: 5 },
]
const sections = [{ id: 's2', sort_order: 20 }, { id: 's1', sort_order: 10 }]
const ids = entries => entries.map(entry => (entry.type === 'item' ? entry.item.id : entry.section.id))

test('la ficha pone primero lo suelto y luego cada subbloque', () => {
    assert.deepEqual(ids(sessionList(items, sections)), ['i4', 'i1', 's1', 'i2', 's2', 'i3'])
})

test('un ejercicio que cruza un título cambia de subbloque', () => {
    const list = sessionList(items, sections)
    const moved = moveEntry(list, 1, 1)
    assert.deepEqual(ids(moved), ['i4', 's1', 'i1', 'i2', 's2', 'i3'])
    const { items: layout } = listLayout(moved)
    assert.equal(layout.find(item => item.id === 'i1').section_id, 's1')
    assert.equal(layout.find(item => item.id === 'i4').section_id, null)
})

test('un subbloque se mueve entero y no sube por encima de lo suelto', () => {
    const list = sessionList(items, sections)
    assert.deepEqual(ids(moveEntry(list, 2, 1)), ['i4', 'i1', 's2', 'i3', 's1', 'i2'])
    assert.equal(moveEntry(list, 2, -1), list)
    assert.equal(moveEntry(list, 4, 1), list)
    assert.deepEqual(listLayout(moveEntry(list, 2, 1)).sectionIds, ['s2', 's1'])
})

test('los extremos de la lista no se mueven', () => {
    const list = sessionList(items, sections)
    assert.equal(moveEntry(list, 0, -1), list)
    assert.equal(moveEntry(list, list.length - 1, 1), list)
})

test('dice cuándo fue el último cambio', () => {
    const now = new Date('2026-11-05T12:00:00.000Z')
    assert.equal(timeAgo('2026-11-05T11:59:40.000Z', now), 'ahora mismo')
    assert.equal(timeAgo('2026-11-05T11:50:00.000Z', now), 'hace 10 min')
    assert.equal(timeAgo('2026-11-05T09:00:00.000Z', now), 'hace 3 h')
    assert.equal(timeAgo('2026-11-04T09:00:00.000Z', now), 'ayer')
})
