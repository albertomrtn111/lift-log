import { assert, assertEquals } from 'jsr:@std/assert@1'
import { buildCatalogView, registerLibraryTools, rolePermissions } from './library.ts'
import { jsonResult, toolError } from './shared.ts'

const exercises = [
  { id: 'a', name: 'Press de banca plano con barra', primary_group: 'Pecho', block_key: 'empuje_horizontal', equipment: ['barra'], laterality: 'bilateral', metrics: ['kg', 'reps'] },
  { id: 'b', name: 'Curl martillo con mancuernas', primary_group: 'Bíceps', block_key: 'biceps', equipment: ['mancuerna'], laterality: 'bilateral', metrics: ['kg', 'reps'] },
]
const blocks = [{ key: 'empuje_horizontal', name: 'Empuje horizontal' }, { key: 'biceps', name: 'Bíceps' }]

Deno.test('los permisos dependen del rol', () => {
  assertEquals(rolePermissions('admin').can_manage_library, true)
  assertEquals(rolePermissions('admin').can_manage_plan, false)
  assertEquals(rolePermissions('owner').can_manage_plan, true)
  assertEquals(rolePermissions('coach').can_manage_team, false)
  assertEquals(rolePermissions('coach').can_add_to_library, true)
})

Deno.test('el catálogo trae el bloque y el nombre del espacio', () => {
  const view = buildCatalogView(exercises, blocks, [{ block_key: 'biceps', display_name: 'Brazos' }], [{ catalog_exercise_id: 'a', short_name: 'Banca' }], [])
  assertEquals(view[0].block, 'Empuje horizontal')
  assertEquals(view[0].workspace_name, 'Banca')
  assertEquals(view[0].in_library, true)
  assertEquals(view[1].block, 'Brazos')
  assertEquals(view[1].in_library, false)
  assert(!('workspace_name' in view[1]))
})

Deno.test('busca por nombre del espacio, bloque, material y alias', () => {
  const entries = [{ catalog_exercise_id: 'a', short_name: 'Banca' }]
  const aliases = [{ alias_key: 'martillo', catalog_exercise_id: 'b' }]
  const ids = (search: string) => buildCatalogView(exercises, blocks, [], entries, aliases, { search }).map((row) => row.id)
  assertEquals(ids('banca'), ['a'])
  assertEquals(ids('BÍCEPS'), ['b'])
  assertEquals(ids('mancuerna'), ['b'])
  assertEquals(ids('martillo'), ['b'])
})

Deno.test('filtra por bloque, grupo y biblioteca', () => {
  const view = (filters: Record<string, unknown>) => buildCatalogView(exercises, blocks, [], [{ catalog_exercise_id: 'a' }], [], filters).map((row) => row.id)
  assertEquals(view({ block: 'empuje' }), ['a'])
  assertEquals(view({ primaryGroup: 'biceps' }), ['b'])
  assertEquals(view({ onlyLibrary: true }), ['a'])
})

function fakeServer(db: unknown) {
  const tools = new Map<string, (input: any) => any>()
  registerLibraryTools({ registerTool: (name: string, _config: unknown, handler: (input: any) => any) => tools.set(name, handler) }, db, {
    resolveCoach: () => Promise.resolve({ coachId: 'space' }),
    requireClient: () => Promise.resolve({}),
    jsonResult,
    toolError,
    audit: () => {},
  })
  return tools
}

function fakeDb(existing: unknown, resolved: unknown) {
  const upserts: unknown[] = []
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: existing, error: null }),
    upsert: (row: unknown) => {
      upserts.push(row)
      return Promise.resolve({ error: null })
    },
  }
  return {
    upserts,
    from: () => query,
    rpc: () => Promise.resolve({ data: resolved, error: null }),
  }
}

Deno.test('add_to_library añade una vez y no cambia lo que ya estaba', async () => {
  const fresh = fakeDb(null, { id: 'a', name: 'Press' })
  const added = await fakeServer(fresh).get('add_to_library')!({ name: 'press' })
  assertEquals(added.structuredContent.added, true)
  assertEquals(fresh.upserts, [{ coach_id: 'space', catalog_exercise_id: 'a' }])

  const already = fakeDb({ id: 'entry' }, { id: 'a', name: 'Press' })
  const repeated = await fakeServer(already).get('add_to_library')!({ catalog_exercise_id: 'a' })
  assertEquals(repeated.structuredContent.added, false)
  assertEquals(already.upserts, [])
})

Deno.test('add_to_library explica si el ejercicio no existe', async () => {
  const result = await fakeServer(fakeDb(null, { id: null })).get('add_to_library')!({ name: 'no existe' })
  assertEquals(result.isError, true)
  assert(result.content[0].text.includes('list_exercise_catalog'))
})
