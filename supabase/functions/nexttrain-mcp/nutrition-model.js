// El MCP usa el mismo motor que el editor para cantidades y equivalencias.
import { adjustOptionToTarget, compareToTarget, itemMacros, syncAlternatives, toGrams } from '../../../src/lib/nutrition/diet-macros.js'

export const MACROS = ['kcal', 'protein_g', 'carbs_g', 'fat_g']
const round = (value) => Math.round(value * 10) / 10
const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)

export function normalizeTarget(target) {
  if (!target) return null
  const result = Object.fromEntries(MACROS.map(key => [key, number(target[key])]))
  for (const value of Object.values(result)) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('Los macros deben ser números positivos o cero.')
  }
  if (result.kcal === null && ['protein_g', 'carbs_g', 'fat_g'].every(key => result[key] !== null)) {
    result.kcal = round(result.protein_g * 4 + result.carbs_g * 4 + result.fat_g * 9)
  }
  return result
}

export function normalizeMacroPlan(plan) {
  if (!plan) return null
  let config = plan.day_type_config
  const warnings = []
  if (typeof config === 'string') {
    try { config = JSON.parse(config) } catch { config = null; warnings.push('Configuración de tipos de día inválida; no se han inferido sus macros.') }
  }
  if (config && (!config.training || !config.rest)) {
    config = null
    warnings.push('Configuración incompleta de entreno/descanso.')
  }
  return {
    ...plan, ...normalizeTarget(plan),
    day_type_config: config ? { training: normalizeTarget(config.training), rest: normalizeTarget(config.rest) } : null,
    mode: config ? 'training_rest' : 'simple', warnings,
  }
}

export function macroPayload(input) {
  const config = input.day_type_config
    ? { training: normalizeTarget(input.day_type_config.training), rest: normalizeTarget(input.day_type_config.rest) } : null
  const base = config?.training ?? normalizeTarget(input.target)
  if (!base || MACROS.some(key => base[key] === null)) throw new Error('Indica los macros completos, o los de entreno y descanso.')
  for (const target of config ? Object.values(config) : [base]) {
    if (MACROS.some(key => target[key] === null)) throw new Error('Cada tipo de día necesita proteína, hidratos y grasas.')
    const calculated = target.protein_g * 4 + target.carbs_g * 4 + target.fat_g * 9
    if (Math.abs(target.kcal - calculated) > Math.max(50, target.kcal * 0.05)) {
      throw new Error(`Las kcal (${target.kcal}) no son coherentes con los macros (${round(calculated)} kcal).`)
    }
  }
  return { ...input, ...Object.fromEntries(MACROS.map(key => [key, Math.round(base[key])])), day_type_config: config }
}

export function describeItem(row) {
  const food = row.food ?? null
  const grams = number(row.quantity_g) ?? toGrams(row.quantity ?? row.quantity_value, row.unit ?? row.quantity_unit, food)
  const calculated = food && grams !== null ? itemMacros({ food, quantity_g: grams }) : null
  const stored = Object.fromEntries(MACROS.map(key => [key, number(row[key])]))
  const hasStored = MACROS.every(key => stored[key] !== null && Number.isFinite(stored[key]))
  return {
    id: row.id ?? null, item_type: row.item_type ?? 'food',
    name: row.food_name ?? row.name ?? '', food_id: row.food_id ?? food?.id ?? null,
    quantity_value: number(row.quantity ?? row.quantity_value), quantity_unit: row.unit ?? row.quantity_unit ?? null,
    quantity_text: typeof row.quantity === 'string' ? row.quantity : null,
    quantity_g: grams, notes: row.details ?? row.notes ?? row.note ?? null,
    order_index: row.order_index ?? 0,
    ...calculated ?? stored,
    macro_source: calculated ? 'food_catalog' : hasStored ? 'stored_snapshot' : 'unavailable',
    alternative_group: row.alternative_group ?? null, is_alternative: Boolean(row.is_alternative),
    equivalence_basis: row.equivalence_basis ?? null, food,
  }
}

