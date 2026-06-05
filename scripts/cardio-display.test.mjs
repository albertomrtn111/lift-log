import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCardioDisplayKind } from '../src/lib/cardio/display-kind.js'

test('resolveCardioDisplayKind prioritizes discipline over Strava sport type', () => {
  assert.equal(resolveCardioDisplayKind('Bicicleta', 'Ride'), 'bike')
  assert.equal(resolveCardioDisplayKind('Natación', 'Swim'), 'swim')
  assert.equal(resolveCardioDisplayKind('Running', 'Ride'), 'running')
})

test('resolveCardioDisplayKind keeps running workout variants', () => {
  assert.equal(resolveCardioDisplayKind('Running', 'fartlek'), 'fartlek')
  assert.equal(resolveCardioDisplayKind('Running', 'series'), 'series')
  assert.equal(resolveCardioDisplayKind('Running', 'tempo'), 'tempo')
})
