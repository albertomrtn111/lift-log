import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildWeightSeries,
    formatKg,
    formatKgDelta,
    formatWeekRange,
    groupWeightsByWeek,
    startOfWeek,
    summarizeWeightPoints,
} from '../src/lib/progress/weekly-weight.js'

test('startOfWeek devuelve el lunes, también desde el domingo', () => {
    assert.equal(startOfWeek('2026-11-18'), '2026-11-16') // miércoles
    assert.equal(startOfWeek('2026-11-16'), '2026-11-16') // lunes
    assert.equal(startOfWeek('2026-11-22'), '2026-11-16') // domingo
    assert.equal(startOfWeek('2026-11-23'), '2026-11-23')
    assert.equal(startOfWeek('2026-01-01'), '2025-12-29') // cruza de año
})

test('agrupa de lunes a domingo e ignora los días sin registro', () => {
    const points = groupWeightsByWeek([
        { date: '2026-11-02', weight: 80 },
        { date: '2026-11-04', weight: 81 },
        { date: '2026-11-05', weight: null },
        { date: '2026-11-08', weight: 82 }, // domingo: misma semana
        { date: '2026-11-09', weight: 79 }, // lunes: semana nueva
    ])
    assert.equal(points.length, 2)
    assert.equal(points[0].weekStart, '2026-11-02')
    assert.equal(points[0].weekEnd, '2026-11-08')
    assert.equal(points[0].weight, 81)
    assert.equal(points[0].count, 3)
    assert.equal(points[0].delta, null)
    assert.equal(points[1].weight, 79)
    assert.equal(points[1].count, 1)
    assert.equal(points[1].delta, -2)
    assert.equal(points[1].previousIsAdjacent, true)
})

test('no cuenta pesos vacíos, cero o no numéricos como registros', () => {
    const points = groupWeightsByWeek([
        { date: '2026-11-02', weight: 80 },
        { date: '2026-11-03', weight: 0 },
        { date: '2026-11-04', weight: null },
        { date: '2026-11-05', weight: Number.NaN },
        { date: '2026-11-06', weight: '81' },
    ])
    assert.equal(points.length, 1)
    assert.equal(points[0].count, 2)
    assert.equal(points[0].weight, 80.5)
})

test('acepta los registros desordenados', () => {
    const points = groupWeightsByWeek([
        { date: '2026-11-10', weight: 79 },
        { date: '2026-11-03', weight: 80 },
    ])
    assert.deepEqual(points.map(p => p.weekStart), ['2026-11-02', '2026-11-09'])
})

test('30 días con hoy miércoles 18 nov: 5 medias y solo la última incompleta', () => {
    // El rango 30D del atleta va de hoy - 30 días (lunes 19 oct) a hoy
    const entries = []
    for (let d = 0; d <= 30; d += 1) {
        entries.push({ date: new Date(Date.UTC(2026, 9, 19 + d)).toISOString().slice(0, 10), weight: 80 })
    }
    const points = groupWeightsByWeek(entries, { rangeStart: '2026-10-19', rangeEnd: '2026-11-18' })
    assert.equal(points.length, 5)
    assert.deepEqual(points.map(p => p.count), [7, 7, 7, 7, 3])
    assert.deepEqual(points.map(p => p.partial), [false, false, false, false, true])
})

test('rango que empieza en sábado: la primera y la última semana recortadas e incompletas', () => {
    const rangeStart = '2026-10-17'
    const rangeEnd = '2026-11-18'
    const entries = []
    for (let d = 0; d <= 32; d += 1) {
        const date = new Date(Date.UTC(2026, 9, 17 + d)).toISOString().slice(0, 10)
        // Sin registro los martes
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 2) continue
        entries.push({ date, weight: 80 - d * 0.1 })
    }
    const points = groupWeightsByWeek(entries, { rangeStart, rangeEnd })

    assert.deepEqual(points.map(p => p.weekStart), [
        '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16',
    ])
    const first = points[0]
    assert.equal(first.from, '2026-10-17')
    assert.equal(first.to, '2026-10-18')
    assert.equal(first.partial, true)
    assert.equal(first.count, 2)

    const last = points[points.length - 1]
    assert.equal(last.from, '2026-11-16')
    assert.equal(last.to, '2026-11-18')
    assert.equal(last.partial, true)
    assert.equal(last.count, 2) // lunes y miércoles; el martes no tiene registro

    for (const middle of points.slice(1, -1)) {
        assert.equal(middle.partial, false)
        assert.equal(middle.count, 6)
    }

    // Semana del 19 oct: d = 2..8 sin el martes 20 (d = 3)
    const expected = [2, 4, 5, 6, 7, 8].map(d => 80 - d * 0.1)
    const avg = expected.reduce((a, b) => a + b, 0) / expected.length
    assert.equal(points[1].weight, Math.round(avg * 10) / 10)
})