export function describeOption(option, target) {
  const items = (option.items ?? []).map(describeItem)
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, uncounted: 0 }
  for (const item of items) {
    if (item.is_alternative) continue
    if (item.macro_source === 'unavailable') { totals.uncounted++; continue }
    for (const key of MACROS) totals[key] += item[key]
  }
  for (const key of MACROS) totals[key] = round(totals[key])
  return { id: option.id ?? null, name: option.title ?? option.name ?? '', notes: option.notes ?? null,
    order_index: option.order_index ?? 0, items, totals, comparison: compareToTarget(totals, target),
    totals_complete: totals.uncounted === 0 }
}

export function describeMeals(meals, targets = {}) {
  const result = meals.map(meal => {
    const target = normalizeTarget(meal.target ?? Object.fromEntries(MACROS.map(key => [key, meal[`target_${key}`]])))
    return { id: meal.id ?? null, name: meal.name, day_type: meal.day_type ?? 'default', order_index: meal.order_index ?? 0,
      target, options: (meal.options ?? []).map(option => describeOption(option, target)) }
  })
  const days = {}
  for (const type of new Set(result.map(meal => meal.day_type))) {
    const dayMeals = result.filter(meal => meal.day_type === type)
    const targetSum = Object.fromEntries(MACROS.map(key => [key,
      dayMeals.every(meal => meal.target?.[key] !== null && meal.target?.[key] !== undefined)
        ? round(dayMeals.reduce((sum, meal) => sum + meal.target[key], 0)) : null]))
    const ranges = Object.fromEntries(MACROS.map(key => [key, {
      min: round(dayMeals.reduce((sum, meal) => sum + Math.min(...meal.options.map(opt => opt.totals[key]), Infinity), 0)),
      max: round(dayMeals.reduce((sum, meal) => sum + Math.max(...meal.options.map(opt => opt.totals[key]), -Infinity), 0)),
    }]))
    days[type] = { meal_count: dayMeals.length, meal_target_sum: targetSum, daily_target: normalizeTarget(targets[type]),
      target_comparison: targets[type] && MACROS.every(key => targetSum[key] !== null) ? compareToTarget(targetSum, targets[type]) : null,
      selectable_totals_range: dayMeals.every(meal => meal.options.length > 0) ? ranges : null,
      totals_complete: dayMeals.every(meal => meal.options.length > 0 && meal.options.every(opt => opt.totals_complete)) }
  }
  return { meals: result, days, totals_note: 'Se elige UNA opción por comida. Las alternativas de un alimento no se suman. Los rangos combinan los mínimos/máximos de cada opción; no son un menú único.' }
}

export function legacyMeals(plan) {
  const raw = plan?.meals
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) return raw
  const days = raw.days ?? { default: raw }
  return Object.entries(days).flatMap(([day_type, dayMeals]) => {
    if (!dayMeals || typeof dayMeals !== 'object') return []
    return Object.entries(dayMeals).filter(([, value]) => value && Array.isArray(value.options))
      .map(([name, value], order_index) => ({ name, day_type, order_index, target: value.target ?? null, options: value.options }))
  })
}

