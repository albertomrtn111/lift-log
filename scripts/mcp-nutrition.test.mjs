import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLegacyDiet, describeMeals, describeOption, legacyMeals, macroPayload, normalizeMacroPlan, prepareDiet } from '../supabase/functions/nexttrain-mcp/nutrition-model.js'

const rice = { id: 'rice', name: 'Arroz', serving_size_g: 100, kcal: 360, protein_g: 7, carbs_g: 80, fat_g: 1, food_group: 'carbs' }
const pasta = { id: 'pasta', name: 'Pasta', serving_size_g: 100, kcal: 360, protein_g: 12, carbs_g: 72, fat_g: 1.5, food_group: 'carbs' }
const chicken = { id: 'chicken', name: 'Pollo', serving_size_g: 100, kcal: 110, protein_g: 23, carbs_g: 0, fat_g: 2, food_group: 'protein' }
const oil = { id: 'oil', name: 'Aceite', serving_size_g: 100, kcal: 900, protein_g: 0, carbs_g: 0, fat_g: 100, food_group: 'fat' }
const egg = { id: 'egg', name: 'Huevo', serving_size_g: 100, unit_weight_g: 60, unit_label: 'ud', kcal: 150, protein_g: 13, carbs_g: 1, fat_g: 11, food_group: 'protein' }
const foods = new Map([rice, pasta, chicken, oil, egg].map(food => [food.id, food]))
const meal = (day_type = 'default', name = 'Comida') => ({ name, day_type, options: [
  { name: 'Arroz y pollo', items: [{ food_id: 'rice', quantity_g: 80 }, { food_id: 'chicken', quantity_g: 120 }, { food_id: 'oil', quantity_g: 10 }] },
  { name: 'Pasta y pollo', items: [{ food_id: 'pasta', quantity_g: 90 }, { food_id: 'chicken', quantity_g: 120 }, { food_id: 'oil', quantity_g: 10 }] },
] })

test('training/rest targets are parsed and calories can be derived', () => {
  const payload = macroPayload({ day_type_config: { training: { protein_g: 160, carbs_g: 300, fat_g: 60 }, rest: { protein_g: 160, carbs_g: 200, fat_g: 60 } } })
  assert.equal(payload.kcal, 2380)
  const plan = normalizeMacroPlan({ ...payload, day_type_config: JSON.stringify(payload.day_type_config) })
  assert.equal(plan.day_type_config.rest.kcal, 1980)
  assert.equal(plan.mode, 'training_rest')
  assert.throws(() => macroPayload({ target: { kcal: 1000, protein_g: 160, carbs_g: 300, fat_g: 60 } }), /coherentes/)
  assert.ok(normalizeMacroPlan({ day_type_config: 'broken' }).warnings.length)
})

test('options and alternatives are not summed as if all were eaten', () => {
  const result = prepareDiet({ meals: [{ name: 'Comida', options: [{ name: 'A', items: [
    { food_id: 'rice', quantity_g: 100, alternative_group: 1 },
    { food_id: 'pasta', quantity_g: 100, alternative_group: 1, is_alternative: true },
  ] }, { name: 'B', items: [{ food_id: 'chicken', quantity_g: 100 }] }] }] }, foods)
  const options = result.summary.meals[0].options
  assert.equal(options[0].totals.carbs_g, 80)
  assert.equal(options[0].items[1].quantity_g, 110)
  assert.equal(result.summary.days.default.selectable_totals_range.kcal.max, 360)
  assert.equal(result.summary.days.default.selectable_totals_range.kcal.min, 110)
})

test('daily training and rest targets distribute exactly and options fit independently', () => {
  const result = prepareDiet({ meals: [meal('training', 'A'), meal('training', 'B'), meal('rest', 'A')],
    daily_targets: { training: { protein_g: 60, carbs_g: 120, fat_g: 24 }, rest: { protein_g: 30, carbs_g: 60, fat_g: 12 } }, adjust_to_targets: true, strict_targets: true }, foods)
  assert.equal(result.summary.days.training.meal_target_sum.protein_g, 60)
  assert.equal(result.summary.days.training.meal_target_sum.kcal, 936)
  assert.equal(result.summary.days.rest.meal_target_sum.kcal, 468)
  assert.equal(result.warnings.length, 0)
  const legacy = buildLegacyDiet(result.meals)
  assert.ok(legacy.days.training.A)
  assert.ok(legacy.days.rest.A)
  assert.equal(legacy.meals_per_day, 2)
})

test('untracked foods stay unknown and strict validation blocks incomplete totals', () => {
  const input = { meals: [{ name: 'A', options: [{ name: 'Libre', items: [{ name: 'Verdura al gusto' }] }] }] }
  const prepared = prepareDiet(input, foods)
  assert.equal(prepared.summary.meals[0].options[0].totals_complete, false)
  assert.equal(prepared.summary.meals[0].options[0].items[0].protein_g, null)
  assert.throws(() => prepareDiet({ ...input, strict_targets: true }, foods), /no cumple/)
  assert.throws(() => prepareDiet({ meals: [{ name: 'A', options: [{ name: 'B', items: [{ food_id: 'missing', quantity_g: 100 }] }] }] }, foods), /no disponible/)
})

test('unit prescriptions retain visible quantities after adjustment', () => {
  const result = prepareDiet({ meals: [{ name: 'A', target: { protein_g: 16, carbs_g: 1.2, fat_g: 13.2 }, options: [{ name: 'Huevos', items: [{ food_id: 'egg', quantity_value: 2, quantity_unit: 'ud', unit_based: true }] }] }], adjust_to_targets: true }, foods)
  const item = result.meals[0].options[0].items[0]
  assert.equal(item.quantity_g, 120)
  assert.equal(item.quantity_value, 2)
  assert.equal(item.quantity_unit, 'ud')
})

test('stored snapshots and legacy JSON remain readable without a catalog link', () => {
  const option = describeOption({ title: 'Original', items: [{ food_name: 'Alimento antiguo', quantity: 80, unit: 'g', kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 2 }] }, null)
  assert.equal(option.items[0].macro_source, 'stored_snapshot')
  assert.equal(option.totals.kcal, 100)
  const parsed = legacyMeals({ meals: { days: { rest: { Cena: { options: [{ title: 'Cena', items: [{ name: 'Ensalada', quantity: 'al gusto' }] }] } } } } })
  assert.equal(parsed[0].day_type, 'rest')
  assert.equal(describeMeals(parsed).meals[0].options[0].items[0].name, 'Ensalada')
  assert.equal(describeMeals(parsed).meals[0].options[0].items[0].quantity_text, 'al gusto')
})

test('infeasible targets, malformed alternatives and duplicate IDs are rejected', () => {
  const input = { meals: [meal()], daily_targets: { default: { protein_g: 900, carbs_g: 1, fat_g: 1 } }, adjust_to_targets: true, strict_targets: true }
  assert.throws(() => prepareDiet(input, foods), /no cumple/)
  assert.throws(() => prepareDiet({ meals: [{ name: 'A', options: [{ name: 'B', items: [{ food_id: 'rice', quantity_g: 100, is_alternative: true }] }] }] }, foods), /alternative_group/)
  assert.throws(() => prepareDiet({ meals: [{ id: 'same', name: 'A', options: [{ id: 'same', name: 'B', items: [{ food_id: 'rice', quantity_g: 100 }] }] }] }, foods), /repetir/)
})
