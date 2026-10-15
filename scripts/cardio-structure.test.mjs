import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateCardioStructureTotals,
  cardioSessionMetrics,
  cardioActivityType,
  analyzeCardioStructure,
  prepareCardioSessionPlan,
  cardioPaceMinutesPerKm,
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

test('mixed blocks do not pretend the work distance or recovery time is the whole session', () => {
  assert.deepEqual(calculateCardioStructureTotals(structuredSession), {
    distanceKm: null,
    durationMin: 36.8,
  })
  assert.equal(analyzeCardioStructure(structuredSession).knownDistanceKm, 3)
  assert.equal(analyzeCardioStructure(structuredSession).recoveryCount, 2)
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

const complete = {
  mode: 'structured', trainingType: 'series', blocks: [
    { type: 'warmup', distance: 2, duration: 12 },
    { type: 'intervals', sets: 4, workDistance: 1, workDuration: 4, restDistance: 0.25, restDuration: 1.5, restType: 'active' },
    { type: 'cooldown', distance: 1, duration: 6 },
  ],
}

test('4×1 km includes exactly three active recoveries by default plus warmup and cooldown', () => {
  assert.deepEqual(calculateCardioStructureTotals(complete), { distanceKm: 7.75, durationMin: 38.5 })
  const details = analyzeCardioStructure(complete)
  assert.equal(details.recoveryCount, 3)
  assert.equal(details.breakdown.find(part => part.phase === 'recovery').distanceKm, 0.75)
  const withLast = { ...complete, blocks: complete.blocks.map(block => ({ ...block, restAfterLastRep: true })) }
  assert.deepEqual(calculateCardioStructureTotals(withLast), { distanceKm: 8, durationMin: 40 })
})

test('a single repetition has no recovery unless the final recovery is explicitly enabled', () => {
  assert.deepEqual(calculateCardioStructureTotals({ blocks: [{ type: 'intervals', sets: 1, workDistance: 1, workDuration: 4, restDuration: 2, restType: 'passive' }] }), { distanceKm: 1, durationMin: 4 })
  assert.deepEqual(calculateCardioStructureTotals({ blocks: [{ type: 'intervals', sets: 1, workDistance: 1, workDuration: 4, restDuration: 2, restType: 'passive', restAfterLastRep: true }] }), { distanceKm: 1, durationMin: 6 })
})

test('passive recovery adds time and zero distance while timed active recovery leaves distance partial', () => {
  const base = { blocks: [{ type: 'intervals', sets: 4, workDistance: 1, workDuration: 4, restDuration: 2, restType: 'passive' }] }
  assert.deepEqual(calculateCardioStructureTotals(base), { distanceKm: 4, durationMin: 22 })
  base.blocks[0].restType = 'active'
  assert.deepEqual(calculateCardioStructureTotals(base), { distanceKm: null, durationMin: 22 })
  assert.equal(analyzeCardioStructure(base).knownDistanceKm, 4)
})

test('a precise recovery pace can estimate distance, independently of the work pace', () => {
  const plan = { trainingType: 'series', blocks: [{ type: 'intervals', sets: 4, workDistance: 1, workTargetPace: '4:00/km', restDuration: 1.5, restTargetPace: '6:00/km', restType: 'active' }] }
  const details = analyzeCardioStructure(plan)
  assert.equal(details.distanceKm, 4.75)
  assert.equal(details.durationMin, 20.5)
  assert.equal(details.distanceEstimated, true)
  assert.equal(details.durationEstimated, true)
  assert.equal(cardioPaceMinutesPerKm('2:00/100 m'), 20)
  assert.equal(cardioPaceMinutesPerKm('2:00', 'swim'), 20)
  for (const pace of ['Z2', 'suave', '5:00-5:30/km', '180 W', '25 km/h']) assert.equal(cardioPaceMinutesPerKm(pace), null)
})

test('swimming totals count metres and passive recovery time without fictitious distance', () => {
  assert.deepEqual(calculateCardioStructureTotals({ trainingType: 'swim', blocks: [
    { type: 'warmup', distance: 0.3, targetPace: '2:00/100 m' },
    { type: 'intervals', sets: 4, workDistance: 0.2, workTargetPace: '2:00/100 m', restDuration: 0.5, restType: 'passive' },
    { type: 'cooldown', distance: 0.1, targetPace: '2:00/100 m' },
  ] }), { distanceKm: 1.2, durationMin: 25.5 })
})

test('partial values cannot silently become a total and contradictory targets are rejected', () => {
  const input = { structure: { mode: 'structured', blocks: [{ type: 'warmup', duration: 10 }, { type: 'intervals', sets: 3, workDistance: 1, restDuration: 2, restType: 'active' }] } }
  const saved = prepareCardioSessionPlan(input)
  assert.equal(saved.target_distance_km, null)
  assert.equal(saved.target_duration_min, null)
  assert.equal(saved.totals.knownDistanceKm, 3)
  assert.throws(() => prepareCardioSessionPlan({ ...input, targetDistanceKm: 2 }), /conocidos.*3000 m/)
  assert.throws(() => prepareCardioSessionPlan({ structure: complete, targetDistanceKm: 7 }), /7750 m/)
  assert.throws(() => prepareCardioSessionPlan({ structure: complete, targetDurationMin: 10 }), /38.5 min/)
})

test('invalid sets and passive distance are rejected before saving', () => {
  for (const sets of [0, 1.5, -1, 101]) assert.throws(() => prepareCardioSessionPlan({ structure: { mode: 'structured', blocks: [{ type: 'intervals', sets, workDistance: 1 }] } }))
  assert.throws(() => prepareCardioSessionPlan({ structure: { mode: 'structured', blocks: [{ type: 'intervals', sets: 3, workDistance: 1, restType: 'passive', restDistance: 0.2 }] } }), /pausa parada/)
  assert.throws(() => prepareCardioSessionPlan({ structure: { mode: 'structured', blocks: [{ type: 'continuous', duration: -1 }] } }), /negativas/)
})

test('switching to quick clears executable blocks and pace but preserves instructions and notes', () => {
  const saved = prepareCardioSessionPlan({ structure: { ...complete, mode: 'free_text', notes: 'Hidratarse' }, description: '40 min suaves', targetPace: '5:00' })
  assert.equal(saved.planned_structure, null)
  assert.deepEqual(saved.structure.blocks, [])
  assert.equal(saved.structure.notes, 'Hidratarse')
  assert.equal(saved.target_pace, null)
})

test('quick mode never revives hidden legacy blocks in calendar totals', () => {
  assert.deepEqual(cardioSessionMetrics({ structure: { ...complete, mode: 'free_text' }, target_distance_km: 5, target_duration_min: 30 }), { distanceKm: 5, durationMin: 30 })
})

test('sport metadata matches the editor discipline, including swimming and cycling', () => {
  assert.equal(cardioActivityType('swim'), 'Natación')
  assert.equal(cardioActivityType('bike'), 'Bicicleta')
  assert.equal(cardioActivityType('series'), 'Running')
  assert.equal(cardioActivityType('other', 'Senderismo'), 'Senderismo')
})

test('an old timed recovery without a recorded type is not assumed to be stationary', () => {
  const session = { structure: { blocks: [{ type: 'intervals', sets: 3, workDistance: 1, workDuration: 4, restDuration: 2 }] }, target_distance_km: 4 }
  assert.equal(analyzeCardioStructure(session.structure).distanceComplete, false)
  assert.equal(cardioSessionMetrics(session).distanceKm, 4)
})
