import assert from 'node:assert/strict'
import { registerCoachWriteTools } from './coach-writes.ts'
import { outputSchemas } from './output-schemas.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const checkin = '33333333-3333-4333-8333-333333333333'
const program = '44444444-4444-4444-8444-444444444444'
const version = '2026-10-15T10:00:00.123456+00:00'

function fixture(response: (name: string, args: any) => { data: any; error: any }) {
  const calls: any[] = []
  const db = { rpc(name: string, args: any) { calls.push({ name, args }); return Promise.resolve(response(name, args)) } }
  const tools = new Map<string, any>()
  registerCoachWriteTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
    requireClient: async (_db: any, space: string, id: string) => { if (space !== coach || id !== client) throw new Error('Cliente no encontrado en el espacio del entrenador.') },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => new Date('2026-10-15T23:30:00Z'),
  })
  const parse = (name: string, input: any) => tools.get(name).config.inputSchema.parse(input)
  async function run(name: string, input: any) {
    const result = await tools.get(name).run(parse(name, input))
    if (result.data) outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, parse, calls }
}

Deno.test('save_review_draft sends only the given texts and the versions read', async () => {
  const { run, calls } = fixture((_name, args) => ({ data: { id: 'review-1', status: 'draft', checkin_id: args.p_checkin_id, ...args.p_payload }, error: null }))
  const { data } = await run('save_review_draft', {
    client_id: client, checkin_id: checkin, message_to_client: 'Gran semana', expected_summary: null, expected_message_to_client: 'Borrador IA',
  })
  assert.equal(data.saved, true)
  assert.equal(data.review.status, 'draft')
  assert.deepEqual(calls, [{ name: 'save_nexttrain_review_draft', args: {
    p_coach_id: coach, p_client_id: client, p_checkin_id: checkin,
    p_payload: { expected_summary: null, expected_message_to_client: 'Borrador IA', message_to_client: 'Gran semana' },
  } }])
})

Deno.test('save_review_draft requires text and the read versions, and stops on foreign clients', async () => {
  const { run, parse, calls } = fixture(() => ({ data: null, error: null }))
  assert.throws(() => parse('save_review_draft', { client_id: client, checkin_id: checkin, expected_summary: null, expected_message_to_client: null }))
  assert.throws(() => parse('save_review_draft', { client_id: client, checkin_id: checkin, summary: 'x' }))
  const foreign = await run('save_review_draft', {
    client_id: '55555555-5555-4555-8555-555555555555', checkin_id: checkin, summary: 'x', expected_summary: null, expected_message_to_client: null,
  })
  assert.match(foreign.error, /Cliente no encontrado/)
  assert.equal(calls.length, 0)
})

Deno.test('own SQL errors are shown and the rest are hidden', async () => {
  const input = { client_id: client, checkin_id: checkin, summary: 'x', expected_summary: null, expected_message_to_client: null }
  const conflict = fixture(() => ({ data: null, error: { code: 'P0001', message: 'La revisión cambió; vuelve a leer get_checkins.' } }))
  assert.equal((await conflict.run('save_review_draft', input)).error, 'La revisión cambió; vuelve a leer get_checkins.')
  const approved = fixture(() => ({ data: null, error: { code: 'P0001', message: 'La revisión ya no está en borrador; edítala desde la app.' } }))
  assert.match((await approved.run('save_review_draft', input)).error, /borrador/)
  const internal = fixture(() => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }))
  assert.equal((await internal.run('save_review_draft', input)).error, 'No se ha podido guardar el borrador de la revisión. No se guardó ningún cambio.')
})

Deno.test('update_strength_program passes today in the workspace zone and only the changed fields', async () => {
  const { run, calls } = fixture((_name, args) => ({ data: {
    id: args.p_program_id, client_id: client, name: 'Bloque', status: 'active', weeks: 6, effective_from: '2026-10-16', effective_to: '2026-11-26',
    updated_at: '2026-10-15T23:30:01+00:00', coach_id: coach, archived_program_ids: ['old-program'], removed_scheduled_sessions: 3,
  }, error: null }))
  const { data } = await run('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version, status: 'active', weeks: 6 })
  assert.deepEqual(calls[0].args.p_payload, { expected_updated_at: version, today: '2026-10-16', status: 'active', weeks: 6 })
  assert.deepEqual(data.archived_program_ids, ['old-program'])
  assert.equal(data.removed_scheduled_sessions, 3)
  assert.equal(data.program.status, 'active')
  assert.equal('coach_id' in data.program, false)
})

Deno.test('update_strength_program rejects empty edits and invalid values before calling SQL', () => {
  const { parse } = fixture(() => ({ data: null, error: null }))
  assert.throws(() => parse('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version }))
  assert.throws(() => parse('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version, status: 'paused' }))
  assert.throws(() => parse('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version, weeks: 53 }))
  assert.throws(() => parse('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version, effective_from: '2026-02-30' }))
  assert.throws(() => parse('update_strength_program', { client_id: client, program_id: program, expected_updated_at: version, days: [] }))
})
