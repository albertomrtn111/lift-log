import assert from 'node:assert/strict'
import { registerAgendaTools } from './agenda.ts'
import { outputSchemas } from './output-schemas.ts'
import { registerPrompts } from './prompts.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const ana = '11111111-1111-4111-8111-111111111111'
const bea = '33333333-3333-4333-8333-333333333333'
const foreign = '44444444-4444-4444-8444-444444444444'
const taskOverdue = '55555555-5555-4555-8555-555555555555'
const taskToday = '66666666-6666-4666-8666-666666666666'
const eventId = '77777777-7777-4777-8777-777777777777'
const v1 = '2026-10-10T10:00:00.123456+00:00'
// 23:30 UTC del 15 de octubre: en Madrid ya es día 16.
const now = new Date('2026-10-15T23:30:00Z')

function fixture() {
  const tables: Record<string, any[]> = {
    clients: [
      { id: ana, coach_id: coach, full_name: 'Ana', status: 'active' },
      { id: bea, coach_id: coach, full_name: 'Bea', status: 'inactive' },
    ],
    coach_tasks: [
      { id: taskOverdue, coach_id: coach, client_id: ana, task_date: '2026-10-15', title: 'Llamar a Ana', description: null, status: 'pending', priority: 'high', completed_at: null, created_at: v1, updated_at: v1 },
      { id: taskToday, coach_id: coach, client_id: null, task_date: '2026-10-16', title: 'Preparar plantillas', description: null, status: 'pending', priority: 'normal', completed_at: null, created_at: v1, updated_at: v1 },
      { id: 'task-future', coach_id: coach, client_id: ana, task_date: '2026-10-20', title: 'Futura', description: null, status: 'pending', priority: 'normal', completed_at: null, created_at: v1, updated_at: v1 },
      { id: 'task-done', coach_id: coach, client_id: ana, task_date: '2026-10-01', title: 'Hecha', description: null, status: 'completed', priority: 'normal', completed_at: v1, created_at: v1, updated_at: v1 },
      { id: 'task-other-coach', coach_id: foreign, client_id: null, task_date: '2026-10-01', title: 'Ajena', description: null, status: 'pending', priority: 'normal', completed_at: null, created_at: v1, updated_at: v1 },
    ],
    client_events: [
      { id: eventId, coach_id: coach, client_id: ana, title: 'Maratón de Valencia', event_date: '2026-12-06', event_type: 'race', status: 'planned', priority: 'a', location: 'Valencia', target: 'Sub 3:30', notes: null, created_at: v1, updated_at: v1 },
    ],
    checkins: [
      { id: 'checkin-draft', coach_id: coach, client_id: ana, type: 'checkin', status: 'reviewed', submitted_at: '2026-10-14T08:00:00Z', energy: 3 },
      { id: 'checkin-none', coach_id: coach, client_id: ana, type: 'checkin', status: 'reviewed', submitted_at: '2026-10-15T08:00:00Z' },
      { id: 'checkin-approved', coach_id: coach, client_id: ana, type: 'checkin', status: 'reviewed', submitted_at: '2026-10-13T08:00:00Z' },
      { id: 'checkin-archived', coach_id: coach, client_id: ana, type: 'checkin', status: 'archived', submitted_at: '2026-10-12T08:00:00Z' },
      { id: 'checkin-inactive', coach_id: coach, client_id: bea, type: 'checkin', status: 'reviewed', submitted_at: '2026-10-11T08:00:00Z' },
    ],
    reviews: [
      { id: 'review-draft', coach_id: coach, checkin_id: 'checkin-draft', status: 'draft', ai_status: 'completed', message_to_client: 'Buen trabajo' },
      { id: 'review-approved', coach_id: coach, checkin_id: 'checkin-approved', status: 'approved', ai_status: 'completed', message_to_client: 'Hecho' },
    ],
    strava_activities: [
      { id: 'strava-free', coach_id: coach, client_id: ana, is_deleted: false, cardio_session_id: null, matched_planned_session_id: null, start_date: '2026-10-14T07:00:00Z', name: 'Rodaje', feedback_status: 'pending' },
      { id: 'strava-linked', coach_id: coach, client_id: ana, is_deleted: false, cardio_session_id: 'cardio-1', matched_planned_session_id: null, start_date: '2026-10-14T07:00:00Z', name: 'Series' },
      { id: 'strava-deleted', coach_id: coach, client_id: ana, is_deleted: true, cardio_session_id: null, matched_planned_session_id: null, start_date: '2026-10-14T07:00:00Z', name: 'Borrada' },
      { id: 'strava-old', coach_id: coach, client_id: ana, is_deleted: false, cardio_session_id: null, matched_planned_session_id: null, start_date: '2026-09-01T07:00:00Z', name: 'Antigua' },
    ],
  }
  const writes: any[] = []
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let insert: any = null, update: any = null, limit = Infinity, start = 0
      const query: any = {
        select() { return query }, order() { return query },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query },
        is(key: string, value: unknown) { filters.push((row) => (row[key] ?? null) === value); return query },
        not(key: string, _op: string, value: unknown) { filters.push((row) => (row[key] ?? null) !== value); return query },
        gte(key: string, value: string) { filters.push((row) => row[key] >= value); return query },
        lte(key: string, value: string) { filters.push((row) => row[key] <= value); return query },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query },
        limit(value: number) { limit = value; return query },
        range(from: number, to: number) { start = from; limit = to - from + 1; return query },
        insert(value: any) { insert = value; return query },
        update(value: any) { update = value; return query },
        execute() {
          if (insert) {
            const row = { id: 'new-event', created_at: v1, updated_at: v1, ...insert }
            tables[table].push(row); writes.push({ table, insert })
            return [row]
          }
          const matched = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
          if (update) {
            for (const row of matched) Object.assign(row, update)
            if (matched.length) writes.push({ table, update })
          }
          return matched.slice(start, start + limit).map((row) => ({ ...row }))
        },
        maybeSingle() { return Promise.resolve({ data: query.execute()[0] ?? null, error: null }) },
        single() { const data = query.execute()[0]; return Promise.resolve({ data: data ?? null, error: data ? null : { message: 'none' } }) },
        then(resolve: any) { return Promise.resolve({ data: query.execute(), error: null }).then(resolve) },
      }
      return query
    },
  }
  const tools = new Map<string, any>()
  registerAgendaTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async (_db: any, requested?: string) => {
      if (requested && requested !== coach) throw new Error('Sin acceso al espacio')
      return { coachId: coach, timeZone: 'Europe/Madrid' }
    },
    requireClient: async (_db: any, space: string, id: string) => { if (space !== coach || ![ana, bea].includes(id)) throw new Error('Cliente no encontrado en el espacio del entrenador.') },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => now,
  })
  async function run(name: string, input: any) {
    const tool = tools.get(name)
    const result = await tool.run(tool.config.inputSchema.parse(input))
    if (result.data) outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, tables, writes, tools }
}

