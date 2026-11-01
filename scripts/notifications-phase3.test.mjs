import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildHeldSummaryCopy,
  isValidTimezone,
  minutesOfDay,
  quietHoursEnd,
  sanitizeClientDeliverySettings,
  sanitizeCoachQuietHours,
  zonedClock,
} from '../src/lib/notifications/quiet-hours.js'

const madrid = 'Europe/Madrid'
// 1 nov 2026: Madrid en horario de invierno (UTC+1)
const at = (hhmm) => new Date(`2026-11-01T${hhmm}:00+01:00`)

test('parses hours and time zones', () => {
  assert.equal(minutesOfDay('22:00'), 1320)
  assert.equal(minutesOfDay('08:30:00'), 510)
  assert.equal(minutesOfDay('25:00'), null)
  assert.equal(minutesOfDay(null), null)
  assert.equal(isValidTimezone('America/Mexico_City'), true)
  assert.equal(isValidTimezone('Mars/Base'), false)
  assert.deepEqual(zonedClock(at('23:15'), madrid), { dateKey: '2026-11-01', minutes: 23 * 60 + 15 })
})

test('overnight quiet hours hold pushes until the morning', () => {
  const base = { tz: madrid, enabled: true, start: '22:00', end: '08:00' }
  assert.equal(quietHoursEnd({ ...base, now: at('21:59') }), null)
  assert.equal(quietHoursEnd({ ...base, now: at('22:00') })?.toISOString(), '2026-11-02T07:00:00.000Z')
  assert.equal(quietHoursEnd({ ...base, now: at('23:30') })?.toISOString(), '2026-11-02T07:00:00.000Z')
  assert.equal(quietHoursEnd({ now: new Date('2026-11-02T06:10:00Z'), ...base })?.toISOString(), '2026-11-02T07:00:00.000Z')
  assert.equal(quietHoursEnd({ now: new Date('2026-11-02T07:00:00Z'), ...base }), null)
})

test('daytime quiet hours and disabled settings', () => {
  assert.equal(quietHoursEnd({ now: at('14:30'), tz: madrid, enabled: true, start: '14:00', end: '16:00' })?.toISOString(), '2026-11-01T15:00:00.000Z')
  assert.equal(quietHoursEnd({ now: at('23:30'), tz: madrid, enabled: false, start: '22:00', end: '08:00' }), null)
  assert.equal(quietHoursEnd({ now: at('23:30'), tz: madrid, enabled: true, start: '22:00', end: '22:00' }), null)
})

test('quiet hours follow the athlete time zone', () => {
  // 23:30 en Madrid son las 16:30 en Ciudad de México: no es hora de silencio allí.
  assert.equal(quietHoursEnd({ now: at('23:30'), tz: 'America/Mexico_City', enabled: true, start: '22:00', end: '08:00' }), null)
})

test('the release push summarises what was held', () => {
  assert.deepEqual(buildHeldSummaryCopy(['message', 'message', 'plan_updated'], 'client'), {
    title: 'Tienes 3 avisos nuevos',
    body: 'Mientras descansabas: 2 mensajes de tu entrenador y 1 cambio en tu plan.',
  })
  assert.deepEqual(buildHeldSummaryCopy(['checkin_submitted'], 'coach'), {
    title: 'Tienes un aviso nuevo',
    body: 'Mientras descansabas: 1 revisión respondida.',
  })
  assert.equal(buildHeldSummaryCopy(['unknown'], 'client').body, 'Mientras descansabas: 1 aviso.')
})

test('delivery settings fall back to safe defaults', () => {
  assert.deepEqual(sanitizeClientDeliverySettings(null), {
    reviews_email_enabled: true,
    quiet_hours_enabled: true,
    quiet_start: '22:00',
    quiet_end: '08:00',
    timezone: null,
    workout_reminder_enabled: false,
    workout_reminder_time: '08:00',
    week_summary_enabled: true,
  })
  assert.deepEqual(
    sanitizeClientDeliverySettings({ reviews_email_enabled: false, quiet_start: '23:00:00', quiet_end: 'nope', timezone: 'Atlantic/Canary' }),
    {
      reviews_email_enabled: false,
      quiet_hours_enabled: true,
      quiet_start: '23:00',
      quiet_end: '08:00',
      timezone: 'Atlantic/Canary',
      workout_reminder_enabled: false,
      workout_reminder_time: '08:00',
      week_summary_enabled: true,
    },
  )
  assert.deepEqual(sanitizeCoachQuietHours({ quiet_hours_enabled: true }), { quiet_hours_enabled: true, quiet_start: '22:00', quiet_end: '08:00' })
})