export function prepareDiet(input, foods) {
  const targets = Object.fromEntries(Object.entries(input.daily_targets ?? {}).map(([key, target]) => [key, normalizeTarget(target)]))
  const seen = new Set()
  const registerId = (id) => {
    if (!id) return
    if (seen.has(id)) throw new Error('No se puede repetir un identificador en la dieta.')
    seen.add(id)
  }
  const dayOrders = new Map()
  let count = 0
  const meals = input.meals.map(meal => {
    registerId(meal.id)
    const day = meal.day_type ?? 'default'
    const order = dayOrders.get(day) ?? 0
    dayOrders.set(day, order + 1)
    return { ...meal, day_type: day, order_index: order, target: normalizeTarget(meal.target),
      options: meal.options.map((option, order_index) => {
        registerId(option.id)
        const items = option.items.map((item, index) => {
          if (++count > 800) throw new Error('Una dieta admite como máximo 800 alimentos en total.')
          registerId(item.id)
          const food = item.food_id ? foods.get(item.food_id) : null
          if (item.food_id && !food) throw new Error(`Alimento no disponible: ${item.food_id}. Busca uno en search_foods.`)
          const grams = item.quantity_g ?? toGrams(item.quantity_value, item.quantity_unit, food)
          if (food && !(grams > 0)) throw new Error(`Indica gramos o unidades con peso conocido para ${food.name}.`)
          return { ...item, name: item.name ?? food?.name, quantity_g: grams ?? null, food,
            order_index: index, is_alternative: item.is_alternative ?? false }
        })
        const groups = new Map()
        for (const item of items) {
          if (item.is_alternative && item.alternative_group == null) throw new Error('Cada alternativa necesita alternative_group.')
          if (item.alternative_group != null) {
            const group = groups.get(item.alternative_group) ?? []
            group.push(item); groups.set(item.alternative_group, group)
          }
        }
        for (const group of groups.values()) {
          if (group.filter(item => !item.is_alternative).length !== 1) throw new Error('Cada grupo de alternativas necesita exactamente un alimento principal.')
        }
        return { ...option, order_index, items }
      }) }
  })
  // Reparte cada objetivo entre comidas; respeta las proporciones indicadas.
  for (const [day, target] of Object.entries(targets)) {
    const dayMeals = meals.filter(meal => meal.day_type === day)
    if (!dayMeals.length) throw new Error(`Hay objetivo para ${day}, pero no hay comidas de ese tipo.`)
    for (const key of MACROS) {
      if (target[key] === null) continue
      const sum = dayMeals.reduce((value, meal) => value + (meal.target?.[key] ?? 0), 0)
      let assigned = 0
      dayMeals.forEach((meal, index) => {
        const value = index === dayMeals.length - 1 ? round(target[key] - assigned)
          : round(target[key] * (sum > 0 ? (meal.target?.[key] ?? 0) / sum : 1 / dayMeals.length))
        meal.target = { ...normalizeTarget({}), ...meal.target, [key]: value }; assigned += value
      })
    }
  }
  for (const meal of meals) {
    for (const option of meal.options) {
      let items = syncAlternatives(option.items)
      if (input.adjust_to_targets && meal.target) items = adjustOptionToTarget(items, meal.target).items
      option.items = items.map(item => {
        const macros = itemMacros(item)
        // Las cantidades visibles siempre coinciden con los gramos ajustados.
        const unitBased = item.unit_based && item.food?.unit_weight_g
        return { ...item, ...macros ?? Object.fromEntries(MACROS.map(key => [key, null])),
          quantity_value: item.food ? (unitBased ? round(item.quantity_g / item.food.unit_weight_g) : item.quantity_g) : item.quantity_value ?? null,
          quantity_unit: item.food ? (unitBased ? item.food.unit_label ?? 'ud' : 'g') : item.quantity_unit ?? null }
      })
    }
  }
  const summary = describeMeals(meals, targets)
  const warnings = []
  for (const meal of summary.meals) for (const option of meal.options) {
    if (!option.totals_complete) warnings.push(`${meal.day_type}/${meal.name}/${option.name}: hay alimentos sin macros calculables.`)
    if (['warn', 'off'].includes(option.comparison.status)) warnings.push(`${meal.day_type}/${meal.name}/${option.name}: desviación ${option.comparison.status} del objetivo.`)
  }
  if (input.strict_targets && (warnings.length || summary.meals.some(meal => !meal.target || MACROS.every(key => !(meal.target[key] > 0))))) {
    throw new Error('La dieta no cumple todos los objetivos o tiene alimentos sin macros. Usa preview_diet_plan y corrige cantidades/alimentos antes de guardarla.')
  }
  return { meals, summary, warnings }
}

export function buildLegacyDiet(meals) {
  const days = {}
  for (const meal of meals) {
    days[meal.day_type] ??= {}
    if (days[meal.day_type][meal.name]) throw new Error('Los nombres de comida deben ser únicos dentro de cada tipo de día.')
    days[meal.day_type][meal.name] = { target: meal.target, options: meal.options.map(option => ({
      id: option.id ?? null, name: option.name, title: option.name, notes: option.notes ?? null,
      items: option.items.map(item => ({ ...item, food: undefined,
        quantity: item.quantity_value == null ? '' : `${item.quantity_value} ${item.quantity_unit ?? ''}`.trim(), note: item.notes ?? null })) })) }
  }
  const first = meals.filter(meal => meal.day_type === 'default')
  const labels = (first.length ? first : meals.filter(meal => meal.day_type === meals[0]?.day_type)).map(meal => meal.name)
  return { meals_per_day: labels.length, labels, days }
}
