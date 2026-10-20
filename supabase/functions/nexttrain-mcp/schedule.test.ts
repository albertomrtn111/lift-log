import assert from 'node:assert/strict'
import { buildStrengthSchedule, registerScheduleTools } from './schedule.ts'
import { outputSchemas } from './output-schemas.ts'

const client = '11111111-1111-4111-8111-111111111111'
const coach = '22222222-2222-4222-8222-222222222222'
const otherClient = '33333333-3333-4333-8333-333333333333'
const activeId = 'program-active'
const archivedId = 'program-archived'

// Programa de 4 semanas que empieza el lunes 5 de octubre: día A los lunes y día B los jueves.
const activeProgram = {
  id: activeId, coach_id: coach, client_id: client, name: 'Bloque 2', status: 'active', weeks: 4, total_weeks: 4,
  effective_from: '2026-10-05', effective_to: '2026-11-01', created_at: '2026-10-01T10:00:00Z',
  training_days: [
    { id: 'day-a', name: 'Pierna', order_index: 1, default_weekday: 1, training_exercises: [
      { exercise_name: 'Prensa', sets: 3, reps: '10', rir: 2, rest_seconds: 120, notes: null, order_index: 2 },
      { exercise_name: 'Sentadilla', sets: 4, reps: '6', rir: 2, rest_seconds: 180, notes: null, order_index: 1 },
    ] },
    { id: 'day-b', name: 'Torso', order_index: 2, default_weekday: 4, training_exercises: [
      { exercise_name: 'Press banca', sets: 4, reps: '8', rir: 1, rest_seconds: 150, notes: null, order_index: 1 },
    ] },
  ],
}
const archivedProgram = {
  id: archivedId, coach_id: coach, client_id: client, name: 'Bloque 1', status: 'archived', weeks: 4, total_weeks: 4,
  effective_from: '2026-09-07', effective_to: '2026-10-04', created_at: '2026-09-01T10:00:00Z',
  training_days: [{ id: 'day-old', name: 'Full body', order_index: 1, default_weekday: 2, training_exercises: [] }],
}

const strength = (items: any[]) => items.filter((item) => item.kind === 'strength')

Deno.test('a rescheduled session appears on its new date and not on the template date', () => {
  const items = buildStrengthSchedule({
    activePrograms: [activeProgram], programs: [activeProgram],
    // El jueves 15 (día B, semana 2) se movió al sábado 17.
    sessions: [{ id: 's-moved', program_id: activeId, day_id: 'day-b', scheduled_date: '2026-10-17', is_completed: false }],
    startDate: '2026-10-12', endDate: '2026-10-18',
  })
  assert.deepEqual(items.map((item) => [item.date, item.day_id, item.source]), [
    ['2026-10-12', 'day-a', 'program_template'],
    ['2026-10-17', 'day-b', 'scheduled_session'],
  ])
  const moved = items[1]
  assert.equal(moved.session_id, 's-moved')
  assert.equal(moved.rescheduled, true)
  assert.equal(moved.original_date, '2026-10-15')
  assert.equal(moved.week, 2)
  assert.equal(moved.is_completed, false)
  assert.deepEqual(items[0].exercises.map((exercise: any) => exercise.exercise_name), ['Sentadilla', 'Prensa'])
  assert.equal('order_index' in items[0].exercises[0], false)
})

Deno.test('a completed session is marked and replaces its template day', () => {
  const items = buildStrengthSchedule({
    activePrograms: [activeProgram], programs: [activeProgram],
    sessions: [{ id: 's-done', program_id: activeId, day_id: 'day-a', scheduled_date: '2026-10-12', is_completed: true }],
    startDate: '2026-10-12', endDate: '2026-10-18',
  })
  assert.equal(items.length, 2)
  const done = items.find((item) => item.day_id === 'day-a')!
  assert.equal(done.is_completed, true)
  assert.equal(done.session_id, 's-done')
  assert.equal(done.rescheduled, false)
  assert.equal(done.original_date, null)
  assert.equal(done.extra_session, false)
  const pending = items.find((item) => item.day_id === 'day-b')!
  assert.equal(pending.is_completed, false)
  assert.equal(pending.session_id, null)
})

Deno.test('a session moved before the range still hides its template day in that week', () => {
  // El jueves 15 se adelantó al lunes 12; el rango empieza el miércoles 14.
  const items = buildStrengthSchedule({
    activePrograms: [activeProgram], programs: [activeProgram],
    sessions: [{ id: 's-early', program_id: activeId, day_id: 'day-b', scheduled_date: '2026-10-12', is_completed: false }],
    startDate: '2026-10-14', endDate: '2026-10-18',
  })
  assert.deepEqual(items, [])
})

