import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateCardioStructureTotals,
  getCardioStructureLines,
  summarizeCardioStructure,
} from '../src/lib/cardio/structure.js'

const structuredSession = {
  mode: 'structured',
  trainingType: 'series',
  blocks: [
    {
      id: 'warmup',
      type: 'warmup',
      label: 'Calentamiento',
      duration: 10,
      targetPace: 'suave',
    },
    {
      id: 'main',
      type: 'intervals',
      label: 'Bloque principal',
      sets: 3,
      workDistance: 1,
      workTargetPace: '4:15/km',
      restDuration: 2,
      restType: 'active',
    },
    {
      id: 'cooldown',
      type: 'cooldown',
      label: 'Vuelta a la calma',
      duration: 10,
      targetPace: 'suave',
    },
  ],
}

test('summarizeCardioStructure builds a compact Garmin-style summary', () => {
  assert.equal(
    summarizeCardioStructure(structuredSession),
    '10 min suave · 3 x 1000 m @ 4:15/km rec 2 min · 10 min suave'
  )
})

test('summarizeCardioStructure keeps continuous long distances in kilometers', () => {
  assert.equal(
    summarizeCardioStructure({
      mode: 'structured',
      blocks: [{ id: 'steady', type: 'continuous', label: 'Continuo', distance: 10, targetPace: 'suave' }],
    }),
    '10 km suave'
  )
})

test('calculateCardioStructureTotals sums structured blocks', () => {
  assert.deepEqual(calculateCardioStructureTotals(structuredSession), {
    distanceKm: 3,
    durationMin: 26,
  })
})

test('getCardioStructureLines keeps free-text legacy sessions readable', () => {
  assert.deepEqual(
    getCardioStructureLines({
      trainingType: 'fartlek',
      description: '2km calentamiento 3x7 a 5:10-5:15 3 min recuperacion',
      blocks: [],
    }),
    ['2km calentamiento 3x7 a 5:10-5:15 3 min recuperacion']
  )
})

test('getCardioStructureLines renders structured blocks as separate plan lines', () => {
  assert.deepEqual(getCardioStructureLines(structuredSession), [
    'Calentamiento: 10 min suave',
    'Bloque principal: 3 x 1000 m @ 4:15/km rec 2 min',
    'Vuelta a la calma: 10 min suave',
  ])
})