test('las semanas sin registros no salen y la diferencia es con la anterior que sí tiene', () => {
    const points = groupWeightsByWeek([
        { date: '2026-10-05', weight: 80 },
        { date: '2026-10-20', weight: 79.4 },
    ])
    assert.equal(points.length, 2)
    assert.equal(points[1].delta, -0.6)
    assert.equal(points[1].previousWeekStart, '2026-10-05')
    assert.equal(points[1].previousIsAdjacent, false)
})

test('deja fuera los registros que caen fuera del rango', () => {
    const points = groupWeightsByWeek([
        { date: '2026-11-01', weight: 90 },
        { date: '2026-11-03', weight: 80 },
        { date: '2026-11-20', weight: 70 },
    ], { rangeStart: '2026-11-02', rangeEnd: '2026-11-18' })
    assert.equal(points.length, 1)
    assert.equal(points[0].weight, 80)
    assert.equal(points[0].partial, false)
})

test('la diferencia usa las medias redondeadas que se ven en la gráfica', () => {
    const points = groupWeightsByWeek([
        { date: '2026-11-02', weight: 80.04 },
        { date: '2026-11-03', weight: 80.04 },
        { date: '2026-11-09', weight: 80.16 },
    ])
    assert.equal(points[0].weight, 80)
    assert.equal(points[1].weight, 80.2)
    assert.equal(points[1].delta, 0.2)
})

test('summarizeWeightPoints: media de las medias semanales y última menos primera', () => {
    const weekly = buildWeightSeries([
        { date: '2026-11-02', weight: 80 },
        { date: '2026-11-03', weight: 80 },
        { date: '2026-11-04', weight: 80 },
        { date: '2026-11-09', weight: 78 },
    ], 'week')
    // Cada semana pesa lo mismo: (80 + 78) / 2, no (80*3 + 78) / 4
    assert.equal(weekly.avg, 79)
    assert.equal(weekly.change, -2)
    assert.equal(weekly.count, 2)

    const daily = buildWeightSeries([
        { date: '2026-11-03', weight: 80 },
        { date: '2026-11-02', weight: 80 },
        { date: '2026-11-04', weight: 80 },
        { date: '2026-11-09', weight: 78 },
    ], 'day')
    assert.equal(daily.avg, 79.5)
    assert.equal(daily.change, -2)
    assert.equal(daily.count, 4)
    assert.deepEqual(daily.points.map(p => p.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09'])
    assert.equal(daily.points[3].delta, -2)
})

test('summarizeWeightPoints sin datos o con un solo punto', () => {
    assert.deepEqual(summarizeWeightPoints([]), { avg: null, change: null, count: 0 })
    assert.deepEqual(summarizeWeightPoints([{ weight: 80 }]), { avg: 80, change: null, count: 1 })
})

test('formatea fechas y pesos en español', () => {
    assert.equal(formatWeekRange('2026-11-16', '2026-11-22'), '16–22 nov')
    assert.equal(formatWeekRange('2026-10-26', '2026-11-01'), '26 oct – 1 nov')
    assert.equal(formatWeekRange('2025-12-29', '2026-01-04'), '29 dic 2025 – 4 ene 2026')
    assert.equal(formatWeekRange('2026-11-18', '2026-11-18'), '18 nov')
    assert.equal(formatKg(72.35), '72,4')
    assert.equal(formatKg(72), '72,0')
    assert.equal(formatKgDelta(0.3), '+0,3')
    assert.equal(formatKgDelta(-0.44), '-0,4')
    assert.equal(formatKgDelta(0.04), '0,0')
})