Deno.test('template weeks follow the app: weeks from the Monday of the start week', () => {
  const items = buildStrengthSchedule({
    activePrograms: [{ ...activeProgram, effective_from: '2026-10-07' }], programs: [activeProgram], sessions: [],
    startDate: '2026-10-05', endDate: '2026-11-08',
  })
  // Lunes 5 entra aunque el programa empiece el miércoles 7; la quinta semana ya no existe.
  assert.equal(items[0].date, '2026-10-05')
  assert.equal(items.length, 8)
  assert.equal(items.at(-1)!.date, '2026-10-29')
})

function fixture() {
  const tables: Record<string, any[]> = {
    training_programs: [activeProgram, archivedProgram],
    scheduled_strength_sessions: [
      { id: 's-moved', coach_id: coach, client_id: client, program_id: activeId, day_id: 'day-b', scheduled_date: '2026-10-17', is_completed: true },
      { id: 's-old', coach_id: coach, client_id: client, program_id: archivedId, day_id: 'day-old', scheduled_date: '2026-10-13', is_completed: false },
      { id: 's-foreign', coach_id: coach, client_id: otherClient, program_id: 'program-foreign', day_id: 'day-x', scheduled_date: '2026-10-16', is_completed: false },
    ],
    cardio_sessions: [{ id: 'cardio-1', coach_id: coach, client_id: client, scheduled_date: '2026-10-14', name: 'Rodaje', is_completed: false }],
    client_events: [],
  }
  const queries: any[] = []
  const db = {
    from(table: string) {
      let filtered = [...tables[table] ?? []]
      const filters: any[] = []
      queries.push({ table, filters })
      const query: any = {
        select() { return query }, order() { return query },
        eq(key: string, value: unknown) { filters.push(['eq', key, value]); filtered = filtered.filter((row) => row[key] === value); return query },
        in(key: string, values: unknown[]) { filters.push(['in', key, values]); filtered = filtered.filter((row) => values.includes(row[key])); return query },
        gte(key: string, value: string) { filters.push(['gte', key, value]); filtered = filtered.filter((row) => row[key] >= value); return query },
        lte(key: string, value: string) { filters.push(['lte', key, value]); filtered = filtered.filter((row) => row[key] <= value); return query },
        limit(limit: number) { filtered = filtered.slice(0, limit); return query },
        range(start: number, end: number) { filtered = filtered.slice(start, end + 1); return query },
        then(resolve: any) { return Promise.resolve({ data: filtered, error: null }).then(resolve) },
      }
      return query
    },
  }
  const tools = new Map<string, any>()
  registerScheduleTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async (_db: any, requested?: string) => {
      if (requested && requested !== coach) throw new Error('Sin acceso al espacio')
      return { coachId: coach, timeZone: 'Europe/Madrid' }
    },
    requireClient: async (_db: any, space: string, id: string) => {
      if (space !== coach || (id !== client && id !== otherClient)) throw new Error('Cliente no autorizado')
    },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
  })
  async function run(input: any) {
    const tool = tools.get('list_client_schedule')
    const result = await tool.run(tool.config.inputSchema.parse(input))
    if (result.data) outputSchemas.list_client_schedule.parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, queries }
}

Deno.test('list_client_schedule reads scheduled sessions for the whole weeks of the range, scoped to coach and client', async () => {
  const { run, queries } = fixture()
  const { data } = await run({ client_id: client, start_date: '2026-10-14', end_date: '2026-10-18' })
  const items = strength(data.items)
  assert.deepEqual(items.map((item: any) => [item.date, item.day_id]), [
    ['2026-10-17', 'day-b'],
  ])
  assert.equal(items[0].is_completed, true)
  assert.equal(items[0].original_date, '2026-10-15')
  assert.equal(data.items.some((item: any) => item.session_id === 's-foreign'), false)
  assert.equal(data.items.find((item: any) => item.kind === 'cardio').id, 'cardio-1')

  const sessionQuery = queries.find((query) => query.table === 'scheduled_strength_sessions')
  assert.deepEqual(sessionQuery.filters, [
    ['eq', 'coach_id', coach], ['eq', 'client_id', client],
    ['gte', 'scheduled_date', '2026-10-12'], ['lte', 'scheduled_date', '2026-10-18'],
  ])
})

Deno.test('sessions from archived programs are shown like in the app and keep their status', async () => {
  const { run } = fixture()
  const { data } = await run({ client_id: client, start_date: '2026-10-12', end_date: '2026-10-13' })
  const items = strength(data.items)
  assert.deepEqual(items.map((item: any) => [item.date, item.day_id, item.program_status]), [
    ['2026-10-12', 'day-a', 'active'],
    ['2026-10-13', 'day-old', 'archived'],
  ])
  const old = items[1]
  assert.equal(old.program_name, 'Bloque 1')
  assert.equal(old.extra_session, true)
  assert.equal(old.week, null)
})

Deno.test('list_client_schedule validates the range before touching the database', async () => {
  const { run, queries } = fixture()
  const result = await run({ client_id: client, start_date: '2026-10-18', end_date: '2026-10-12' })
  assert.match(result.error, /rango/)
  assert.equal(queries.length, 0)
})
