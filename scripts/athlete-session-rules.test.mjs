import assert from 'node:assert/strict'
import test from 'node:test'

import { appointmentLabel, sessionDateLabel } from '../src/lib/athlete/session-rules.js'

test('dates read in Spanish', () => {
  assert.equal(sessionDateLabel('2026-11-06'), 'viernes, 6 nov')
})

test('appointments use Madrid time, also across the time change', () => {
  assert.equal(appointmentLabel('2026-11-09T17:30:00Z'), 'lunes, 9 nov, 18:30')
  assert.equal(appointmentLabel('2026-07-06T17:30:00Z'), 'lunes, 6 jul, 19:30')
})
