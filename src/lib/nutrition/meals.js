export function doesEntryBelongToMeal(entry, meal) {
  if (!entry || !meal) return false
  if (entry.meal_type !== meal.type) return false
  if (meal.type !== 'other') return true

  return (
    (entry.meal_label ?? 'Otra') === meal.label &&
    Number(entry.meal_order ?? 0) === Number(meal.order ?? 0)
  )
}

export function buildPastedNutritionEntries(entries, { date, dayType, targetMeal }) {
  return entries.map((entry) => ({
    log_date: date,
    meal_type: targetMeal.type,
    meal_label: targetMeal.type === 'other' ? targetMeal.label : null,
    meal_order: targetMeal.order,
    food_id: entry.food_id ?? null,
    recipe_id: entry.recipe_id ?? null,
    quantity_g: entry.quantity_g ?? null,
    servings: entry.servings ?? null,
    kcal: Number(entry.kcal) || 0,
    protein_g: Number(entry.protein_g) || 0,
    carbs_g: Number(entry.carbs_g) || 0,
    fat_g: Number(entry.fat_g) || 0,
    item_name: entry.item_name,
    day_type: dayType ?? null,
    notes: entry.notes ?? null,
  }))
}

/**
 * Comidas del día: las de siempre más las extra del atleta (nutrition_meal_slots).
 * Con `dateKey` (YYYY-MM-DD) una comida quitada después de ese día sigue saliendo en él;
 * sin fecha solo cuentan las que no se han quitado.
 */
export function buildMealSlotsForDate(defaultMeals, customSlots, dateKey) {
  const customMeals = customSlots
    .filter((slot) => isMealSlotActiveOn(slot, dateKey))
    .map((slot) => ({
      id: slot.id,
      type: 'other',
      label: slot.label,
      order: slot.order_index,
      canDelete: true,
    }))

  return [...defaultMeals, ...customMeals].sort((a, b) => Number(a.order) - Number(b.order))
}

/** Comida extra vigente en el día: desde effective_from y hasta el día antes de deleted_from. */
export function isMealSlotActiveOn(slot, dateKey) {
  if (!slot) return false
  if (!dateKey) return !slot.deleted_from
  if (slot.effective_from && slot.effective_from > dateKey) return false
  return !slot.deleted_from || slot.deleted_from > dateKey
}

/** Nombre de comida ya usado en el día (sin distinguir mayúsculas ni espacios). */
export function hasMealNamed(meals, name) {
  const wanted = normalizeMealName(name)
  if (!wanted) return false
  return (meals ?? []).some((meal) => normalizeMealName(meal?.label) === wanted)
}

function normalizeMealName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}
