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

export function buildMealSlotsForDate(defaultMeals, customSlots) {
  const customMeals = customSlots
    .filter((slot) => !slot.deleted_from)
    .map((slot) => ({
      id: slot.id,
      type: 'other',
      label: slot.label,
      order: slot.order_index,
      canDelete: true,
    }))

  return [...defaultMeals, ...customMeals].sort((a, b) => Number(a.order) - Number(b.order))
}