Deno.test('list_coach_tasks returns pending tasks of the workspace with overdue in the Madrid day', async () => {
  const { run } = fixture()
  const { data } = await run('list_coach_tasks', {})
  assert.equal(data.today, '2026-10-16')
  assert.deepEqual(data.tasks.map((task: any) => [task.id, task.overdue, task.client_name]), [
    [taskOverdue, true, 'Ana'], [taskToday, false, null], ['task-future', false, 'Ana'],
  ])
  assert.equal(data.tasks[0].updated_at, v1)
  const done = await run('list_coach_tasks', { status: 'completed' })
  assert.deepEqual(done.data.tasks.map((task: any) => task.id), ['task-done'])
  const paged = await run('list_coach_tasks', { limit: 2 })
  assert.equal(paged.data.has_more, true)
  assert.equal(paged.data.next_offset, 2)
})

Deno.test('update_coach_task completes, reopens and edits only with the current version', async () => {
  const { run, tables, writes } = fixture()
  const completed = await run('update_coach_task', { task_id: taskOverdue, expected_updated_at: v1, status: 'completed' })
  assert.equal(completed.data.task.status, 'completed')
  assert.ok(completed.data.task.completed_at)
  assert.equal(completed.data.task.title, 'Llamar a Ana')

  const stale = await run('update_coach_task', { task_id: taskOverdue, expected_updated_at: v1, title: 'Otro' })
  assert.match(stale.error, /cambió/)
  assert.equal(tables.coach_tasks[0].title, 'Llamar a Ana')
  assert.equal(writes.length, 1)

  const version = completed.data.task.updated_at
  const reopened = await run('update_coach_task', { task_id: taskOverdue, expected_updated_at: version, status: 'pending', task_date: '2026-10-20', description: '  ' })
  assert.equal(reopened.data.task.status, 'pending')
  assert.equal(reopened.data.task.completed_at, null)
  assert.equal(reopened.data.task.task_date, '2026-10-20')
  assert.equal(reopened.data.task.description, null)
})

Deno.test('update_coach_task cannot touch another workspace or link a foreign client', async () => {
  const { run, writes } = fixture()
  const other = await run('update_coach_task', { task_id: '88888888-8888-4888-8888-888888888888', expected_updated_at: v1, status: 'completed' })
  assert.match(other.error, /no encontrada/)
  const linked = await run('update_coach_task', { task_id: taskToday, expected_updated_at: v1, client_id: foreign })
  assert.match(linked.error, /Cliente no encontrado/)
  assert.equal(writes.length, 0)
  assert.throws(() => fixture().tools.get('update_coach_task').config.inputSchema.parse({ task_id: taskToday, expected_updated_at: v1, unknown: 1 }))
})

