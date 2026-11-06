import { assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1'
import { outputSchemas } from './output-schemas.ts'
import { jsonResult, toolError } from './shared.ts'
import { mediaEntry, registerStudioReportTools } from './studio-reports.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const session = '33333333-3333-4333-8333-333333333333'
const exercise = '44444444-4444-4444-8444-444444444444'

function chain(result: unknown) {
  const query: any = {
    select: () => query, eq: () => query, in: () => query, neq: () => query, or: () => query, is: () => query, order: () => query,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return query
}

function tools(rpc: (name: string, args: any) => unknown, tables: Record<string, unknown> = {}) {
  const registered = new Map<string, any>()
  const db = {
    rpc: (name: string, args: any) => Promise.resolve(rpc(name, args)),
    from: (table: string) => chain(tables[table] ?? { data: [], error: null }),
  }
  registerStudioReportTools({ registerTool: (name: string, config: any, handler: any) => registered.set(name, { config, handler }) }, db, {
    resolveCoach: () => Promise.resolve({ coachId: coach }),
    requireClient: () => Promise.resolve({ id: client }),
    jsonResult,
    toolError,
    audit: () => {},
  })
  return async (name: string, input: Record<string, unknown>) => {
    const tool = registered.get(name)
    const result = await tool.handler(tool.config.inputSchema.parse(input))
    if (result.isError) throw new Error(result.content[0].text)
    const data = JSON.parse(result.content[0].text)
    outputSchemas[name].parse(data)
    return data
  }
}

Deno.test('de un archivo privado no sale ninguna dirección', () => {
  const entry = mediaEntry({ id: 'm', kind: 'video', client_id: client, url: null, storage_key: 'secreto', video: { title: 'Bajada', duration_seconds: 30 } })
  assertEquals(entry, { id: 'm', kind: 'video', scope: 'client', client_id: client, title: 'Bajada', url: null, duration_seconds: 30 })
  assertEquals(JSON.stringify(entry).includes('secreto'), false)
})

Deno.test('un enlace que no es https ni llega a la base de datos', async () => {
  const call = tools(() => { throw new Error('no debería llamarse') })
  await assertRejects(() => call('attach_exercise_link', { catalog_exercise_id: exercise, url: 'javascript:alert(1)' }), Error, 'https')
})

Deno.test('attach_exercise_link distingue YouTube y deja el enlace para toda la sala', async () => {
  const calls: any[] = []
  const call = tools((name, args) => {
    calls.push([name, args])
    return { data: { id: 'm', kind: args.p_kind, client_id: null, url: args.p_url, title: 'Técnica' }, error: null }
  })
  const result = await call('attach_exercise_link', { catalog_exercise_id: exercise, url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Técnica' })
  assertEquals(result.media.kind, 'youtube')
  assertEquals(result.media.scope, 'room')
  assertEquals(calls.find(([name]) => name === 'studio_add_exercise_media')[1].p_client_id, null)
})

Deno.test('create_session_report guarda la foto de la sesión y devuelve el enlace', async () => {
  const calls: any[] = []
  const call = tools((name, args) => {
    calls.push([name, args])
    return { data: { id: 'r', code: 'abc' }, error: null }
  }, {
    studio_sessions: { data: [{ id: session, client_id: client, group_id: null, session_date: '2026-11-05', status: 'done', rpe: 7, duration_min: 50, training_groups: null }], error: null },
    studio_session_items: { data: [{
      id: 'i', session_id: session, section_id: null, sort_order: 1, catalog_exercise_id: exercise, sets: 3, reps: '8', load_kg: 20, next_load: null, is_done: true,
      exercise_catalog: { name: 'Press' }, studio_item_tags: [{ studio_tags: { name: 'barra' } }],
    }], error: null },
    clients: { data: { full_name: 'Ana Ruiz', report_consent_at: '2026-11-01' }, error: null },
  })
  const result = await call('create_session_report', { session_id: session, client_id: client })
  assertMatch(result.url, /\/informe\/abc$/)
  assertEquals(result.consent, true)
  const snapshot = calls[0][1].p_snapshot
  assertEquals(snapshot.client, 'Ana Ruiz')
  assertEquals(snapshot.groups[0].exercises[0].name, 'Press')
  assertEquals(snapshot.groups[0].exercises[0].tags, ['barra'])
})

Deno.test('create_session_report rechaza a quien no está en la sesión', async () => {
  const call = tools(() => ({ data: { id: 'r', code: 'abc' }, error: null }), { studio_sessions: { data: [], error: null } })
  await assertRejects(() => call('create_session_report', { session_id: session, client_id: client }), Error, 'no está en esa sesión')
})

Deno.test('send_session_report prepara el WhatsApp con el texto de la sala', async () => {
  const calls: any[] = []
  const call = tools((name, args) => {
    calls.push([name, args])
    return { data: null, error: null }
  }, {
    session_reports: { data: { id: 'r', code: 'abc', revoked_at: null, snapshot: { client: 'Ana' } }, error: null },
    clients: { data: { full_name: 'Ana Ruiz', phone: '600123456' }, error: null },
    report_settings: { data: { whatsapp_text: 'Toma, {nombre}' }, error: null },
    workspace_branding: { data: { display_name: 'ClubØ' }, error: null },
  })
  const result = await call('send_session_report', { session_id: session, client_id: client, channel: 'whatsapp' })
  assertMatch(result.url, /^https:\/\/wa\.me\/34600123456\?text=Toma%2C%20Ana/)
  assertEquals(calls[0][0], 'studio_record_delivery')
  assertEquals(calls[0][1].p_channel, 'whatsapp')
})

Deno.test('send_session_report pide crear antes el informe, y respeta el consentimiento', async () => {
  const empty = tools(() => ({ data: null, error: null }), { session_reports: { data: { id: 'r', code: 'abc', revoked_at: null, snapshot: {} }, error: null } })
  await assertRejects(() => empty('send_session_report', { session_id: session, client_id: client, channel: 'link' }), Error, 'create_session_report')

  const refused = tools(() => ({ data: null, error: { code: '22023', message: 'Falta el consentimiento del cliente para enviarle informes.' } }), {
    session_reports: { data: { id: 'r', code: 'abc', revoked_at: null, snapshot: { client: 'Ana' } }, error: null },
  })
  await assertRejects(() => refused('send_session_report', { session_id: session, client_id: client, channel: 'link' }), Error, 'consentimiento')
})

Deno.test('list_pending_reports devuelve lo que falta por enviar hoy', async () => {
  const call = tools(() => null, {
    studio_sessions: { data: [{ id: session, client_id: client, group_id: null, clients: { full_name: 'Ana' }, session_date: '2099-01-01', start_time: null, duration_min: null, session_reports: [] }], error: null },
    report_settings: { data: { notice_hours: 3 }, error: null },
  })
  const result = await call('list_pending_reports', {})
  assertEquals(result.reports, [{ session_id: session, client_id: client, group_id: null, name: 'Ana' }])
})
