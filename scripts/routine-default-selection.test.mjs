import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRoutineInitialSelection } from '../src/lib/training/routine-defaults.js'

const program = {
  effectiveFrom: '2026-06-01',
  totalWeeks: 4,
}

const days = [
  { id: 'legs', name: 'Pierna', order: 1, defaultWeekday: 1 },
  { id: 'torso', name: 'Torso', order: 2, defaultWeekday: 3 },
  { id: 'fullbody', name: 'Fullbody', order: 3, defaultWeekday: 7 },
]

test('resolveRoutineInitialSelection opens the current program week and today strength day', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({
      program,
      days,
      today: new Date('2026-06-15T12:00:00'),
    }),
    {
      week: 3,
      dayId: 'legs',
      sessionDate: '2026-06-15',
    }
  )
})

test('resolveRoutineInitialSelection falls back to the first ordered day in the current week', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({
      program,
      days,
      today: new Date('2026-06-17T12:00:00'),
    }),
    {
      week: 3,
      dayId: 'torso',
      sessionDate: '2026-06-17',
    }
  )
})

test('resolveRoutineInitialSelection keeps the last program week after the program range', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({
      program,
      days,
      today: new Date('2026-07-15T12:00:00'),
    }),
    {
      week: 4,
      dayId: 'torso',
      sessionDate: '2026-06-24',
    }
  )
})
