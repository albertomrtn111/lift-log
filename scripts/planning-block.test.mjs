import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { addDateDays, blockRequestSchema, buildBlockWeeks, validateBlockWeek } from '../src/lib/ai/planning-block.ts'

const request = { title: 'Maratón en 12 semanas', eventDate: '2026-12-06', weeks: 12, sport: 'running', unit: 'km', currentVolume: 40, peakVolume: 75, deloadEvery: 4, taperWeeks: 3, trainingDays: [2, 3, 4, 6, 7], eventDistanceKm: 42.195, instructions: 'Tirada larga el domingo' }

test('12-week marathon: exact date, unloads 4/8, peak before three taper weeks', () => {
    const weeks = buildBlockWeeks(request)
    assert.equal(weeks.length, 12)
    assert.equal(weeks[0].start, '2026-09-14')
    assert.equal(weeks.at(-1).end, request.eventDate)
    assert.deepEqual(weeks.filter(week => week.phase === 'deload').map(week => week.index), [4, 8])
    assert.equal(weeks[8].targetVolume, 75)
    assert.deepEqual(weeks.slice(-3).map(week => week.phase), ['taper', 'taper', 'race'])
    assert.ok(weeks[9].targetVolume > weeks[10].targetVolume && weeks[10].targetVolume > weeks[11].targetVolume)
    for (let i = 1; i < weeks.length; i++) assert.equal(weeks[i].start, addDateDays(weeks[i - 1].end, 1))
})

test('date arithmetic survives DST, leap days, and a mid-week event', () => {
    assert.equal(addDateDays('2028-02-28', 1), '2028-02-29')
    assert.equal(addDateDays('2026-10-24', 2), '2026-10-26')
    const weeks = buildBlockWeeks({ ...request, eventDate: '2027-01-06' })
    assert.equal(weeks.at(-1).end, '2027-01-06')
    assert.equal(weeks[0].start, addDateDays('2027-01-06', -83))
})

test('invalid dates, impossible taper, ambiguous hybrid distance, duplicate days rejected', () => {
    for (const override of [{ eventDate: '2026-02-31' }, { taperWeeks: 6, weeks: 4 }, { sport: 'hybrid', unit: 'km' }, { trainingDays: [1, 1] }, { deloadEvery: 1 }, { currentVolume: 0 }, { peakVolume: Infinity }]) {
        assert.equal(blockRequestSchema.safeParse({ ...request, ...override }).success, false)
    }
})

const session = { id: randomUUID(), date: '2026-09-15', title: 'Rodaje suave', trainingType: 'rodaje', purpose: 'training', distanceKm: 8, durationMin: 45, details: 'Sesión: 8 km a ritmo conversacional', notes: '' }
test('session dates, availability, discipline, volume and duplicate IDs are enforced', () => {
    const week = buildBlockWeeks(request)[0]
    assert.doesNotThrow(() => validateBlockWeek(request, week, [session]))
    for (const override of [{ date: '2026-12-01' }, { date: '2026-09-14' }, { trainingType: 'swim' }, { distanceKm: null }, { purpose: 'event' }]) {
        assert.throws(() => validateBlockWeek(request, week, [{ ...session, ...override }]))
    }
    assert.throws(() => validateBlockWeek(request, week, [session, session]), /duplicada/)
})

test('race is allowed on target date even outside usual availability, exactly once', () => {
    const block = { ...request, trainingDays: [2, 4] }
    const finalWeek = buildBlockWeeks(block).at(-1)
    const event = { ...session, date: block.eventDate, purpose: 'event', distanceKm: 42.195 }
    assert.doesNotThrow(() => validateBlockWeek(block, finalWeek, [event]))
    assert.throws(() => validateBlockWeek(block, finalWeek, [{ ...event, distanceKm: 21.1 }]), /distancia/)
    assert.throws(() => validateBlockWeek(block, finalWeek, [event, { ...event, id: randomUUID() }]), /más de una/)
})

test('all supported block lengths produce finite positive targets and no duplicate dates', () => {
    for (let count = 2; count <= 26; count++) {
        const weeks = buildBlockWeeks({ ...request, weeks: count, taperWeeks: Math.min(3, count - 1) })
        assert.equal(new Set(weeks.map(week => week.start)).size, count)
        assert.ok(weeks.every(week => Number.isFinite(week.targetVolume) && week.targetVolume > 0))
    }
})
