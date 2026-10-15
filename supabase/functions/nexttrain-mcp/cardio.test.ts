import assert from 'node:assert/strict'
import { registerCardioTools } from './cardio.ts'

const client = '11111111-1111-4111-8111-111111111111'
const coach = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const foreign = '44444444-4444-4444-8444-444444444444'
const updated = '2026-10-15T10:00:00.123456+00:00'

function fixture() {
  const state: any = { writes: [], race: false, sessions: [{ id: sessionId, client_id: client, coach_id: coach,
    updated_at: updated, name: 'Series antiguas', activity_type: 'Running', training_type: 'series', scheduled_date: '2026-10-15',
    description: 'Original', target_distance_km: 4.75, target_duration_min: 20.5,
    structure: { mode: 'structured', trainingType: 'series', blocks: [{ id: 'original', type: 'intervals', description: '4×1000', sets: 4,
      workDistance: 1, workDuration: 4, restDistance: 0.25, restDuration: 1.5, restType: 'active', restAfterLastRep: false }] },
    is_completed: true, actual_distance_km: 4.9, actual_duration_min: 22, feedback_notes: 'Buen entreno', strava_activity_id: foreign }] }
  const db = { from() {
    const filters: any[] = []
    let update: any, insert: any
    const query: any = {
      select() { return query }, eq(key: string, value: any) { filters.push([key, value]); return query },
      is(key: string, value: any) { filters.push([key, value]); return query },
      update(value: any) { update = value; return query }, insert(value: any) { insert = value; return query },
      single() { return query.maybeSingle() },
      maybeSingle() {
        if (state.race && update) state.sessions[0].updated_at = '2026-10-15T11:00:00Z'
        let row = state.sessions.find((row: any) => filters.every(([key, value]) => row[key] === value))
        if (insert) { row = { id: foreign, updated_at: updated, ...insert }; state.sessions.push(row); state.writes.push(insert) }
        if (update && row) { Object.assign(row, update); state.writes.push(update) }
        return Promise.resolve({ data: row ? { ...row } : null, error: null })
      },
    }
    return query
  } }
  const registered = new Map<string, any>()
  registerCardioTools({ registerTool(name: string, config: any, run: any) { registered.set(name, { config, run }) } }, db, {
    resolveCoach: async (_db: any, id?: string) => { if (id && id !== coach) throw new Error('Espacio no autorizado'); return { coachId: coach } },
    requireClient: async (_db: any, space: string, id: string) => { if (space !== coach || id !== client) throw new Error('Cliente no autorizado') },
    jsonResult: (data: any) => ({ data }), toolError: (error: string) => ({ error }), audit() {}, annotations: { readOnlyHint: true },
  })
  return { state, async run(name: string, value: any) { const tool = registered.get(name); return await tool.run(tool.config.inputSchema.parse(value)) } }
}

Deno.test('creation requires an explicit planning mode and quick does not create blocks', async () => {
  const { run, state } = fixture()
  const input = { client_id: client, name: 'Rodaje', scheduled_date: '2026-10-16', description: 'Rodaje fácil' }
  await assert.rejects(() => run('schedule_cardio_session', input))
  const { data } = await run('schedule_cardio_session', { ...input, planning_mode: 'quick' })
  assert.equal(data.session.planned_structure, null)
  assert.equal(data.session.structure.mode, 'free_text')
  assert.equal(state.writes.length, 1)
  await assert.rejects(() => run('schedule_cardio_session', { ...input, planning_mode: 'quick', scheduled_date: '2026-02-30' }))
})

Deno.test('read exposes editable intervals, recoveries and an optimistic version', async () => {
  const { run } = fixture()
  const { data } = await run('get_cardio_session', { client_id: client, session_id: sessionId })
  assert.equal(data.editable_plan.blocks[0].distance_per_rep_m, 1000)
  assert.equal(data.editable_plan.blocks[0].recovery_distance_m, 250)
  assert.equal(data.editable_plan.blocks[0].recovery_after_last_rep, false)
  assert.equal(data.expected_updated_at, updated)
})

Deno.test('preview is read-only and includes all active recoveries', async () => {
  const { run, state } = fixture()
  const result = await run('preview_cardio_session', { client_id: client, planning_mode: 'structured', blocks: [
    { type: 'intervals', description: '4×1000', repetitions: 4, distance_per_rep_m: 1000, duration_per_rep_seconds: 240,
      recovery_seconds: 90, recovery_distance_m: 250, recovery_type: 'active' },
  ] })
  assert.equal(result.data.normalized.target_distance_km, 4.75)
  assert.equal(result.data.normalized.target_duration_min, 20.5)
  assert.equal(result.data.saved, false)
  assert.equal(state.writes.length, 0)
})

Deno.test('editing repetitions updates totals in place and preserves actual results and Strava', async () => {
  const { run, state } = fixture()
  const read = await run('get_cardio_session', { client_id: client, session_id: sessionId })
  const { data } = await run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: updated,
    blocks: [{ ...read.data.editable_plan.blocks[0], repetitions: 5 }] })
  assert.equal(data.session.id, sessionId)
  assert.equal(data.session.target_distance_km, 6)
  assert.equal(data.session.target_duration_min, 26)
  assert.equal(data.session.actual_distance_km, 4.9)
  assert.equal(data.session.actual_duration_min, 22)
  assert.equal(data.session.is_completed, true)
  assert.equal(state.sessions[0].strava_activity_id, foreign)
  assert.equal(state.sessions[0].feedback_notes, 'Buen entreno')
  assert.equal(state.sessions.length, 1)
  assert.ok(!('is_completed' in state.writes[0]))
  assert.ok(!('actual_distance_km' in state.writes[0]))
})

Deno.test('switching to quick removes executable structure and stale derived targets', async () => {
  const { run } = fixture()
  const { data } = await run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: updated,
    planning_mode: 'quick', description: '40 min suaves', target_duration_min: 40 })
  assert.equal(data.session.planned_structure, null)
  assert.deepEqual(data.session.structure.blocks, [])
  assert.equal(data.session.target_distance_km, null)
  assert.equal(data.session.target_duration_min, 40)
})

Deno.test('notes and date edits preserve all planning blocks and targets', async () => {
  const { run, state } = fixture()
  const original = structuredClone(state.sessions[0].structure)
  const { data } = await run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: updated,
    coach_notes: 'Hidratarse', scheduled_date: '2026-10-17' })
  assert.deepEqual(data.session.structure.blocks, original.blocks)
  assert.equal(data.session.target_distance_km, 4.75)
  assert.equal(data.session.coach_notes, 'Hidratarse')
  assert.equal(data.session.scheduled_date, '2026-10-17')
  assert.equal(data.session.date, '2026-10-17')
})

Deno.test('foreign scope, stale versions and a concurrent edit cannot write', async () => {
  const { run, state } = fixture()
  assert.ok((await run('get_cardio_session', { client_id: foreign, session_id: sessionId })).error)
  assert.ok((await run('get_cardio_session', { client_id: client, session_id: sessionId, coach_id: foreign })).error)
  assert.ok((await run('get_cardio_session', { client_id: client, session_id: foreign })).error)
  assert.ok((await run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: '2026-10-14T10:00:00Z', name: 'Wrong' })).error)
  state.race = true
  assert.ok((await run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: updated, name: 'Wrong' })).error)
  assert.equal(state.writes.length, 0)
  await assert.rejects(() => run('update_cardio_session', { client_id: client, session_id: sessionId, expected_updated_at: updated, is_completed: false }))
})
