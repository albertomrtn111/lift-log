import assert from 'node:assert/strict'
import { queuePlanChangeNotice } from './shared.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const plan = '33333333-3333-4333-8333-333333333333'

function fakeDb(result: { error: unknown } = { error: null }) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  return {
    inserts,
    from(table: string) {
      return { insert: async (row: Record<string, unknown>) => { inserts.push({ table, row }); return result } }
    },
  }
}

Deno.test('a plan change by the AI queues a notice for the athlete', async () => {
  const db = fakeDb()
  await queuePlanChangeNotice(db, 'update_strength_program', coach, client, { record_id: plan }, { updated: true })
  assert.deepEqual(db.inserts, [{
    table: 'notification_outbox',
    row: { coach_id: coach, client_id: client, kind: 'training', plan_id: plan, source: 'mcp' },
  }])
})

Deno.test('the plan id is taken from the result when the tool does not log it', async () => {
  const db = fakeDb()
  await queuePlanChangeNotice(db, 'create_macro_plan', coach, client, {}, { created: true, macro_plan: { id: plan } })
  assert.equal(db.inserts[0].row.kind, 'macros')
  assert.equal(db.inserts[0].row.plan_id, plan)
})

Deno.test('reads and season tools queue nothing', async () => {
  const db = fakeDb()
  await queuePlanChangeNotice(db, 'get_program_history', coach, client, {}, {})
  await queuePlanChangeNotice(db, 'update_season_plan', coach, client, {}, {})
  await queuePlanChangeNotice(db, 'update_strength_program', coach, null, {}, {})
  assert.equal(db.inserts.length, 0)
})

Deno.test('a failing queue never breaks the tool', async () => {
  await queuePlanChangeNotice(fakeDb({ error: { message: 'no table' } }), 'update_diet_plan', coach, client, {}, {})
  await queuePlanChangeNotice({ from() { throw new Error('boom') } }, 'update_diet_plan', coach, client, {}, {})
})
