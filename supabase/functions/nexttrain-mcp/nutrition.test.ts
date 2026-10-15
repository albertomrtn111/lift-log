import assert from 'node:assert/strict'
import { registerNutritionTools } from './nutrition.ts'

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
  const db = {
    from(table: string) {
      let filtered = [...tables[table] ?? []]
      const query: any = {
        select() { return query }, order() { return query },
        eq(key: string, value: unknown) { filtered = filtered.filter(row => row[key] === value); return query },
        in(key: string, values: unknown[]) { filtered = filtered.filter(row => values.includes(row[key])); return query },
        lte(key: string, value: string) { filtered = filtered.filter(row => row[key] <= value); return query },
        or() { return query }, ilike() { return query },
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
    annotations: { readOnlyHint: true },
  })
  async function run(name: string, input: any) {
    const tool = tools.get(name)
    return await tool.run(tool.config.inputSchema.parse(input))
  }
  return { run, calls, tables, tools }
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
