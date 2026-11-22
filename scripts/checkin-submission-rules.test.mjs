import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLOSED_REVIEW_STATUSES,
  canAthleteChangeCheckin,
  canSaveCheckinDraft,
  checkinBlockedCopy,
  getCheckinSubmissionState,
} from '../src/lib/reviews/checkin-submission-rules.js'

test('un check-in pendiente está abierto: se envía y guarda borrador', () => {
  const state = getCheckinSubmissionState({ checkinStatus: 'pending', reviewStatus: null })
  assert.equal(state, 'open')
  assert.equal(canAthleteChangeCheckin(state), true)
  assert.equal(canSaveCheckinDraft(state), true)
  assert.equal(checkinBlockedCopy(state), null)
})

test('enviado y con la revisión en borrador: se puede corregir, sin borrador', () => {
  const state = getCheckinSubmissionState({ checkinStatus: 'reviewed', reviewStatus: 'draft', answered: true })
  assert.equal(state, 'correcting')
  assert.equal(canAthleteChangeCheckin(state), true)
  assert.equal(canSaveCheckinDraft(state), false)
  assert.equal(checkinBlockedCopy(state), null)
})

test('enviado y aún sin revisión creada: también se puede corregir', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'reviewed', reviewStatus: null, answered: true }), 'correcting')
})

test('revisión aprobada: cerrada aunque el check-in siga en reviewed', () => {
  // Hay un caso así en producción: aprobada pero sin archivar el check-in
  const state = getCheckinSubmissionState({ checkinStatus: 'reviewed', reviewStatus: 'approved', answered: true })
  assert.equal(state, 'closed')
  assert.equal(canAthleteChangeCheckin(state), false)
  assert.equal(canSaveCheckinDraft(state), false)
})

test('revisión aprobada y check-in archivado: cerrada', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'archived', reviewStatus: 'approved', answered: true }), 'closed')
})

test('aprobada incluso sin respuesta del atleta: cerrada, no caducada', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'archived', reviewStatus: 'approved', answered: false }), 'closed')
})

test('revisión rechazada: cerrada', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'reviewed', reviewStatus: 'rejected', answered: true }), 'closed')
  assert.deepEqual([...CLOSED_REVIEW_STATUSES], ['approved', 'rejected'])
})

test('archivado con respuesta y sin revisión (el coach se la saltó): cerrada', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'archived', reviewStatus: null, answered: true }), 'closed')
})

test('archivado sin respuesta (sustituido por otro): caducado y bloqueado', () => {
  const state = getCheckinSubmissionState({ checkinStatus: 'archived', reviewStatus: null, answered: false })
  assert.equal(state, 'expired')
  assert.equal(canAthleteChangeCheckin(state), false)
})

test('un estado desconocido no deja cambiar nada', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'otro' }), 'closed')
  assert.equal(getCheckinSubmissionState({ checkinStatus: null }), 'closed')
  assert.equal(getCheckinSubmissionState({ checkinStatus: undefined }), 'closed')
})

test('una revisión en borrador no reabre un check-in archivado', () => {
  assert.equal(getCheckinSubmissionState({ checkinStatus: 'archived', reviewStatus: 'draft', answered: true }), 'closed')
})

test('textos para el atleta cuando no puede enviar', () => {
  const closed = checkinBlockedCopy('closed')
  assert.equal(closed?.title, 'Revisión cerrada')
  assert.match(closed?.message ?? '', /^Esta revisión ya la ha cerrado tu coach/)
  const expired = checkinBlockedCopy('expired')
  assert.equal(expired?.title, 'Revisión no disponible')
  assert.match(expired?.message ?? '', /ya no está abierta/)
})
