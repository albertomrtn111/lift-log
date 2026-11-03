import assert from 'node:assert/strict'
import test from 'node:test'

import { scopesForNotification, scopesOverlap } from '../src/lib/athlete-data-events.js'

test('coach plan updates refresh the screens that show that plan', () => {
  assert.deepEqual(scopesForNotification({ type: 'plan_updated', url: '/routine' }), ['training'])
  assert.deepEqual(scopesForNotification({ type: 'plan_updated', url: '/planning' }), ['cardio', 'training'])
  assert.deepEqual(scopesForNotification({ type: 'macro_updated', url: '/diet' }), ['diet-plan', 'nutrition', 'supplements'])
  assert.deepEqual(scopesForNotification({ type: 'plan_updated', url: '/diet?tab=supplements' }), ['diet-plan', 'nutrition', 'supplements'])
})

test('review notifications refresh progress (reviews and summary)', () => {
  assert.deepEqual(
    scopesForNotification({ type: 'check_in', url: '/summary?tab=revisiones&checkin=abc' }),
    ['reviews', 'metrics'],
  )
  assert.deepEqual(scopesForNotification({ type: 'check_in', url: null }), ['reviews'])
})

test('chat messages and unknown links do not reload any screen', () => {
  assert.deepEqual(scopesForNotification({ type: 'message', url: '/chat' }), [])
  assert.deepEqual(scopesForNotification({ type: 'general', url: '/chat' }), [])
  assert.deepEqual(scopesForNotification(null), [])
})

test('scopesOverlap only matches shared scopes', () => {
  assert.equal(scopesOverlap(['nutrition'], ['diet-plan', 'nutrition']), true)
  assert.equal(scopesOverlap(['training'], ['nutrition']), false)
  assert.equal(scopesOverlap(['training'], []), false)
  assert.equal(scopesOverlap(['training'], undefined), false)
})
