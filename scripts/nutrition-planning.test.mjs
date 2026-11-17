import test from 'node:test'
import assert from 'node:assert/strict'

const {
    addDays, weekdayIndex, weekStart, shiftTarget, shiftDay, progressionDelta, buildBlockDays, repeatWeek, dayErrors,
} = await import('../src/lib/nutrition/planning.js')

const base = { kcal: 2600, protein_g: 150, carbs_g: 330, fat_g: 75 }

test('fechas: lunes es el día 0 y las semanas empiezan en lunes', () => {
    assert.equal(weekdayIndex('2026-11-16'), 0) // lunes
    assert.equal(weekdayIndex('2026-11-22'), 6) // domingo
    assert.equal(weekStart('2026-11-19'), '2026-11-16')
    assert.equal(addDays('2026-11-30', 1), '2026-12-01')
})

test('las kcal que se suben van a los hidratos y la proteína no se toca', () => {
    assert.deepEqual(shiftTarget(base, 100), { kcal: 2700, protein_g: 150, carbs_g: 355, fat_g: 75 })
    assert.deepEqual(shiftTarget(base, 90, 'fat'), { kcal: 2690, protein_g: 150, carbs_g: 330, fat_g: 85 })
    const both = shiftTarget(base, 200, 'carbs_fat')
    assert.equal(both.carbs_g, 355)
    assert.equal(both.fat_g, 86)
})

test('con entreno y descanso la subida va a los dos juegos', () => {
    const day = shiftDay({ ...base, day_type_config: { training: base, rest: { ...base, kcal: 2200, carbs_g: 230 } } }, 100)
    assert.equal(day.day_type_config.training.kcal, 2700)
    assert.equal(day.day_type_config.rest.carbs_g, 255)
    assert.equal(day.kcal, 2700)
})

test('sube cada semana empezando 100 por encima: 2.700, 2.800, 2.900', () => {
    const days = buildBlockDays({
        start: '2026-11-16', end: '2026-12-06', base,
        progression: { type: 'weekly', start_kcal: 100, step_kcal: 100 },
    })
    assert.equal(days.length, 21)
    assert.equal(days[0].kcal, 2700)
    assert.equal(days[6].kcal, 2700)
    assert.equal(days[7].kcal, 2800)
    assert.equal(days[20].kcal, 2900)
    assert.equal(days[7].label, '+200 kcal')
})

test('una semana que no empieza en lunes cambia de escalón el lunes', () => {
    // Bloque de jueves a miércoles: jueves-domingo semana 1, lunes-miércoles semana 2.
    assert.equal(progressionDelta({ type: 'weekly', step_kcal: 100 }, 3, '2026-11-19'), 0)
    assert.equal(progressionDelta({ type: 'weekly', step_kcal: 100 }, 4, '2026-11-19'), 100)
})

test('sube dentro de la semana y el lunes vuelve al punto de partida', () => {
    const days = buildBlockDays({
        start: '2026-11-16', end: '2026-11-29', base,
        progression: { type: 'within_week', step_kcal: 50 },
    })
    assert.deepEqual(days.slice(0, 7).map(d => d.kcal), [2600, 2650, 2700, 2750, 2800, 2850, 2900])
    assert.equal(days[7].kcal, 2600)
    assert.equal(days[0].label, null)
})

test('solo algunos días de la semana: la carga de jueves a sábado', () => {
    const days = buildBlockDays({
        start: '2026-11-16', end: '2026-11-22', base: { ...base, kcal: 3400, carbs_g: 530 },
        weekdays: [3, 4, 5], label: 'Carga HC',
    })
    assert.deepEqual(days.map(d => d.date), ['2026-11-19', '2026-11-20', '2026-11-21'])
    assert.equal(days[0].label, 'Carga HC')
})

test('repetir semana con +100 copia la semana a la siguiente', () => {
    const week = buildBlockDays({ start: '2026-11-16', end: '2026-11-22', base })
    const next = repeatWeek(week, 100)
    assert.equal(next[0].date, '2026-11-23')
    assert.equal(next[6].date, '2026-11-29')
    assert.ok(next.every(d => d.kcal === 2700 && d.carbs_g === 355))
})

test('los bloques no pasan de 62 días y los valores raros se señalan', () => {
    assert.throws(() => buildBlockDays({ start: '2026-11-01', end: '2027-01-15', base }))
    assert.deepEqual(dayErrors(base), [])
    assert.equal(dayErrors({ ...base, kcal: -1 }).length, 1)
})
