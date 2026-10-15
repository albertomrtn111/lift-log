import test from 'node:test'
import assert from 'node:assert/strict'

const { dayLabel, groupByDay, inboxRange, inboxTotals } = await import('../src/lib/strava/pending-inbox.ts')

const activity = (id, local_date, distance_meters = 10000, moving_time_seconds = 3000) => ({ id, local_date, distance_meters, moving_time_seconds })

test('etiqueta los días de forma relativa y legible', () => {
    assert.equal(dayLabel('2026-10-15', '2026-10-15'), 'Hoy')
    assert.equal(dayLabel('2026-10-14', '2026-10-15'), 'Ayer')
    assert.equal(dayLabel('2026-10-12', '2026-10-15'), 'Lunes 12 oct')
})

test('agrupa por día y conserva el orden', () => {
    const groups = groupByDay([
        activity('a', '2026-10-06'),
        activity('b', '2026-10-06'),
        activity('c', '2026-10-14'),
    ], '2026-10-15')
    assert.deepEqual(groups.map(g => [g.label, g.items.map(i => i.id)]), [['Martes 6 oct', ['a', 'b']], ['Ayer', ['c']]])
})

test('resume distancia, tiempo y rango de fechas', () => {
    const items = [activity('a', '2026-09-28', 8000, 2400), activity('b', '2026-10-03', 4500, 1500)]
    assert.deepEqual(inboxTotals(items), { km: '12,5', time: '1 h 05 min', hasDistance: true })
    assert.equal(inboxRange(items), 'del 28 sep al 3 oct')
    assert.equal(inboxRange([activity('a', '2026-10-03'), activity('b', '2026-10-12')]), 'del 3 al 12 oct')
    assert.equal(inboxRange([activity('a', '2026-10-03')]), 'el 3 oct')
})
