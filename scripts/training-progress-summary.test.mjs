import assert from 'node:assert/strict'
import test from 'node:test'

import { getBlockDeltaPct, summarizeBlockProgress } from '../src/lib/training/progress-summary.js'

function set(weekIndex, setIndex, weightKg, reps) {
  return { weekIndex, setIndex, weightKg, reps, rir: 2, completed: false, notes: null }
}

function exercise(id, name, setsByWeek) {
  return { id, name, order: 1, prescribedSets: 4, prescribedReps: '5-7', prescribedRir: 2, setsByWeek }
}

function day(exercises) {
  return { id: 'day-1', name: 'Pierna', order: 1, exercises }
}

// Caso real: semana 1 85kg×8 (e1RM 107,7) → semana 5 80kg×5 (e1RM 93,3)
const squat = exercise('squat', 'Sentadilla trasera high bar con barra', {
  1: [set(1, 0, 85, 8), set(1, 1, 85, 8), set(1, 2, 80, 8)],
  5: [set(5, 0, 80, 5), set(5, 1, 80, 5), set(5, 2, 80, 5), set(5, 3, 80, 5)],
})

test('block delta compares the first and last weeks with sets by e1RM', () => {
  assert.equal(Math.round(getBlockDeltaPct(squat) * 1000) / 10, -13.3)
})

test('a declining exercise is never reported as the best progress of the block', () => {
  const summary = summarizeBlockProgress([day([squat])])
  assert.equal(summary.best, null)
  assert.equal(summary.comparable, 1)
  assert.equal(summary.declining, 1)
  assert.equal(summary.improving, 0)
})

test('stable exercises below the trend threshold are not the best progress either', () => {
  const stable = exercise('row', 'Remo', {
    1: [set(1, 0, 60, 8)],
    2: [set(2, 0, 60.5, 8)],
  })
  const summary = summarizeBlockProgress([day([squat, stable])])
  assert.equal(summary.best, null)
  assert.equal(summary.stable, 1)
})

test('the best progress is the largest improvement when some exercise improves', () => {
  const bench = exercise('bench', 'Press banca', {
    1: [set(1, 0, 80, 8)],
    3: [set(3, 0, 85, 8)],
  })
  const deadlift = exercise('deadlift', 'Peso muerto', {
    1: [set(1, 0, 140, 5)],
    3: [set(3, 0, 142.5, 5)],
  })
  const summary = summarizeBlockProgress([day([squat, deadlift, bench])])
  assert.equal(summary.best?.exercise.id, 'bench')
  assert.equal(summary.improving, 2)
  assert.equal(summary.declining, 1)
  assert.equal(summary.weeksTracked, 3)
})

test('no comparable exercises leaves no best progress', () => {
  const single = exercise('single', 'Dominadas', { 1: [set(1, 0, 10, 6)] })
  const summary = summarizeBlockProgress([day([single])])
  assert.equal(summary.best, null)
  assert.equal(summary.comparable, 0)
})
