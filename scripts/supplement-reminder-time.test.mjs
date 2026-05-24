import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dateTimeInTimezone,
  getReminderTargets,
} from '../src/lib/supplements/reminder-time.js'

test('dateTimeInTimezone formats the date passed by the caller', () => {
  assert.deepEqual(
    dateTimeInTimezone(new Date('2026-05-15T20:00:00.000Z'), 'Europe/Madrid'),
    { date: '2026-05-15', time: '22:00' }
  )

  assert.deepEqual(
    dateTimeInTimezone(new Date('2026-05-15T19:59:00.000Z'), 'Europe/Madrid'),
    { date: '2026-05-15', time: '21:59' }
  )
})

test('getReminderTargets covers the configured lookback window', () => {
  assert.deepEqual(
    getReminderTargets({
      now: new Date('2026-05-15T20:00:00.000Z'),
      timezone: 'Europe/Madrid',
      lookbackMinutes: 3,
    }),
    [
      { date: '2026-05-15', time: '21:58' },
      { date: '2026-05-15', time: '21:59' },
      { date: '2026-05-15', time: '22:00' },
    ]
  )
})

test('getReminderTargets accepts an explicit date and time for diagnostics', () => {
  assert.deepEqual(
    getReminderTargets({
      now: new Date('2026-05-15T20:00:00.000Z'),
      timezone: 'Europe/Madrid',
      requestedDate: '2026-05-14',
      requestedTime: '22:00',
    }),
    [{ date: '2026-05-14', time: '22:00' }]
  )
})
