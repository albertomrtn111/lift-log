import assert from 'node:assert/strict'
import { loadSkippedDays, registerStrengthSkipTools } from './strength-skips.ts'
import { outputSchemas } from './output-schemas.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const otherClient = '33333333-3333-4333-8333-333333333333'
const program = '44444444-4444-4444-8444-444444444444'
const legs = '55555555-5555-4555-8555-555555555555'
const torso = '66666666-6666-4666-8666-666666666666'

// Programa de 4 semanas que empieza el miércoles 4 de noviembre: la semana 3 va del 16 al 22.
function fixture(extra: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    training_programs: [{ id: program, coach_id: coach, client_id: client, name: 'Bloque A', status: 'active', weeks: 4, effective_from: '2026-11-04' }],
    training_days: [
      { id: legs, program_id: program, name: 'Pierna', default_weekday: 1 },
      { id: torso, program_id: program, name: 'Torso', default_weekday: 4 },
    ],
    training_exercises: [{ id: 'ex-squat', program_id: program, day_id: legs }, { id: 'ex-bench', program_id: program, day_id: torso }],
    training_exercise_sets: [],
    scheduled_strength_sessions: [],
    strength_day_week_skips: [],
    ...extra,
  }
  const writes: any[] = []
  const db = {
    from(table: string) {
      let rows = [...tables[table] ?? []]
      let action: 'select' | 'insert' | 'delete' = 'select'
      let payload: any = null
      const filters: Array<(row: any) => boolean> = []
      const apply = () => rows.filter((row) => filters.every((filter) => filter(row)))
      const execute = () => {
        if (action === 'insert') {
          const duplicate = tables[table].some((row) => row.program_id === payload.program_id && row.day_id === payload.day_id && row.week_index === payload.week_index)
          if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate' } }
          const row = { id: `skip-${tables[table].length + 1}`, created_at: '2026-11-15T10:00:00Z', ...payload }
          tables[table].push(row)
          writes.push({ table, action, row })
          return { data: [row], error: null }
        }
        const matched = apply()
        if (action === 'delete') {
          tables[table] = tables[table].filter((row) => !matched.includes(row))
          writes.push({ table, action, count: matched.length })
        }
        return { data: matched, error: null }
      }
      const query: any = {
        select() { return query }, order() { return query }, limit() { return query },
        insert(value: any) { action = 'insert'; payload = value; return query },
        delete() { action = 'delete'; return query },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query },
        gte(key: string, value: string) { filters.push((row) => row[key] >= value); return query },
        lte(key: string, value: string) { filters.push((row) => row[key] <= value); return query },
        maybeSingle() { const { data, error } = execute(); return Promise.resolve({ data: data?.[0] ?? null, error }) },
        single() { const { data, error } = execute(); return Promise.resolve({ data: data?.[0] ?? null, error }) },
        then(resolve: any) { return Promise.resolve(execute()).then(resolve) },
      }
      return query
    },
  }
  const tools = new Map<string, any>()
  registerStrengthSkipTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
    requireClient: async (_db: any, space: string, id: string) => { if (space !== coach || (id !== client && id !== otherClient)) throw new Error('Cliente no encontrado en el espacio del entrenador.') },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
  })
  const parse = (name: string, input: any) => tools.get(name).config.inputSchema.parse(input)
  async function run(name: string, input: any) {
    const result = await tools.get(name).run(parse(name, input))
    if (result.data) outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, parse, tables, writes, db }
}

Deno.test('skip_strength_day_week removes a day in one program week, by week or by date', async () => {
  const { run, tables } = fixture()
  const { data } = await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, date: '2026-11-19', reason: 'Molestia rodilla' })
  assert.equal(data.skipped, true)
  assert.equal(data.already_skipped, false)
  assert.equal(data.week, 3)
  assert.equal(data.planned_date, '2026-11-16')
  assert.deepEqual([data.week_start, data.week_end], ['2026-11-16', '2026-11-22'])
  assert.deepEqual(tables.strength_day_week_skips.map((row) => [row.coach_id, row.client_id, row.day_id, row.week_index, row.reason]), [
    [coach, client, legs, 3, 'Molestia rodilla'],
  ])

  // Repetirlo no duplica nada.
  const again = await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })
  assert.equal(again.data.already_skipped, true)
  assert.equal(tables.strength_day_week_skips.length, 1)
})

Deno.test('restore_strength_day_week brings the day back and reports whether it was removed', async () => {
  const { run, tables } = fixture()
  await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })
  const { data } = await run('restore_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })
  assert.equal(data.restored, true)
  assert.equal(data.was_skipped, true)
  assert.equal(tables.strength_day_week_skips.length, 0)
  const twice = await run('restore_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })
  assert.equal(twice.data.was_skipped, false)
})

Deno.test('a day the athlete already trained that week cannot be removed', async () => {
  const done = fixture({ scheduled_strength_sessions: [{ id: 's1', coach_id: coach, client_id: client, program_id: program, day_id: legs, scheduled_date: '2026-11-17', is_completed: true }] })
  assert.match((await done.run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })).error, /ya ha registrado «Pierna» en la semana 3/)
  const sets = fixture({ training_exercise_sets: [{ id: 'set-1', exercise_id: 'ex-squat', week_index: 3, completed: true }] })
  assert.match((await sets.run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 3 })).error, /ya ha registrado/)
  // Otra semana sí se puede.
  assert.equal((await sets.run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 2 })).data.skipped, true)
  assert.equal(done.tables.strength_day_week_skips.length, 0)
})

Deno.test('the program, the day and the week must belong to that client', async () => {
  const { run, parse, writes } = fixture()
  assert.match((await run('skip_strength_day_week', { client_id: otherClient, program_id: program, day_id: legs, week: 1 })).error, /No se ha encontrado ese programa/)
  assert.match((await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: '77777777-7777-4777-8777-777777777777', week: 1 })).error, /no pertenece/)
  assert.match((await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 5 })).error, /semana 1 a la 4/)
  assert.match((await run('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, date: '2026-11-01' })).error, /semana 1 a la 4/)
  assert.throws(() => parse('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs }))
  assert.throws(() => parse('skip_strength_day_week', { client_id: client, program_id: program, day_id: legs, week: 2, date: '2026-11-10' }))
  assert.equal(writes.length, 0)
})

Deno.test('loadSkippedDays is scoped to coach and client and tolerates a missing table', async () => {
  const { db } = fixture({ strength_day_week_skips: [
    { id: 'a', coach_id: coach, client_id: client, program_id: program, day_id: legs, week_index: 2 },
    { id: 'b', coach_id: coach, client_id: otherClient, program_id: program, day_id: legs, week_index: 2 },
  ] })
  assert.deepEqual((await loadSkippedDays(db, coach, client)).map((row) => row.id), ['a'])
  assert.deepEqual(await loadSkippedDays(db, coach, client, []), [])
  const broken = { from: () => { const q: any = { select: () => q, eq: () => q, in: () => q, then: (resolve: any) => Promise.resolve({ data: null, error: { code: '42P01' } }).then(resolve) }; return q } }
  assert.deepEqual(await loadSkippedDays(broken, coach, client), [])
})
