import assert from 'node:assert/strict'
import { registerNutritionTools } from './nutrition.ts'
import { outputSchemas } from './output-schemas.ts'

const clientId = '11111111-1111-4111-8111-111111111111'
const coachId = '22222222-2222-4222-8222-222222222222'
const planId = '33333333-3333-4333-8333-333333333333'
const foodId = '44444444-4444-4444-8444-444444444444'
const mealId = '55555555-5555-4555-8555-555555555555'
const optionId = '66666666-6666-4666-8666-666666666666'
const timestamp = '2026-10-12T10:00:00.123456+00:00'

function fixture() {
  const tables: Record<string, any[]> = {
    macro_plans: [{ id: planId, coach_id: coachId, client_id: clientId, kcal: 2380, protein_g: 160, carbs_g: 300, fat_g: 60,
      effective_from: '2026-10-01', effective_to: null, created_at: timestamp,
      day_type_config: JSON.stringify({ training: { kcal: 2380, protein_g: 160, carbs_g: 300, fat_g: 60 }, rest: { kcal: 1980, protein_g: 160, carbs_g: 200, fat_g: 60 } }) }],
    diet_plans: [{ id: planId, coach_id: coachId, client_id: clientId, name: 'Dieta', status: 'active', type: 'options', effective_from: '2026-10-01', effective_to: null, created_at: timestamp, updated_at: timestamp }],
    diet_meals: [{ id: mealId, diet_plan_id: planId, coach_id: coachId, client_id: clientId, name: 'Comida', day_type: 'training', order_index: 0 }],
    diet_meal_options: [{ id: optionId, meal_id: mealId, coach_id: coachId, client_id: clientId, title: 'Arroz', order_index: 0 }],
    diet_meal_items: [{ id: foodId, option_id: optionId, coach_id: coachId, client_id: clientId, food_name: 'Arroz', quantity: 100, unit: 'g', quantity_g: 100, order_index: 0,
      food_id: foodId, food: { id: foodId, name: 'Arroz', serving_size_g: 100, kcal: 360, protein_g: 7, carbs_g: 80, fat_g: 1 } }],
    foods: [{ id: foodId, name: 'Arroz', serving_size_g: 100, kcal: 360, protein_g: 7, carbs_g: 80, fat_g: 1 }],
  }
  const calls: any[] = []
  const updates: any[] = []
  const db = {
    from(table: string) {
      let filtered = [...tables[table] ?? []]
      const query: any = {
        select() { return query }, order() { return query },
        eq(key: string, value: unknown) { filtered = filtered.filter(row => row[key] === value); return query },
        in(key: string, values: unknown[]) { filtered = filtered.filter(row => values.includes(row[key])); return query },
        lte(key: string, value: string) { filtered = filtered.filter(row => row[key] <= value); return query },
        or() { return query }, ilike() { return query },
        update(values: any) { updates.push({ table, values }); query.then = (resolve: any) => {
          filtered.forEach(row => Object.assign(row, values)); return Promise.resolve({ data: null, error: null }).then(resolve)
        }; return query },
        limit(limit: number) { filtered = filtered.slice(0, limit); return query },
        range(start: number, end: number) { filtered = filtered.slice(start, end + 1); return query },
        then(resolve: any) { return Promise.resolve({ data: filtered, error: null }).then(resolve) },
      }
      return query
    },
    rpc(name: string, args: any) { calls.push({ name, args }); return Promise.resolve({ data: { id: planId, ...args.p_payload }, error: null }) },
  }
  const tools = new Map<string, any>()
  registerNutritionTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async (_db: any, requested?: string) => {
      if (requested && requested !== coachId) throw new Error('Sin acceso al espacio')
      return { coachId }
    },
    requireClient: async (_db: any, coach: string, client: string) => {
      if (coach !== coachId || client !== clientId) throw new Error('Cliente no autorizado')
    },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
  })
  async function run(name: string, input: any) {
    const tool = tools.get(name)
    const result = await tool.run(tool.config.inputSchema.parse(input))
    // Lo que se devuelve con éxito debe cumplir el outputSchema que el SDK valida.
    if (result.data) outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, calls, tables, tools, updates }
}

Deno.test('current nutrition returns nested foods, options and parsed training/rest targets', async () => {
  const { run } = fixture()
  const { data } = await run('get_current_nutrition', { client_id: clientId, on_date: '2026-10-12', day_type: 'rest' })
  assert.equal(data.macro_target.day_type_config.training.carbs_g, 300)
  assert.equal(data.selected_macro_target.kcal, 1980)
  assert.equal(data.active_diet_plan.meals[0].options[0].items[0].name, 'Arroz')
  assert.equal(data.active_diet_plan.meals[0].options[0].totals.carbs_g, 80)
})

Deno.test('reads and writes stop before querying another coach or client', async () => {
  const { run, calls } = fixture()
  for (const name of ['get_current_nutrition', 'get_nutrition_history']) {
    assert.ok((await run(name, { client_id: optionId })).error)
  }
  const result = await run('create_macro_plan', { client_id: optionId, effective_from: '2026-10-12', target: { protein_g: 160, carbs_g: 300, fat_g: 60 } })
  assert.ok(result.error)
  assert.equal(calls.length, 0)
  assert.ok((await run('get_diet_plan', { client_id: clientId, plan_id: foodId })).error)
})

