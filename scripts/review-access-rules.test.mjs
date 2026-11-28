import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EDITABLE_REVIEW_FIELDS,
  pickEditableReviewFields,
  reviewInScope,
  reviewMatchesCheckin,
} from '../src/lib/reviews/review-access-rules.js'

const COACH = 'coach-a'
const CLIENT = 'client-a'
const CHECKIN = 'checkin-a'

test('solo se pueden editar resumen, mensaje, análisis y propuesta', () => {
  assert.deepEqual([...EDITABLE_REVIEW_FIELDS], ['summary', 'message_to_client', 'analysis', 'proposal'])
  assert.ok(Object.isFrozen(EDITABLE_REVIEW_FIELDS))
})

test('pickEditableReviewFields conserva los campos editables', () => {
  const updates = pickEditableReviewFields({
    summary: 'Buena semana',
    message_to_client: 'Sigue así',
    analysis: { overall_summary: 'Bien' },
    proposal: { kcal: 2200 },
  })
  assert.deepEqual(updates, {
    summary: 'Buena semana',
    message_to_client: 'Sigue así',
    analysis: { overall_summary: 'Bien' },
    proposal: { kcal: 2200 },
  })
})

test('pickEditableReviewFields ignora el resto de campos de la revisión', () => {
  const updates = pickEditableReviewFields({
    summary: 'Texto',
    id: 'otra',
    coach_id: 'coach-b',
    client_id: 'client-b',
    checkin_id: 'checkin-b',
    status: 'approved',
    approved_by: 'user-b',
    ai_status: 'completed',
    ai_summary: 'x',
    created_by: 'user-b',
  })
  assert.deepEqual(updates, { summary: 'Texto' })
})

test('pickEditableReviewFields permite vaciar con null', () => {
  assert.deepEqual(
    pickEditableReviewFields({ summary: null, message_to_client: null, analysis: null, proposal: null }),
    { summary: null, message_to_client: null, analysis: null, proposal: null },
  )
})

test('pickEditableReviewFields descarta tipos incorrectos', () => {
  assert.deepEqual(
    pickEditableReviewFields({
      summary: 42,
      message_to_client: { texto: 'no' },
      analysis: ['no', 'es', 'objeto'],
      proposal: 'texto',
    }),
    {},
  )
  assert.deepEqual(pickEditableReviewFields({ analysis: new Date() }), {})
})

test('pickEditableReviewFields sin objeto devuelve vacío', () => {
  assert.deepEqual(pickEditableReviewFields(null), {})
  assert.deepEqual(pickEditableReviewFields(undefined), {})
  assert.deepEqual(pickEditableReviewFields('summary'), {})
  assert.deepEqual(pickEditableReviewFields(['summary']), {})
})

test('pickEditableReviewFields no lee campos heredados', () => {
  const inherited = Object.create({ summary: 'heredado' })
  assert.deepEqual(pickEditableReviewFields(inherited), {})
})

test('reviewMatchesCheckin exige el mismo check-in, espacio y atleta', () => {
  const review = { checkin_id: CHECKIN, coach_id: COACH, client_id: CLIENT }
  const checkin = { id: CHECKIN, coach_id: COACH, client_id: CLIENT }
  assert.equal(reviewMatchesCheckin(review, checkin), true)
  assert.equal(reviewMatchesCheckin(review, { ...checkin, id: 'checkin-b' }), false)
  assert.equal(reviewMatchesCheckin(review, { ...checkin, coach_id: 'coach-b' }), false)
  assert.equal(reviewMatchesCheckin(review, { ...checkin, client_id: 'client-b' }), false)
})

test('reviewMatchesCheckin no acepta datos vacíos', () => {
  assert.equal(reviewMatchesCheckin(null, { id: CHECKIN }), false)
  assert.equal(reviewMatchesCheckin({ checkin_id: CHECKIN }, null), false)
  assert.equal(reviewMatchesCheckin({}, {}), false)
  assert.equal(
    reviewMatchesCheckin(
      { checkin_id: CHECKIN, coach_id: '', client_id: '' },
      { id: CHECKIN, coach_id: '', client_id: '' },
    ),
    false,
  )
})

test('reviewInScope exige el espacio y, si se indica, el atleta', () => {
  const review = { coach_id: COACH, client_id: CLIENT }
  assert.equal(reviewInScope(review, { coachId: COACH }), true)
  assert.equal(reviewInScope(review, { coachId: COACH, clientId: CLIENT }), true)
  assert.equal(reviewInScope(review, { coachId: 'coach-b' }), false)
  assert.equal(reviewInScope(review, { coachId: COACH, clientId: 'client-b' }), false)
})

test('reviewInScope sin espacio no vale', () => {
  const review = { coach_id: COACH, client_id: CLIENT }
  assert.equal(reviewInScope(review, null), false)
  assert.equal(reviewInScope(review, { coachId: '' }), false)
  assert.equal(reviewInScope(review, { coachId: null, clientId: CLIENT }), false)
  assert.equal(reviewInScope(null, { coachId: COACH }), false)
})
