import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDietProgressData } from '../src/lib/nutrition/progress.js'

const macroPlans = [
  {
    id: 'plan-1',
    effective_from: '2026-06-01',
    effective_to: null,
    kcal: 2200,
    protein_g: 160,
    carbs_g: 240,
    fat_g: 70,
    day_type_config: {
      training: { kcal: 2400, protein_g: 170, carbs_g: 280, fat_g: 65 },
      rest: { kcal: 2000, protein_g: 160, carbs_g: 180, fat_g: 75 },
    },
  },
]

test('buildDietProgressData groups logged items by day and meal', () => {
  const data = buildDietProgressData({
    dateFrom: '2026-06-15',
    dateTo: '2026-06-16',
    macroPlans,
    daySettings: [{ log_date: '2026-06-15', day_type: 'training' }],
    entries: [
      {
        id: 'entry-1',
        log_date: '2026-06-15',
        meal_type: 'breakfast',
        meal_label: null,
        meal_order: 0,
        item_name: 'Avena',
        quantity_g: 80,
        servings: null,
        kcal: 310,
        protein_g: 12,
        carbs_g: 54,
        fat_g: 6,
        notes: null,
      },
      {
        id: 'entry-2',
        log_date: '2026-06-15',
        meal_type: 'lunch',
        meal_label: null,
        meal_order: 1,
        item_name: 'Pollo con arroz',
        quantity_g: null,
        servings: 1,
        kcal: 720,
        protein_g: 55,
        carbs_g: 82,
        fat_g: 16,
        notes: 'Post entreno',
      },
    ],
  })

  assert.equal(data.days.length, 2)
  assert.equal(data.days[0].date, '2026-06-15')
  assert.equal(data.days[0].dayType, 'training')
  assert.deepEqual(data.days[0].totals, {
    kcal: 1030,
    protein_g: 67,
    carbs_g: 136,
    fat_g: 22,
  })
  assert.equal(data.days[0].target?.kcal, 2400)
  assert.equal(data.days[0].meals.length, 2)
  assert.equal(data.days[0].meals[0].label, 'Desayuno')
  assert.equal(data.days[0].meals[1].items[0].notes, 'Post entreno')
  assert.equal(data.days[1].hasEntries, false)
})

test('buildDietProgressData calculates macro adherence against rest-day targets', () => {
  const data = buildDietProgressData({
    dateFrom: '2026-06-16',
    dateTo: '2026-06-16',
    macroPlans,
    daySettings: [{ log_date: '2026-06-16', day_type: 'rest' }],
    entries: [
      {
        id: 'entry-3',
        log_date: '2026-06-16',
        meal_type: 'dinner',
        meal_label: null,
        meal_order: 3,
        item_name: 'Cena completa',
        quantity_g: null,
        servings: 1,
        kcal: 1900,
        protein_g: 152,
        carbs_g: 198,
        fat_g: 70,
        notes: null,
      },
    ],
  })

  const day = data.days[0]
  assert.equal(day.dayType, 'rest')
  assert.equal(day.target?.carbs_g, 180)
  assert.equal(day.adherence.kcalPct, 95)
  assert.equal(day.adherence.proteinPct, 95)
  assert.equal(day.adherence.carbsPct, 110)
  assert.equal(day.adherence.fatPct, 93)
  assert.equal(day.adherence.overallPct, 93)
  assert.equal(data.summary.trackedDays, 1)
  assert.equal(data.summary.avgKcal, 1900)
  assert.equal(data.summary.avgOverallAdherencePct, 93)
})
