import assert from 'node:assert/strict'
import { outputSchemas, withOutputSchemas } from './output-schemas.ts'
import { jsonResult } from './shared.ts'

const moduleFiles = ['index.ts', 'clients.ts', 'schedule.ts', 'history.ts', 'nutrition.ts', 'cardio.ts']

Deno.test('every registered tool declares an output schema', async () => {
  const names: string[] = []
  for (const file of moduleFiles) {
    const source = await Deno.readTextFile(new URL(`./${file}`, import.meta.url))
    for (const match of source.matchAll(/registerTool\(\s*'([a-z_]+)'/g)) names.push(match[1])
  }
  assert.ok(names.length >= 28)
  assert.deepEqual(names.filter((name) => !outputSchemas[name]), [])
  assert.deepEqual(Object.keys(outputSchemas).filter((name) => !names.includes(name)), [])
})

Deno.test('jsonResult returns compact text and the same data as structuredContent', () => {
  const result = jsonResult({ a: 1, skipped: undefined, when: new Date('2026-10-16T00:00:00Z'), list: [{ b: null }] })
  assert.equal(result.content[0].text, '{"a":1,"when":"2026-10-16T00:00:00.000Z","list":[{"b":null}]}')
  assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text))
})

Deno.test('withOutputSchemas adds the schema without replacing an explicit one', () => {
  const seen = new Map<string, any>()
  const server = withOutputSchemas({ registerTool(name: string, config: any, _handler: unknown) { seen.set(name, config) } })
  const own = outputSchemas.who_am_i
  server.registerTool('list_clients', { title: 'x' }, () => {})
  server.registerTool('create_coach_task', { title: 'y', outputSchema: own }, () => {})
  server.registerTool('unknown_tool', { title: 'z' }, () => {})
  assert.equal(seen.get('list_clients').outputSchema, outputSchemas.list_clients)
  assert.equal(seen.get('create_coach_task').outputSchema, own)
  assert.equal('outputSchema' in seen.get('unknown_tool'), false)
})

Deno.test('schemas accept extra nested fields but reject a wrong top-level shape', () => {
  const schema = outputSchemas.list_clients
  assert.equal(schema.safeParse({ coach_id: 'c', today: '2026-10-16', clients: [{ id: 'x', new_column: 1 }], has_more: false, next_offset: null, extra: true }).success, true)
  assert.equal(schema.safeParse({ coach_id: 'c', today: '2026-10-16', clients: 'no', has_more: false, next_offset: null }).success, false)
})
