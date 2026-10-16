import assert from 'node:assert/strict'
import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.3.0'
import { registerCardioTools } from './cardio.ts'
import { registerClientTools } from './clients.ts'
import { registerHistoryTools } from './history.ts'
import { registerNutritionTools } from './nutrition.ts'
import { outputSchemas, withOutputSchemas } from './output-schemas.ts'
import { registerScheduleTools } from './schedule.ts'
import { jsonResult, type ToolHelpers, toolError } from './shared.ts'

// Comprueba con el SDK real lo que las demás pruebas simulan: los esquemas se publican
// en tools/list y el resultado de tools/call lleva structuredContent validado.
const coach = '22222222-2222-4222-8222-222222222222'
const clients = [{ id: '11111111-1111-4111-8111-111111111111', full_name: 'Ana', status: 'active', start_date: '2026-01-01', next_checkin_date: '2026-10-15', checkin_frequency_days: 7 }]

const db = {
  from() {
    const query: any = {
      select() { return query }, order() { return query }, eq() { return query }, ilike() { return query }, range() { return query },
      then(resolve: any) { return Promise.resolve({ data: clients, error: null }).then(resolve) },
    }
    return query
  },
  rpc: () => Promise.resolve({ data: [], error: null }),
}
const helpers: ToolHelpers = {
  resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
  requireClient: async () => ({}),
  jsonResult, toolError, audit() {},
  now: () => new Date('2026-10-15T23:30:00Z'),
}

function server() {
  const instance = withOutputSchemas(new McpServer({ name: 'nexttrain-test', version: '0.0.0' }))
  registerClientTools(instance, db, helpers)
  registerScheduleTools(instance, db, helpers)
  registerHistoryTools(instance, db, helpers)
  registerNutritionTools(instance, db, helpers)
  registerCardioTools(instance, db, helpers)
  return instance
}

async function call(method: string, params: Record<string, unknown>) {
  const handler = createMcpHandler(server)
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }))
  const body = await response.text()
  const json = body.trim().startsWith('{') ? body : body.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('')
  const message = JSON.parse(json)
  if (message.error) throw new Error(JSON.stringify(message.error))
  return message.result
}

Deno.test('tools/list publishes an object outputSchema for every tool', async () => {
  const { tools } = await call('tools/list', {})
  const withoutSchema = tools.filter((tool: any) => tool.outputSchema?.type !== 'object').map((tool: any) => tool.name)
  assert.deepEqual(withoutSchema, [])
  // Las herramientas de index.ts no se registran aquí; el resto debe estar completo.
  const indexTools = ['who_am_i', 'get_client_overview', 'get_athlete_goal', 'set_athlete_goal', 'create_strength_program', 'create_coach_task']
  assert.equal(tools.length, Object.keys(outputSchemas).length - indexTools.length)
})

Deno.test('tools/call returns structuredContent together with the compact text', async () => {
  const result = await call('tools/call', { name: 'list_clients', arguments: {} })
  assert.equal(result.isError, undefined)
  assert.equal(result.structuredContent.today, '2026-10-16')
  assert.deepEqual(result.structuredContent.clients[0].attention_flags, ['sin_checkin', 'checkin_atrasado'])
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent)
})
