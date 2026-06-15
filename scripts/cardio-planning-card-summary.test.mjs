import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlanningCardioSummary } from '../src/lib/cardio/planning-card-summary.js'

test('buildPlanningCardioSummary hides structured workout details on calendar cards', () => {
  assert.equal(
    buildPlanningCardioSummary({
      target_distance_km: 11,
      target_pace: '5:40-5:50',
      summary_line:
        '11 km · 5:40-5:50 · Calentamiento 2km suaves - 145-155ppm Bloque principal 2x2000',
      structure: {
        mode: 'structured',
        trainingType: 'fartlek',
        description:
          'Calentamiento 2km suaves - 145-155ppm Bloque principal 2x2000 - 5:00/km Rec 2 min',
        blocks: [
          { id: 'warmup', type: 'warmup', distance: 2, targetHR: '145-155ppm' },
          { id: 'main', type: 'intervals', sets: 2, workDistance: 2, workTargetPace: '5:00/km', restDuration: 2 },
          { id: 'cooldown', type: 'cooldown', distance: 5 },
        ],
      },
    }),
    '11 km'
  )
})

test('buildPlanningCardioSummary falls back to structured totals when explicit targets are missing', () => {
  assert.equal(
    buildPlanningCardioSummary({
      structure: {
        mode: 'structured',
        trainingType: 'rodaje',
        blocks: [
          { id: 'easy-1', type: 'continuous', distance: 2, duration: 12 },
          { id: 'easy-2', type: 'continuous', distance: 7, duration: 42 },
          { id: 'easy-3', type: 'continuous', distance: 6 },
        ],
      },
    }),
    '15 km / 54 min'
  )
})
