import assert from 'node:assert/strict'
import test from 'node:test'

import { findStrengthSession, programProgress, programTransitions, programWeekForDate, setEvidence } from '../supabase/functions/nexttrain-mcp/strength-progress.js'

const program = {
  id: 'program-1', name: 'Fuerza 12 semanas', status: 'active', effective_from: '2026-08-31', effective_to: null,
  weeks: 12, total_weeks: 12, created_at: '2026-08-25T12:00:00Z',
}
const days = [
  { id: 'push', default_weekday: 1 },
  { id: 'legs', default_weekday: 4 },
]
const sessions = [
  { id: 'session-1', program_id: 'program-1', day_id: 'push', scheduled_date: '2026-09-07', is_completed: true },
  { id: 'session-2', program_id: 'program-1', day_id: 'legs', scheduled_date: '2026-09-10', is_completed: true },
  { id: 'session-3', program_id: 'program-1', day_id: 'legs', scheduled_date: '2026-09-17', is_completed: false },
]

test('edited set values are visible but not labelled as executed', () => {
  assert.equal(setEvidence({ completed: false, is_override: true, weight_kg: 60, reps: 8 }), 'recorded_unverified')
  assert.equal(setEvidence({ completed: false, is_override: false, weight_kg: 60, reps: 8 }), null)
  assert.equal(setEvidence({ completed: true, is_override: false, weight_kg: 60 }), 'confirmed')
})

test('a moved session is associated by program, day and training week, not an invented weekday', () => {
  const moved = { id: 'moved', program_id: 'program-1', day_id: 'legs', scheduled_date: '2026-09-09', is_completed: true }
  assert.equal(programWeekForDate(program.effective_from, moved.scheduled_date), 2)
  assert.equal(findStrengthSession(program, days[1], 2, [moved]), moved)
  assert.equal(findStrengthSession(program, days[1], 2, [moved, { ...moved, id: 'duplicate' }]), null)
})

test('program progress separates elapsed calendar weeks from weeks with completed sessions', () => {
  const progress = programProgress(program, days, sessions, '2026-10-10')
  assert.equal(progress.status, 'active')
  assert.equal(progress.current_calendar_week_index, 6)
  assert.equal(progress.full_calendar_weeks_elapsed, 5)
  assert.equal(progress.weeks_with_completed_session_markers, 1)
  assert.deepEqual(progress.completed_session_week_indices, [2])
  assert.equal(progress.training_weeks_confirmed_by_sets, null)
  assert.equal(programProgress(program, days, sessions, '2026-10-10', [2, 2, 3]).training_weeks_confirmed_by_sets, 2)
  assert.equal(progress.estimated_end_date, '2026-11-22')
  assert.equal(progress.completed_sessions, 2)
  assert.equal(progress.scheduled_sessions, 3)
  assert.equal(progress.omitted_sessions, null)
  assert.ok(progress.past_sessions_without_completion_record > 0)
  assert.equal(progress.deload_week_indices, null)
})

test('archived, finished and upcoming are not conflated', () => {
  assert.equal(programProgress({ ...program, status: 'archived' }, days, sessions, '2026-10-10').status, 'archived')
  assert.equal(programProgress(program, days, sessions, '2026-11-23').status, 'finished')
  assert.equal(programProgress(program, days, sessions, '2026-08-20').status, 'upcoming')
})

test('program transitions indicate inferred chronology, not audited edits', () => {
  const transitions = programTransitions([
    program,
    { ...program, id: 'older', effective_from: '2026-06-01', created_at: '2026-05-25T00:00:00Z' },
  ])
  assert.equal(transitions[0].from_program_id, 'older')
  assert.equal(transitions[0].to_program_id, 'program-1')
  assert.equal(transitions[0].date_source, 'next_program_start')
  assert.deepEqual(programTransitions([program, { ...program, id: 'parallel' }]), [])
  assert.equal(programTransitions([
    { ...program, id: 'older', effective_from: '2026-06-01' }, program, { ...program, id: 'parallel' },
  ]).filter((item) => item.transition_date === '2026-08-31').length, 2)
})