Deno.test('create_client_event applies the app defaults and blank texts become null', async () => {
  const { run, writes } = fixture()
  const { data } = await run('create_client_event', { client_id: ana, title: '10K de Madrid', event_date: '2026-11-15', notes: '  ', target: 'Sub 45' })
  assert.equal(data.created, true)
  assert.deepEqual(writes[0].insert, {
    coach_id: coach, client_id: ana, title: '10K de Madrid', event_date: '2026-11-15', event_type: 'race', status: 'planned', priority: 'b',
    location: null, target: 'Sub 45', notes: null,
  })
  assert.throws(() => fixture().tools.get('create_client_event').config.inputSchema.parse({ client_id: ana, title: 'X', event_date: '2026-11-15', event_type: 'marathon' }))
  const foreignClient = await run('create_client_event', { client_id: foreign, title: 'X', event_date: '2026-11-15' })
  assert.match(foreignClient.error, /Cliente no encontrado/)
})

Deno.test('update_client_event keeps omitted fields and rejects stale versions', async () => {
  const { run, tables } = fixture()
  const { data } = await run('update_client_event', { client_id: ana, event_id: eventId, expected_updated_at: v1, event_date: '2026-12-07', notes: 'Cambio de fecha' })
  assert.equal(data.event.event_date, '2026-12-07')
  assert.equal(data.event.target, 'Sub 3:30')
  assert.equal(data.event.priority, 'a')
  const stale = await run('update_client_event', { client_id: ana, event_id: eventId, expected_updated_at: v1, status: 'cancelled' })
  assert.match(stale.error, /cambió/)
  assert.equal(tables.client_events[0].status, 'planned')
  const otherClient = await run('update_client_event', { client_id: bea, event_id: eventId, expected_updated_at: data.event.updated_at, status: 'cancelled' })
  assert.match(otherClient.error, /no encontrado/)
})

Deno.test('get_coach_inbox gathers checkins to review, unlinked Strava activities and due tasks of active clients', async () => {
  const { run } = fixture()
  const { data } = await run('get_coach_inbox', {})
  assert.equal(data.today, '2026-10-16')
  assert.deepEqual(data.checkins_to_review.items.map((item: any) => [item.id, item.review_status, item.has_draft_message]), [
    ['checkin-draft', 'draft', true],
    ['checkin-none', null, false],
  ])
  assert.equal(data.checkins_to_review.items[0].client_name, 'Ana')
  assert.equal(data.unlinked_strava_activities.since, '2026-09-25')
  assert.deepEqual(data.unlinked_strava_activities.items.map((item: any) => item.id), ['strava-free'])
  assert.deepEqual(data.pending_tasks.items.map((item: any) => [item.id, item.overdue]), [[taskOverdue, true], [taskToday, false]])

  const short = await run('get_coach_inbox', { limit: 1 })
  assert.equal(short.data.checkins_to_review.items.length, 1)
  assert.equal(short.data.checkins_to_review.has_more, true)
})

Deno.test('prompts guide the model through the tools without writing data', () => {
  const prompts = new Map<string, any>()
  registerPrompts({ registerPrompt: (name: string, config: any, build: any) => prompts.set(name, { config, build }) })
  assert.deepEqual([...prompts.keys()], ['revision_semanal', 'preparar_bloque_siguiente', 'planificar_temporada', 'bandeja_del_dia'])

  const review = prompts.get('revision_semanal')
  const reviewText = review.build(review.config.argsSchema.parse({ cliente: 'Ana' })).messages[0].content.text
  for (const tool of ['list_clients', 'get_checkins', 'get_client_overview', 'get_strength_results', 'get_cardio_results']) assert.match(reviewText, new RegExp(tool))
  assert.match(reviewText, /«Ana»/)
  assert.match(reviewText, /sin mi confirmación/)

  const block = prompts.get('preparar_bloque_siguiente')
  const blockText = block.build(block.config.argsSchema.parse({ cliente: 'Ana', semanas: '6' })).messages[0].content.text
  assert.match(blockText, /6 semanas/)
  assert.match(blockText, /status draft/)
  assert.match(blockText, /list_exercise_catalog/)
  assert.throws(() => block.config.argsSchema.parse({ cliente: 'Ana', semanas: 'seis' }))

  const season = prompts.get('planificar_temporada')
  const seasonText = season.build(season.config.argsSchema.parse({ cliente: 'Ana', semanas: '20' })).messages[0].content.text
  for (const tool of ['get_season_plan', 'create_season_plan', 'dry_run', 'get_cardio_results', 'replace_active']) assert.match(seasonText, new RegExp(tool))
  assert.match(seasonText, /20 semanas/)
  assert.match(seasonText, /Espera mi confirmación/)

  const inbox = prompts.get('bandeja_del_dia')
  assert.match(inbox.build({}).messages[0].content.text, /get_coach_inbox/)
})
