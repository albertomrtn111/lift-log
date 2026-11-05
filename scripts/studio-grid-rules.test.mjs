import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGrid, cellSummary, normalizeText, prepareSessions } from '../src/lib/studio/grid-rules.js'

const session = (id, session_date, status = 'done') => ({ id, session_date, status, start_time: null, sort_order: null })

test('la búsqueda ignora tildes y mayúsculas', () => {
    assert.equal(normalizeText('  Cuádriceps '), 'cuadriceps')
})

test('ordena las sesiones, las numera y no cuenta las anuladas', () => {
    const { sessions } = prepareSessions(
        [session('c', '2026-11-03'), session('a', '2026-11-01'), session('b', '2026-11-02', 'cancelled')],
        '2026-11-05'
    )
    assert.deepEqual(sessions.map(item => item.id), ['a', 'b', 'c'])
    assert.deepEqual(sessions.map(item => item.number), [1, null, 2])
})

test('avisa de varias sesiones en la misma semana', () => {
    const { sessions } = prepareSessions([session('a', '2026-11-02'), session('b', '2026-11-05'), session('c', '2026-11-10')], '2026-11-20')
    assert.deepEqual(sessions.map(item => item.sameWeek), [2, 2, 1])
})

test('deja las últimas pasadas y todas las próximas', () => {
    const past = Array.from({ length: 15 }, (_, index) => session(`p${index}`, `2026-10-${String(index + 1).padStart(2, '0')}`))
    const { sessions, olderCount } = prepareSessions([...past, session('hoy', '2026-11-05', 'planned'), session('f', '2026-11-20', 'planned')], '2026-11-05')
    assert.equal(olderCount, 3)
    assert.equal(sessions.length, 14)
    assert.equal(sessions[0].id, 'p3')
    assert.equal(sessions.at(-2).isToday, true)
    assert.equal(sessions.at(-1).id, 'f')
})

test('resume la celda', () => {
    assert.deepEqual(cellSummary({ sets: 3, reps: '10', load_kg: '40.00', rir: 2, rpe: null, next_load: 'up' }), {
        volume: '3×10', load: '40 kg', details: 'RIR 2', nextLoad: '↑',
    })
    assert.equal(cellSummary({ sets: 2, time_seconds: 30 }).volume, '2×30 s')
    assert.equal(cellSummary({}).volume, '')
})

const blocks = [
    { key: 'core', displayName: 'Core', category: 'core', isHidden: false },
    { key: 'empuje', displayName: 'Empuje horizontal', category: 'fuerza', isHidden: false },
    { key: 'oculto', displayName: 'Oculto', category: 'fuerza', isHidden: true },
]
const entries = [
    { catalogExerciseId: 'a', name: 'Press de banca', shortName: 'Banca', blockKey: 'empuje', sortOrder: 20, groupTitle: null, isHidden: false },
    { catalogExerciseId: 'b', name: 'Aperturas', shortName: null, blockKey: 'empuje', sortOrder: 10, groupTitle: null, isHidden: false },
    { catalogExerciseId: 'c', name: 'Dead bug', shortName: null, blockKey: 'core', sortOrder: null, groupTitle: null, isHidden: true },
    { catalogExerciseId: 'd', name: 'En bloque oculto', shortName: null, blockKey: 'oculto', sortOrder: null, groupTitle: null, isHidden: false },
]
const names = groups => groups.map(group => [group.block.key, group.rows.map(row => row.name)])

test('agrupa por bloques, en el orden del espacio, sin lo oculto', () => {
    assert.deepEqual(names(buildGrid({ blocks, entries, items: [] })), [['empuje', ['Aperturas', 'Banca']]])
})

test('lo usado sale aunque esté oculto o fuera de la biblioteca', () => {
    const items = [
        { catalog_exercise_id: 'c', exercise_name: 'Dead bug', block_key: 'core' },
        { catalog_exercise_id: 'z', exercise_name: 'Ajeno', block_key: 'empuje' },
    ]
    assert.deepEqual(names(buildGrid({ blocks, entries, items, onlyUsed: true })), [['core', ['Dead bug']], ['empuje', ['Ajeno']]])
})

test('filtra por búsqueda y categoría', () => {
    assert.deepEqual(names(buildGrid({ blocks, entries, items: [], query: 'bánca' })), [['empuje', ['Banca']]])
    assert.deepEqual(names(buildGrid({ blocks, entries, items: [], query: 'empuje' })), [['empuje', ['Aperturas', 'Banca']]])
    assert.deepEqual(buildGrid({ blocks, entries, items: [], category: 'core' }), [])
})

test('un ejercicio usado sin bloque no se pierde', () => {
    const items = [{ catalog_exercise_id: 'x', exercise_name: 'Antiguo', block_key: null }]
    assert.deepEqual(names(buildGrid({ blocks, entries: [], items })), [['sin-bloque', ['Antiguo']]])
})
