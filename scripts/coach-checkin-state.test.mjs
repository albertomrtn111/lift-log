import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canCloseCheckinReview,
  getCheckinAnswerState,
  getCoachCheckinBadge,
  sortCheckinsForCoach,
} from '../src/lib/reviews/coach-checkin-state.js'

const answered = (overrides = {}) => ({
  id: 'respondida',
  status: 'reviewed',
  submitted_at: '2026-11-10T19:00:00+00:00',
  created_at: '2026-11-09T07:00:00+00:00',
  review: null,
  ...overrides,
})

test('un check-in pendiente sin respuesta está esperando al atleta', () => {
  const checkin = { status: 'pending', submitted_at: null, review: null }
  assert.equal(getCheckinAnswerState(checkin), 'waiting')
  assert.deepEqual(getCoachCheckinBadge(checkin), { tone: 'waiting', label: 'Esperando respuesta' })
  assert.equal(canCloseCheckinReview(checkin), false)
})

test('un check-in sustituido o archivado sin respuesta sale como caducado y no se puede cerrar', () => {
  const checkin = { status: 'archived', submitted_at: null, review: null }
  assert.equal(getCheckinAnswerState(checkin), 'expired')
  assert.deepEqual(getCoachCheckinBadge(checkin), { tone: 'expired', label: 'Caducada' })
  assert.equal(canCloseCheckinReview(checkin), false)
})

test('un check-in sin respuesta que alguien aprobó sigue saliendo como caducado', () => {
  // Ya pasó en producción: dos revisiones vacías figuran como aprobadas.
  const checkin = { status: 'archived', submitted_at: null, review: { status: 'approved', message_to_client: null } }
  assert.equal(getCoachCheckinBadge(checkin).label, 'Caducada')
  assert.equal(canCloseCheckinReview(checkin), false)
})

test('cualquier estado sin submitted_at que no sea pending cuenta como caducado', () => {
  assert.equal(getCheckinAnswerState({ status: 'reviewed', submitted_at: null }), 'expired')
  assert.equal(getCheckinAnswerState({ status: null, submitted_at: null }), 'expired')
})

test('un check-in respondido sin revisión se puede cerrar', () => {
  const checkin = answered()
  assert.equal(getCheckinAnswerState(checkin), 'answered')
  assert.deepEqual(getCoachCheckinBadge(checkin), { tone: 'none', label: 'Sin revisión' })
  assert.equal(canCloseCheckinReview(checkin), true)
})

test('las etiquetas de un check-in respondido siguen el estado de su revisión', () => {
  assert.equal(getCoachCheckinBadge(answered({ review: { status: 'draft', message_to_client: null } })).label, 'Borrador')
  assert.equal(getCoachCheckinBadge(answered({ review: { status: 'approved', message_to_client: '  ' } })).label, 'Aprobada')
  assert.equal(getCoachCheckinBadge(answered({ review: { status: 'approved', message_to_client: 'Buen trabajo' } })).label, 'Aprobada y enviada')
  assert.equal(getCoachCheckinBadge(answered({ review: { status: 'rejected', message_to_client: null } })).label, 'Rechazada')
})

test('se puede cerrar un borrador o enviar feedback a una aprobada sin mensaje, pero no reabrir una enviada', () => {
  assert.equal(canCloseCheckinReview(answered({ review: { status: 'draft', message_to_client: null } })), true)
  assert.equal(canCloseCheckinReview(answered({ status: 'archived', review: { status: 'approved', message_to_client: null } })), true)
  assert.equal(canCloseCheckinReview(answered({ status: 'archived', review: { status: 'approved', message_to_client: 'Hecho' } })), false)
  assert.equal(canCloseCheckinReview(answered({ review: { status: 'rejected', message_to_client: null } })), false)
})

test('el orden pone primero la vigente y después el resto del más reciente al más antiguo', () => {
  const checkins = [
    { id: 'caducada-vieja', status: 'archived', submitted_at: null, created_at: '2026-10-20T07:00:00Z' },
    { id: 'caducada-reciente', status: 'archived', submitted_at: null, created_at: '2026-11-03T07:00:00Z' },
    { id: 'vigente', status: 'pending', submitted_at: null, created_at: '2026-11-17T07:00:00Z' },
    { id: 'respondida-vieja', status: 'archived', submitted_at: '2026-10-28T18:00:00Z', created_at: '2026-10-27T07:00:00Z' },
    { id: 'respondida-reciente', status: 'reviewed', submitted_at: '2026-11-11T18:00:00Z', created_at: '2026-11-10T07:00:00Z' },
  ]
  assert.deepEqual(sortCheckinsForCoach(checkins).map(c => c.id), [
    'vigente',
    'respondida-reciente',
    'caducada-reciente',
    'respondida-vieja',
    'caducada-vieja',
  ])
  // No cambia el array original
  assert.equal(checkins[0].id, 'caducada-vieja')
})

test('el orden aguanta check-ins sin ninguna fecha', () => {
  const checkins = [
    { id: 'sin-fecha', status: 'archived', submitted_at: null, created_at: null },
    { id: 'respondida', status: 'reviewed', submitted_at: '2026-11-11T18:00:00Z' },
  ]
  assert.deepEqual(sortCheckinsForCoach(checkins).map(c => c.id), ['respondida', 'sin-fecha'])
})
