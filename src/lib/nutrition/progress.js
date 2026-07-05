const MEAL_LABELS_ES = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  snack: 'Merienda',
  dinner: 'Cena',
  other: 'Otra comida',
}

function parseDateStr(date) {
  return new Date(`${date}T12:00:00`)
}

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function getDateRange(dateFrom, dateTo) {
  const dates = []
  const cursor = parseDateStr(dateFrom)
  const end = parseDateStr(dateTo)

  while (cursor <= end) {
    dates.push(toDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function round(value) {
  return Math.round(value * 10) / 10
}

function roundPct(value) {
  return Math.round(value)
}

function parseDayTypeConfig(config) {
  if (!config) return null
  if (typeof config === 'object') return config
  try {
    return JSON.parse(config)
  } catch {
    return null
  }
}

function isPlanActiveOnDate(plan, date) {
  if (!plan?.effective_from || plan.effective_from > date) return false
  if (plan.effective_to && plan.effective_to < date) return false
  return true
}

function getTargetForDate(macroPlans, date, dayType) {
  const plan = [...(macroPlans || [])]
    .filter((candidate) => isPlanActiveOnDate(candidate, date))
    .sort((a, b) => {
      const byDate = String(b.effective_from).localeCompare(String(a.effective_from))
      if (byDate !== 0) return byDate
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })[0]

  if (!plan) return null

  const config = parseDayTypeConfig(plan.day_type_config)
  const dayTarget = config?.[dayType]

  return {
    kcal: toNumber(dayTarget?.kcal ?? plan.kcal),
    protein_g: toNumber(dayTarget?.protein_g ?? plan.protein_g),
    carbs_g: toNumber(dayTarget?.carbs_g ?? plan.carbs_g),
    fat_g: toNumber(dayTarget?.fat_g ?? plan.fat_g),
  }
}

function getPct(actual, target) {
  if (!target || target <= 0) return null
  return roundPct((actual / target) * 100)
}

function getClosenessPct(actual, target) {
  if (!target || target <= 0) return null
  const pct = (actual / target) * 100
  return roundPct(Math.max(0, 100 - Math.abs(100 - pct)))
}

function buildAdherence(totals, target) {
  if (!target) {
    return {
      kcalPct: null,
      proteinPct: null,
      carbsPct: null,
      fatPct: null,
      overallPct: null,
    }
  }

  const macroCloseness = [
    getClosenessPct(totals.kcal, target.kcal),
    getClosenessPct(totals.protein_g, target.protein_g),
    getClosenessPct(totals.carbs_g, target.carbs_g),
    getClosenessPct(totals.fat_g, target.fat_g),
  ].filter((value) => value !== null)

  return {
    kcalPct: getPct(totals.kcal, target.kcal),
    proteinPct: getPct(totals.protein_g, target.protein_g),
    carbsPct: getPct(totals.carbs_g, target.carbs_g),
    fatPct: getPct(totals.fat_g, target.fat_g),
    overallPct: macroCloseness.length > 0
      ? roundPct(macroCloseness.reduce((sum, value) => sum + value, 0) / macroCloseness.length)
      : null,
  }
}

function getEmptyTotals() {
  return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
}

function getMealLabel(entry) {
  return entry.meal_label || MEAL_LABELS_ES[entry.meal_type] || 'Comida'
}

function buildMeals(entries) {
  const mealMap = new Map()

  for (const entry of entries) {
    const mealType = entry.meal_type || 'other'
    const mealOrder = Number.isFinite(Number(entry.meal_order)) ? Number(entry.meal_order) : 99
    const label = getMealLabel(entry)
    const key = `${mealOrder}:${mealType}:${label}`
    const existing = mealMap.get(key) || {
      key,
      mealType,
      label,
      order: mealOrder,
      totals: getEmptyTotals(),
      items: [],
    }

    const item = {
      id: entry.id,
      name: entry.item_name || 'Alimento',
      quantity_g: entry.quantity_g ?? null,
      servings: entry.servings ?? null,
      kcal: round(toNumber(entry.kcal)),
      protein_g: round(toNumber(entry.protein_g)),
      carbs_g: round(toNumber(entry.carbs_g)),
      fat_g: round(toNumber(entry.fat_g)),
      notes: entry.notes || null,
    }

    existing.items.push(item)
    existing.totals.kcal = round(existing.totals.kcal + item.kcal)
    existing.totals.protein_g = round(existing.totals.protein_g + item.protein_g)
    existing.totals.carbs_g = round(existing.totals.carbs_g + item.carbs_g)
    existing.totals.fat_g = round(existing.totals.fat_g + item.fat_g)
    mealMap.set(key, existing)
  }

  return Array.from(mealMap.values()).sort((a, b) => a.order - b.order)
}

function getDayStatus(day) {
  if (!day.hasEntries) return 'empty'
  const overall = day.adherence.overallPct
  if (overall === null) return 'tracked'
  if (overall >= 90) return 'in_range'
  if (day.adherence.kcalPct !== null && day.adherence.kcalPct > 110) return 'over'
  return 'under'
}

/**
 * @param {{
 *   entries?: any[],
 *   daySettings?: any[],
 *   macroPlans?: any[],
 *   dateFrom: string,
 *   dateTo: string
 * }} input
 */
export function buildDietProgressData({
  entries = [],
  daySettings = [],
  macroPlans = [],
  dateFrom,
  dateTo,
}) {
  const settingsByDate = new Map(daySettings.map((setting) => [setting.log_date, setting.day_type]))
  const entriesByDate = new Map()

  for (const entry of entries) {
    const list = entriesByDate.get(entry.log_date) || []
    list.push(entry)
    entriesByDate.set(entry.log_date, list)
  }

  const days = getDateRange(dateFrom, dateTo).map((date) => {
    const dayEntries = (entriesByDate.get(date) || []).sort((a, b) => {
      const byMeal = toNumber(a.meal_order) - toNumber(b.meal_order)
      if (byMeal !== 0) return byMeal
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
    const dayType = settingsByDate.get(date) || dayEntries.find((entry) => entry.day_type)?.day_type || 'training'
    const meals = buildMeals(dayEntries)
    const totals = meals.reduce((acc, meal) => ({
      kcal: round(acc.kcal + meal.totals.kcal),
      protein_g: round(acc.protein_g + meal.totals.protein_g),
      carbs_g: round(acc.carbs_g + meal.totals.carbs_g),
      fat_g: round(acc.fat_g + meal.totals.fat_g),
    }), getEmptyTotals())
    const target = getTargetForDate(macroPlans, date, dayType)
    const day = {
      date,
      dayType,
      hasEntries: dayEntries.length > 0,
      totals,
      target,
      adherence: buildAdherence(totals, target),
      meals,
    }

    return {
      ...day,
      status: getDayStatus(day),
    }
  })

  const trackedDays = days.filter((day) => day.hasEntries)
  const average = (selector) => trackedDays.length > 0
    ? round(trackedDays.reduce((sum, day) => sum + selector(day), 0) / trackedDays.length)
    : 0
  const adherenceValues = trackedDays
    .map((day) => day.adherence.overallPct)
    .filter((value) => value !== null)

  return {
    days,
    summary: {
      trackedDays: trackedDays.length,
      totalDays: days.length,
      avgKcal: average((day) => day.totals.kcal),
      avgProteinG: average((day) => day.totals.protein_g),
      avgCarbsG: average((day) => day.totals.carbs_g),
      avgFatG: average((day) => day.totals.fat_g),
      avgOverallAdherencePct: adherenceValues.length > 0
        ? roundPct(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length)
        : null,
    },
  }
}
