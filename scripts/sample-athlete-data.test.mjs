import assert from 'node:assert/strict'
import test from 'node:test'

import {
    SAMPLE_WEEKS,
    addDays,
    buildSampleAnalysis,
    buildSampleAthleteData,
    buildSampleFeedback,
    mondayOf,
} from '../src/lib/onboarding/sample-athlete-data.js'

test('mondayOf handles sundays and mondays', () => {
    assert.equal(mondayOf('2026-10-16'), '2026-10-12') // viernes
    assert.equal(mondayOf('2026-10-18'), '2026-10-12') // domingo
    assert.equal(mondayOf('2026-10-12'), '2026-10-12')
    assert.equal(addDays('2026-10-30', 3), '2026-11-02')
})

test('builds six closed weeks ending the day before this week starts', () => {
    const data = buildSampleAthleteData('2026-10-16')
    assert.equal(data.startDate, '2026-08-31')
    assert.equal(data.checkins.length, SAMPLE_WEEKS)
    assert.equal(data.checkins.at(-1).period_end, '2026-10-11')
    assert.equal(data.checkins.at(-1).submitted_on, '2026-10-12')
    assert.equal(data.nextCheckinDate, '2026-10-19')
    // Peso, dieta y sesiones hasta hoy (sin datos futuros)
    assert.equal(data.metrics.at(-1).metric_date, '2026-10-15')
    assert.ok(data.metrics.every(m => m.metric_date < '2026-10-16'))
    assert.ok(data.sessions.filter(s => s.scheduled_date >= '2026-10-16').every(s => !s.is_completed))
})

test('only this week is pending review and the weight trend goes down', () => {
    const { checkins } = buildSampleAthleteData('2026-10-16')
    assert.deepEqual(checkins.map(c => c.reviewed), [true, true, true, true, true, false])
    assert.ok(checkins.slice(0, -1).every(c => c.message_to_client))
    assert.ok(checkins.at(-1).weight_avg_kg < checkins[0].weight_avg_kg - 1.5)
    assert.equal(checkins[2].training_adherence_pct, 67) // se saltó una sesión
    assert.ok(checkins.every(c => c.nutrition_adherence_pct >= 60 && c.nutrition_adherence_pct <= 100))
})

test('is deterministic for the same day', () => {
    assert.deepEqual(buildSampleAthleteData('2026-10-16'), buildSampleAthleteData('2026-10-16'))
})

test('analysis and feedback read like a real review', () => {
    const { checkins } = buildSampleAthleteData('2026-10-16')
    const analysis = buildSampleAnalysis(checkins.at(-1), checkins.at(-2))
    assert.match(analysis.overall_summary, /kg/)
    assert.ok(analysis.coach_recommendations.length > 0)
    assert.match(buildSampleFeedback('Álex'), /Lucía[\s\S]*Álex$/)
    assert.doesNotMatch(buildSampleFeedback(null), /\n\nnull/)
})
