import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReport, pendingReports, reportMessage, whatsappNumber, whatsappUrl } from '../src/lib/studio/report-rules.js'

const session = (id, session_date, extra = {}) => ({ id, session_date, status: 'done', sort_order: null, start_time: null, ...extra })
const item = (id, session_id, extra = {}) => ({
    id, session_id, section_id: null, sort_order: 10, catalog_exercise_id: 'x', exercise_name: 'Press', sets: 3, reps: '10',
    time_seconds: null, load_kg: '42.50', rir: null, rpe: null, next_load: 'up', tags: ['barra'], is_done: true, note: 'Interna', ...extra,
})

function report(extra = {}) {
    const current = session('s2', '2026-11-05', { rpe: '7.0', duration_min: 50, wellness_score: '7.50', arrival_note: 'Bien' })
    const items = [item('i2', 's2', { section_id: 'x1' })]
    const allItems = [item('i1', 's1', { load_kg: '40.00' }), ...items]
    return buildReport({
        client: { fullName: 'Ana Ruiz' }, session: current, number: 2, professional: 'Marcos',
        sections: [{ id: 'x1', title: 'Fuerza', parent_title: null, sort_order: 10 }],
        items, sets: [{ item_id: 'i2', client_id: 'c', set_index: 1, load_kg: '45.00', reps: 8, is_detailed: true }],
        sessions: [session('s1', '2026-11-01'), current], allItems, clientId: 'c', ...extra,
    })
}

test('el informe resume la sesión', () => {
    const result = report()
    assert.deepEqual(result.stats, { exercises: 1, sets: 3, blocks: 1 })
    assert.equal(result.load, 350)
    assert.equal(result.arrival.score, 7.5)
    assert.equal(result.groups[0].title, 'Fuerza')
})

test('cada ejercicio trae su evolución y sus series', () => {
    const [exercise] = report().groups[0].exercises
    assert.equal(exercise.evolution, '+2.5 kg')
    assert.equal(exercise.nextLoad, '↑')
    assert.deepEqual(exercise.sets, [{ load: 45, reps: 8 }])
})

test('la nota interna de la celda no sale en el informe', () => {
    assert.equal(JSON.stringify(report()).includes('Interna'), false)
})

test('el teléfono español gana su prefijo', () => {
    assert.equal(whatsappNumber('600 123 456'), '34600123456')
    assert.equal(whatsappNumber('+34 600123456'), '34600123456')
    assert.equal(whatsappNumber('0044 7700 900123'), '447700900123')
    assert.equal(whatsappNumber('123'), null)
    assert.equal(whatsappUrl(null, 'x'), null)
})

test('el mensaje saluda por el nombre', () => {
    assert.equal(reportMessage('Ana Ruiz', 'ClubØ', 'https://x'), 'Hola Ana, aquí tienes el informe de tu sesión en ClubØ: https://x')
})

test('el aviso dura la ventana y se va al enviar o descartar', () => {
    const base = { session_date: '2026-11-05', start_time: '10:00:00', duration_min: 60, delivered: false, dismissed: false }
    assert.equal(pendingReports([base], new Date('2026-11-05T12:00:00Z')).length, 1)
    assert.equal(pendingReports([base], new Date('2026-11-05T15:00:00Z')).length, 0)
    assert.equal(pendingReports([{ ...base, delivered: true }], new Date('2026-11-05T12:00:00Z')).length, 0)
    assert.equal(pendingReports([{ ...base, dismissed: true }], new Date('2026-11-05T12:00:00Z')).length, 0)
})
