import { assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { outputSchemas } from './output-schemas.ts'
import { jsonResult, toolError } from './shared.ts'
import { exerciseFields, registerStudioTools, sessionDetail, sessionSummary, studioError } from './studio.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const session = '33333333-3333-4333-8333-333333333333'
const exercise = '44444444-4444-4444-8444-444444444444'

function chain(result: unknown) {
  const query: any = {
    select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query, gte: () => query, lte: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return query
}

function fakeServer(rpc: (name: string, args: any) => unknown, tables: Record<string, unknown> = {}) {
  const tools = new Map<string, any>()
  const server = { registerTool: (name: string, config: any, handler: any) => tools.set(name, { config, handler }) }
  const db = {
    rpc: (name: string, args: any) => Promise.resolve(rpc(name, args)),
    from: (table: string) => chain(tables[table] ?? { data: [], error: null }),
  }
  registerStudioTools(server, db, {
    resolveCoach: () => Promise.resolve({ coachId: coach }),
    requireClient: () => Promise.resolve({ id: client }),
    jsonResult,
    toolError,
    audit: () => {},
  })
  return async (name: string, input: Record<string, unknown>) => {
    const tool = tools.get(name)
    const result = await tool.handler(tool.config.inputSchema.parse(input))
    if (result.isError) throw new Error(result.content[0].text)
    const data = JSON.parse(result.content[0].text)
    outputSchemas[name].parse(data)
    return data
  }
}

const resolver = (name: string) => (name === 'resolve_catalog_exercise' ? { data: { id: exercise, name: 'Press' }, error: null } : null)

Deno.test('el resumen cuenta los ejercicios y los hechos de cada sesión', () => {
  const summary = sessionSummary({ id: 's', session_date: '2026-11-05', version: 3, status: 'done' }, [
    { session_id: 's', is_done: true }, { session_id: 's', is_done: false }, { session_id: 'otra', is_done: true },
  ])
  assertEquals([summary.exercises, summary.exercises_done, summary.version], [2, 1, 3])
})

Deno.test('la sesión completa pone cada ejercicio en su subbloque y en su orden', () => {
  const detail = sessionDetail(
    { id: 's', client_id: 'c', session_date: '2026-11-05', version: 1 },
    [{ id: 'x', title: 'Fuerza', sort_order: 10 }],
    [
      { id: 'b', sort_order: 20, section_id: 'x', exercise_catalog: { name: 'Remo' }, is_done: false, version: 1 },
      { id: 'a', sort_order: 10, section_id: null, exercise_catalog: { name: 'Press' }, is_done: true, version: 2 },
    ],
    [{ item_id: 'a', set_index: 2, load_kg: 40 }, { item_id: 'a', set_index: 1, load_kg: 35 }],
    new Map([['a', ['barra']]]),
  )
  assertEquals(detail.exercises.map((item) => item.item_id), ['a', 'b'])
  assertEquals(detail.exercises[1].section, 'Fuerza')
  assertEquals(detail.exercises[0].tags, ['barra'])
  assertEquals(detail.exercises[0].performed_sets, [{ set_index: 1, load_kg: 35 }, { set_index: 2, load_kg: 40 }])
})

Deno.test('los campos llevan el ejercicio resuelto y el subbloque por su título', () => {
  assertEquals(exerciseFields({ name: 'press', section: 'Fuerza', sets: 3 }, 'id'), { sets: 3, catalog_exercise_id: 'id', section_title: 'Fuerza' })
  assertEquals(exerciseFields({ catalog_exercise_id: 'viejo', sets: 3 }, 'id'), { sets: 3, catalog_exercise_id: 'id' })
})

Deno.test('un conflicto de versión dice cómo seguir', () => {
  assertMatch(studioError({ code: 'NT409' }, 'x').message, /get_studio_session/)
  assertEquals(studioError({ code: '22023', message: 'Ese subbloque no es de esta sesión.' }, 'x').message, 'Ese subbloque no es de esta sesión.')
  assertEquals(studioError({ code: 'XX000', message: 'interno' }, 'x').message, 'x')
})

Deno.test('dry_run comprueba los ejercicios sin escribir', async () => {
  const calls: string[] = []
  const run = fakeServer((name) => {
    calls.push(name)
    return resolver(name)
  })
  const result = await run('create_studio_session', {
    client_id: client, session_date: '2026-11-05', dry_run: true, exercises: [{ name: 'press' }],
  })
  assertEquals(result.dry_run, true)
  assertEquals(calls, ['resolve_catalog_exercise'])
})

Deno.test('crear la sesión y sus ejercicios comparte lote', async () => {
  const batches: string[] = []
  const run = fakeServer((name, args) => {
    if (args.p_batch_id) batches.push(args.p_batch_id)
    if (name === 'studio_create_session') {
      return { data: { id: session, session_date: '2026-11-05', status: 'planned', version: 1 }, error: null }
    }
    if (name === 'studio_add_items') return { data: 1, error: null }
    return resolver(name)
  })
  const result = await run('create_studio_session', {
    client_id: client, session_date: '2026-11-05', exercises: [{ name: 'press', sets: 3, section: 'Fuerza' }],
  })
  assertEquals(result.exercises, 1)
  assertEquals(batches.length, 2)
  assertEquals(batches[0], batches[1])
})

Deno.test('un ejercicio que no está en el catálogo para antes de crear nada', async () => {
  const calls: string[] = []
  const run = fakeServer((name) => {
    calls.push(name)
    return { data: null, error: null }
  })
  let message = ''
  try {
    await run('create_studio_session', { client_id: client, session_date: '2026-11-05', exercises: [{ name: 'inventado' }] })
  } catch (error) {
    message = (error as Error).message
  }
  assertMatch(message, /inventado/)
  assertEquals(calls, ['resolve_catalog_exercise'])
})

Deno.test('cambiar exige la versión y avisa del conflicto', async () => {
  const run = fakeServer(
    (name) => (name === 'studio_update_session' ? { data: null, error: { code: 'NT409' } } : null),
    { studio_sessions: { data: { id: session, coach_id: coach }, error: null } },
  )
  let message = ''
  try {
    await run('update_studio_session', { session_id: session, version: 1, changes: { name: 'Otra' } })
  } catch (error) {
    message = (error as Error).message
  }
  assertMatch(message, /Otra persona/)
})

Deno.test('registrar sin series marca como realizado, y con series las guarda', async () => {
  const calls: string[] = []
  const run = fakeServer(
    (name) => {
      calls.push(name)
      return { data: { id: exercise, is_done: true, version: 3 }, error: null }
    },
    { studio_session_items: { data: { id: exercise }, error: null } },
  )
  await run('record_studio_sets', { item_id: exercise, version: 2 })
  await run('record_studio_sets', { item_id: exercise, version: 3, sets: [{ load_kg: 40, reps: 10 }] })
  assertEquals(calls, ['studio_set_item_done', 'studio_save_sets'])
})
