import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMealSlotsForDate,
  buildPastedNutritionEntries,
  doesEntryBelongToMeal,
} from '../src/lib/nutrition/meals.js'

const defaults = [
  { type: 'breakfast', label: 'Desayuno', order: 0 },
  { type: 'lunch', label: 'Comida', order: 1 },
  { type: 'snack', label: 'Merienda', order: 2 },
  { type: 'dinner', label: 'Cena', order: 3 },
]

test('doesEntryBelongToMeal keeps recent foods scoped to the selected default meal', () => {
  assert.equal(
    doesEntryBelongToMeal(
      { meal_type: 'breakfast', meal_label: null, meal_order: 0 },
      { type: 'breakfast', label: 'Desayuno', order: 0 }
    ),
    true
  )
  assert.equal(
    doesEntryBelongToMeal(
      { meal_type: 'lunch', meal_label: null, meal_order: 1 },
      { type: 'breakfast', label: 'Desayuno', order: 0 }
    ),
    false
  )
})

test('doesEntryBelongToMeal matches custom meals by label and order', () => {
  assert.equal(
    doesEntryBelongToMeal(
      { meal_type: 'other', meal_label: 'Pre-entreno', meal_order: 4 },
      { type: 'other', label: 'Pre-entreno', order: 4 }
    ),
    true
  )
  assert.equal(
    doesEntryBelongToMeal(
      { meal_type: 'other', meal_label: 'Post-entreno', meal_order: 4 },
      { type: 'other', label: 'Pre-entreno', order: 4 }
    ),
    false
  )
})

test('buildPastedNutritionEntries appends copied entries into the target meal without deleting existing rows', () => {
  const copied = [
    {
      id: 'old-entry',
      client_id: 'client-1',
      log_date: '2026-06-08',
      meal_type: 'breakfast',
      meal_label: null,
      meal_order: 0,
      food_id: 'food-1',
      recipe_id: null,
      quantity_g: 100,
      servings: null,
      kcal: 120,
      protein_g: 10,
      carbs_g: 15,
      fat_g: 3,
      item_name: 'Avena',
      day_type: 'training',
      notes: null,
      created_at: '2026-06-08T08:00:00Z',
      updated_at: '2026-06-08T08:00:00Z',
    },
  ]

  assert.deepEqual(
    buildPastedNutritionEntries(copied, {
      date: '2026-06-09',
      dayType: 'rest',
      targetMeal: { type: 'lunch', label: 'Comida', order: 1 },
    }),
    [
      {
        log_date: '2026-06-09',
        meal_type: 'lunch',
        meal_label: null,
        meal_order: 1,
        food_id: 'food-1',
        recipe_id: null,
        quantity_g: 100,
        servings: null,
        kcal: 120,
        protein_g: 10,
        carbs_g: 15,
        fat_g: 3,
        item_name: 'Avena',
        day_type: 'rest',
        notes: null,
      },
    ]
  )
})

test('buildMealSlotsForDate includes client custom meals active on the selected date', () => {
  const slots = buildMealSlotsForDate(defaults, [
    {
      id: 'slot-1',
      label: 'Pre-entreno',
      order_index: 4,
      effective_from: '2026-06-01',
      deleted_from: null,
    },
    {
      id: 'slot-2',
      label: 'Antigua',
      order_index: 5,
      effective_from: '2026-05-01',
      deleted_from: '2026-06-05',
    },
  ])

  assert.deepEqual(slots, [
    ...defaults,
    {
      id: 'slot-1',
      type: 'other',
      label: 'Pre-entreno',
      order: 4,
      canDelete: true,
    },
  ])
})
