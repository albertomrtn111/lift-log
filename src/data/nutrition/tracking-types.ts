// ============================================================================
// Types for nutrition tracking (foods, recipes, daily log entries)
// ============================================================================

export type DayType = 'training' | 'rest'
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other'

export interface Food {
    id: string
    name: string
    brand: string | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number | null
    sugar_g: number | null
    sodium_mg: number | null
    serving_size_g: number
    serving_label: string | null
    source: 'user' | 'system'
    created_by: string | null
    is_public: boolean
    created_at: string
    updated_at: string
}

export interface FoodInput {
    name: string
    brand?: string | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g?: number | null
    sugar_g?: number | null
    sodium_mg?: number | null
    serving_size_g?: number
    serving_label?: string | null
    is_public?: boolean
}

export interface Recipe {
    id: string
    name: string
    description: string | null
    servings: number
    serving_label: string | null
    total_kcal: number
    total_protein_g: number
    total_carbs_g: number
    total_fat_g: number
    created_by: string | null
    is_public: boolean
    created_at: string
    updated_at: string
}

export interface RecipeIngredient {
    id: string
    recipe_id: string
    food_id: string
    grams: number
    order_index: number
    food?: Food
}

export interface RecipeWithIngredients extends Recipe {
    ingredients: RecipeIngredient[]
}

export interface NutritionLogEntry {
    id: string
    client_id: string
    log_date: string
    meal_type: MealType
    meal_label: string | null
    meal_order: number
    food_id: string | null
    recipe_id: string | null
    quantity_g: number | null
    servings: number | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    item_name: string
    day_type: DayType | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface NutritionLogEntryInput {
    log_date: string
    meal_type: MealType
    meal_label?: string | null
    meal_order?: number
    food_id?: string | null
    recipe_id?: string | null
    quantity_g?: number | null
    servings?: number | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    item_name: string
    day_type?: DayType | null
    notes?: string | null
}

export interface MacroTotals {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
}

export const DEFAULT_MEAL_ORDER: Record<MealType, number> = {
    breakfast: 0,
    lunch: 1,
    snack: 2,
    dinner: 3,
    other: 4,
}

export const MEAL_LABELS_ES: Record<MealType, string> = {
    breakfast: 'Desayuno',
    lunch: 'Comida',
    snack: 'Merienda',
    dinner: 'Cena',
    other: 'Otra comida',
}

/** Calcula macros de una porción de alimento (gramos consumidos / 100 g). */
export function macrosForFood(food: Food, grams: number): MacroTotals {
    const k = grams / 100
    return {
        kcal: round(food.kcal * k),
        protein_g: round(food.protein_g * k),
        carbs_g: round(food.carbs_g * k),
        fat_g: round(food.fat_g * k),
    }
}

/** Calcula macros de una receta (n porciones del total). */
export function macrosForRecipe(recipe: Recipe, servings: number): MacroTotals {
    const k = servings / Math.max(recipe.servings, 1)
    return {
        kcal: round(recipe.total_kcal * k),
        protein_g: round(recipe.total_protein_g * k),
        carbs_g: round(recipe.total_carbs_g * k),
        fat_g: round(recipe.total_fat_g * k),
    }
}

function round(n: number) {
    return Math.round(n * 10) / 10
}
