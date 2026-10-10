import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCardioPlan } from '../supabase/functions/nexttrain-mcp/cardio-plan.js'
import { calculateCardioStructureTotals, hasRenderableCardioBlocks, resolveCardioPlanForDisplay } from '../src/lib/cardio/structure.js'

const swimBlocks = [
  { type: 'warmup', description: '300 m suaves', distance_m: 300 },
  { type: 'intervals', description: '4×50 m técnica', repetitions: 4, distance_per_rep_m: 50, recovery_seconds: 25 },
  { type: 'intervals', description: '4×200 m aeróbico', repetitions: 4, distance_per_rep_m: 200, recovery_seconds: 40, target_rpe: '4-5' },
  { type: 'intervals', description: '2×50 m pull buoy', repetitions: 2, distance_per_rep_m: 50 },
  { type: 'cooldown', description: '100 m suaves', distance_m: 100 },
]

test('quick swimming keeps the description and never creates a planned structure', () => {
  const plan = normalizeCardioPlan({
    planning_mode: 'quick', activity_type: 'Natación', training_type: 'Swim',
    description: '300 m + 4×50 m + 4×200 m + 2×50 m + 100 m',
    target_distance_km: 1.5, target_duration_min: 35,
  })
  assert.equal(plan.structure.mode, 'free_text')
  assert.equal(plan.structure.trainingType, 'swim')
  assert.equal(plan.planned_structure, null)
  assert.equal(plan.target_distance_km, 1.5)
  assert.equal(resolveCardioPlanForDisplay({ structure: plan.structure, planned_structure: { blocks: swimBlocks } }), null)
})

test('structured swimming uses per-repetition metres and a native editor structure', () => {
  const plan = normalizeCardioPlan({
    planning_mode: 'structured', activity_type: 'Natación',
    target_distance_km: 1.5, target_duration_min: 35, blocks: swimBlocks,
  })
  assert.equal(plan.distance_validation.status, 'matched')
  assert.equal(plan.distance_validation.block_distance_m, 1500)
  assert.equal(plan.structure.blocks[2].workDistance, 0.2)
  assert.equal(plan.structure.blocks[2].sets, 4)
  assert.equal(plan.structure.blocks[2].workTargetRpe, '4-5')
  assert.equal(plan.structure.blocks[1].restAfterLastRep, false)
  assert.equal(calculateCardioStructureTotals(plan.structure).distanceKm, 1.5)
  assert.equal(hasRenderableCardioBlocks(plan.planned_structure), true)
})

test('a distance mismatch is rejected before a session can be inserted', () => {
  assert.throws(() => normalizeCardioPlan({
    planning_mode: 'structured', activity_type: 'Natación', target_distance_km: 1.5,
    blocks: [{ type: 'intervals', description: '4×200 m', repetitions: 4, distance_per_rep_m: 200 }],
  }), /suman 800 m.*1500 m/)
})

test('legacy ambiguous intervals cannot be interpreted as completed blocks', () => {
  const legacy = { blocks: [{ type: 'intervals', description: '4×200 m', repetitions: 4, distance_km: 0.8 }] }
  assert.equal(hasRenderableCardioBlocks(legacy), false)
  assert.equal(resolveCardioPlanForDisplay({ structure: legacy, planned_structure: legacy }), null)
  assert.throws(() => normalizeCardioPlan({ planning_mode: 'structured', activity_type: 'Natación', blocks: legacy.blocks }), /distance_per_rep_m/)
})

test('quick mode refuses blocks instead of silently dropping them', () => {
  assert.throws(() => normalizeCardioPlan({
    planning_mode: 'quick', activity_type: 'Natación', description: 'Suave', blocks: swimBlocks,
  }), /no admite bloques/)
})