Deno.test('preview calculates food quantities without saving; malformed dates are rejected', async () => {
  const { run, calls } = fixture()
  const { data } = await run('preview_diet_plan', { client_id: clientId, meals: [{ name: 'A', options: [{ name: 'B', items: [{ food_id: foodId, quantity_g: 100 }] }] }] })
  assert.equal(data.saved, false)
  assert.equal(data.preview.meals[0].options[0].totals.kcal, 360)
  assert.equal(calls.length, 0)
  await assert.rejects(() => run('get_current_nutrition', { client_id: clientId, on_date: '2026-02-30' }))
})

Deno.test('macro creation uses one atomic RPC and macro edits retain unspecified fields', async () => {
  const { run, calls } = fixture()
  const created = await run('create_macro_plan', { client_id: clientId, effective_from: '2026-10-12', target: { protein_g: 160, carbs_g: 300, fat_g: 60 } })
  assert.equal(created.data.macro_plan.kcal, 2380)
  assert.equal(calls[0].args.p_coach_id, coachId)
  assert.equal(calls[0].name, 'save_nexttrain_nutrition_plan')
  const edited = await run('update_macro_plan', { client_id: clientId, plan_id: planId, notes: 'Nueva nota' })
  assert.equal(edited.data.macro_plan.day_type_config.rest.carbs_g, 200)
  assert.ok(calls[1].args.p_payload.expected_macro)
  assert.ok((await run('update_macro_plan', { client_id: clientId, plan_id: planId, target: { protein_g: 160, carbs_g: 300, fat_g: 60 } })).error)
})

Deno.test('stale diet edits stop before saving and header-only edits keep the structure', async () => {
  const { run, calls } = fixture()
  assert.ok((await run('update_diet_plan', { client_id: clientId, plan_id: planId, expected_updated_at: '2026-10-11T10:00:00Z', name: 'Cambio' })).error)
  assert.equal(calls.length, 0)
  const result = await run('update_diet_plan', { client_id: clientId, plan_id: planId, expected_updated_at: timestamp, name: 'Cambio' })
  assert.equal(result.data.diet_plan.meals[0].options[0].items[0].quantity_g, 100)
  assert.equal(calls[0].args.p_payload.meals, undefined)
  assert.equal(calls[0].args.p_payload.legacy_meals, undefined)
  assert.equal(calls[0].args.p_expected_updated_at, timestamp)
})

const newerId = '77777777-7777-4777-8777-777777777777'
const newer = { id: newerId, coach_id: coachId, client_id: clientId, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  effective_from: '2026-11-02', effective_to: null, created_at: timestamp,
  day_type_config: JSON.stringify({ training: { kcal: 2550, protein_g: 150, carbs_g: 364, fat_g: 55 }, rest: { kcal: 2350, protein_g: 150, carbs_g: 314, fat_g: 55 } }) }
const bulk = { training: { kcal: 2550, protein_g: 150, carbs_g: 375, fat_g: 50 }, rest: { kcal: 2350, protein_g: 150, carbs_g: 325, fat_g: 50 } }

Deno.test('macro tools are findable by nutrition-goal wording', () => {
  const { tools } = fixture()
  for (const name of ['create_macro_plan', 'update_macro_plan', 'get_current_nutrition']) {
    const { title, description } = tools.get(name).config
    assert.match(`${title} ${description}`, /objetivos nutricionales/i)
  }
  assert.match(tools.get('create_macro_plan').config.description, /entreno y de descanso/)
})

Deno.test('editing a plan created in the app closes the older open plan instead of failing', async () => {
  const { run, calls, tables, updates } = fixture()
  tables.macro_plans.push({ ...newer })
  const result = await run('update_macro_plan', { client_id: clientId, plan_id: newerId, day_type_config: bulk, notes: 'Volumen controlado' })
  assert.equal(result.error, undefined)
  assert.deepEqual(result.data.closed_previous_plan_ids, [planId])
  assert.deepEqual(updates, [{ table: 'macro_plans', values: { effective_to: '2026-11-01' } }])
  assert.equal(calls[0].args.p_plan_id, newerId)
  assert.equal(calls[0].args.p_payload.effective_from, '2026-11-02')
  assert.equal(calls[0].args.p_payload.day_type_config.rest.carbs_g, 325)
  assert.equal(calls[0].args.p_payload.kcal, 2550)
})

Deno.test('editing an old open plan ends it where the next one starts', async () => {
  const { run, calls, tables, updates } = fixture()
  tables.macro_plans.push({ ...newer })
  const result = await run('update_macro_plan', { client_id: clientId, plan_id: planId, notes: 'Bloque anterior' })
  assert.equal(result.error, undefined)
  assert.equal(calls[0].args.p_payload.effective_to, '2026-11-01')
  assert.equal(updates.length, 0)
  assert.ok((await run('update_macro_plan', { client_id: clientId, plan_id: planId, effective_to: null })).error)
})

Deno.test('creating on a date that already has a plan names that plan_id and saves nothing', async () => {
  const { run, calls, tables } = fixture()
  tables.macro_plans.push({ ...newer })
  const result = await run('create_macro_plan', { client_id: clientId, effective_from: '2026-11-02', day_type_config: bulk })
  assert.match(result.error, new RegExp(newerId))
  assert.match(result.error, /update_macro_plan/)
  assert.equal(calls.length, 0)
  const later = await run('create_macro_plan', { client_id: clientId, effective_from: '2026-11-16', day_type_config: bulk, notes: 'Revisión a los 14 días' })
  assert.equal(later.data.created, true)
  assert.equal(calls[0].args.p_payload.day_type_config.training.carbs_g, 375)
})
