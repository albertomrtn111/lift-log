import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addDays,
  buildTodayWorkoutCopy,
  buildWeekSummaryCopy,
  describeCardio,
  isoWeekday,
  mondayOf,
  strengthSessionsOn,
} from '../src/lib/notifications/athlete-plan-copy.js'
import { buildCoachWeeklyDigest } from '../src/lib/notifications/coach-digest-content.js'

const program = {
  effective_from: '2026-11-04', // miércoles: el programa empieza el lunes 2
  weeks: 4,
  training_days: [
    { id: 'a', name: 'Pierna A', default_weekday: 1 },
    { id: 'b', name: 'Torso', default_weekday: 3 },
    { id: 'c', name: 'Pierna B', default_weekday: null },
  ],
}

test('date helpers', () => {
  assert.equal(isoWeekday('2026-11-02'), 1)
  assert.equal(isoWeekday('2026-11-08'), 7)
  assert.equal(mondayOf('2026-11-08'), '2026-11-02')
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
})

test("program days fall on their weekday within the program's weeks", () => {
  assert.deepEqual(strengthSessionsOn({ program, scheduled: [], dateKey: '2026-11-02' }), ['Pierna A'])
  assert.deepEqual(strengthSessionsOn({ program, scheduled: [], dateKey: '2026-11-03' }), [])
  assert.deepEqual(strengthSessionsOn({ program, scheduled: [], dateKey: '2026-11-25' }), ['Torso'])
  // Pasadas las 4 semanas, nada
  assert.deepEqual(strengthSessionsOn({ program, scheduled: [], dateKey: '2026-11-30' }), [])
})

test('a session moved by the coach replaces the program day that week', () => {
  const scheduled = [{ day_id: 'a', scheduled_date: '2026-11-04' }]
  assert.deepEqual(strengthSessionsOn({ program, scheduled, dateKey: '2026-11-02' }), [])
  assert.deepEqual(strengthSessionsOn({ program, scheduled, dateKey: '2026-11-04' }), ['Pierna A', 'Torso'])
  // Una sesión ya completada no se recuerda
  assert.deepEqual(strengthSessionsOn({ program, scheduled: [{ day_id: 'b', scheduled_date: '2026-11-05', is_completed: true }], dateKey: '2026-11-05' }), [])
})

test('cardio sessions are described with their target', () => {
  assert.equal(describeCardio({ name: 'Rodaje Z2', target_duration_min: 45 }), 'Rodaje Z2 · 45 min')
  assert.equal(describeCardio({ training_type: 'series', target_distance_km: 8.5 }), 'series · 8,5 km')
  assert.equal(describeCardio({}), 'Cardio')
})

test('today workout copy', () => {
  assert.equal(buildTodayWorkoutCopy({ strength: [], cardio: [] }), null)
  assert.deepEqual(buildTodayWorkoutCopy({ strength: ['Pierna A'], cardio: [] }), {
    title: 'Hoy toca: Pierna A',
    body: 'Lo tienes listo en la app. Registra la sesión al terminar.',
    url: '/routine',
  })
  assert.equal(buildTodayWorkoutCopy({ strength: ['Torso'], cardio: [{ name: 'Rodaje', target_duration_min: 30 }] }).title, 'Hoy toca: Torso y Rodaje · 30 min')
  assert.equal(buildTodayWorkoutCopy({ strength: [], cardio: [{ name: 'Rodaje' }] }).url, '/planning')
})

test('week summary copy', () => {
  assert.equal(buildWeekSummaryCopy({ strengthCount: 0, cardioCount: 0 }), null)
  assert.equal(buildWeekSummaryCopy({ strengthCount: 4, cardioCount: 2 }).title, 'Tu semana: 4 sesiones de fuerza y 2 de cardio')
  assert.equal(buildWeekSummaryCopy({ strengthCount: 1, cardioCount: 0 }).title, 'Tu semana: 1 sesión de fuerza')
  assert.equal(buildWeekSummaryCopy({ strengthCount: 0, cardioCount: 3 }).title, 'Tu semana: 3 sesiones de cardio')
})

test('coach weekly digest summarises last week and what is ahead', () => {
  const digest = buildCoachWeeklyDigest({
    reviewsSent: 8,
    reviewsAnswered: 6,
    reviewsApproved: 5,
    athleteMessages: 12,
    coachMessages: 9,
    silentAthletes: [{ clientId: 'a', name: 'Ana' }],
    reviewsThisWeek: 7,
    expiringThisWeek: 2,
  })
  assert.equal(digest.headline, '75 % de revisiones respondidas la semana pasada')
  assert.deepEqual(digest.sections.map((s) => s.key), ['last-week', 'this-week', 'silent'])
  assert.equal(digest.sections[0].items[0].detail, '6 de 8 enviadas (75 %)')
  assert.equal(digest.sections[0].items[2].detail, '12 de tus atletas · 9 tuyos')

  const quiet = buildCoachWeeklyDigest({ reviewsSent: 0, reviewsAnswered: 0, reviewsApproved: 0, athleteMessages: 0, coachMessages: 0, silentAthletes: [], reviewsThisWeek: 0, expiringThisWeek: 0 })
  assert.equal(quiet.headline, '0 revisiones respondidas la semana pasada')
  assert.equal(quiet.sections.length, 2)
})
