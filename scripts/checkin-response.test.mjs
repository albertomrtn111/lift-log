import assert from 'node:assert/strict'
import test from 'node:test'

import { getCheckinResponseDate, hasAthleteResponse } from '../src/lib/reviews/checkin-response.js'

const created = '2026-10-31T07:00:00.123456+00:00'

test('una revisión enviada y sin responder no tiene fecha de respuesta', () => {
  // submitted_at relleno por el DEFAULT now() de la columna
  const checkin = { status: 'pending', submitted_at: created, created_at: created }
  assert.equal(getCheckinResponseDate(checkin), null)
  assert.equal(hasAthleteResponse(checkin), false)
})

test('pending sin submitted_at tampoco cuenta como respondida', () => {
  assert.equal(getCheckinResponseDate({ status: 'pending', submitted_at: null, created_at: created }), null)
})

test('una revisión respondida devuelve su fecha de respuesta', () => {
  const checkin = { status: 'reviewed', submitted_at: '2026-10-31T19:42:10+00:00', created_at: created }
  assert.equal(getCheckinResponseDate(checkin), '2026-10-31T19:42:10+00:00')
  assert.equal(hasAthleteResponse(checkin), true)
})

test('una archivada sin responder conserva la marca del DEFAULT y no cuenta', () => {
  // Mismo instante con distinto formato de texto
  const checkin = { status: 'archived', submitted_at: '2026-10-31T07:00:00.123456Z', created_at: created }
  assert.equal(getCheckinResponseDate(checkin), null)
})

test('una archivada que sí se respondió mantiene su fecha', () => {
  const checkin = { status: 'archived', submitted_at: '2026-11-01T08:00:00+00:00', created_at: created }
  assert.equal(getCheckinResponseDate(checkin), '2026-11-01T08:00:00+00:00')
})
