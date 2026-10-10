// TypeScript interfaces for normalized diet tables

// ============================================================================
// MACRO PLANS (existing macro_plans table)
// ============================================================================

/** Macro values for a specific day type (training or rest) */
export interface MacroDayTypeValues {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
}

/** When not null, the plan has separate macros per day type */
export interface MacroDayTypeConfig {
    training: MacroDayTypeValues
    rest: MacroDayTypeValues
}

export interface MacroPlan {
    id: string
    coach_id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number | null
    cardio_target?: unknown
    notes?: string
    day_type_config?: MacroDayTypeConfig | null
    effective_from: string
    effective_to?: string | null
    created_at: string
}

export interface MacroPlanInput {
    coach_id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number | null
    notes?: string
    day_type_config?: MacroDayTypeConfig | null
    effective_from: string
    effective_to?: string | null
}

// ============================================================================
// DIET PLANS (normalized diet_plans table)
// ============================================================================

export type DietPlanType = 'options' | 'macros' | 'hybrid'
export type DietPlanStatus = 'draft' | 'active' | 'archived'

// Full DayType including weekly days for future support
export type DayType =
    | 'default'
    | 'training'
    | 'rest'
    | 'mon'
    | 'tue'
    | 'wed'
    | 'thu'
    | 'fri'
    | 'sat'
    | 'sun'

// Subset of DayType for current UI (wizard only shows these)
export const WIZARD_DAY_TYPES: DayType[] = ['default', 'training', 'rest']

export type ItemType = 'food' | 'free_text' | 'rule'

export interface DietPlan {
    id: string
    coach_id: string
    client_id: string
    name: string
    type: DietPlanType
    status: DietPlanStatus
    effective_from: string
    effective_to?: string | null
    created_at: string
    updated_at?: string
}

/** Objetivo de macros de una comida (lo fija el coach) */
export interface MealMacroTarget {
    target_kcal?: number | null
    target_protein_g?: number | null
    target_carbs_g?: number | null
    target_fat_g?: number | null
}

export type EquivalenceBasis = 'kcal' | 'protein' | 'carbs' | 'fat'

/** Alimento de la tabla `foods` con lo necesario para calcular macros */
export interface DietFoodRef {
    id: string
    name: string
    brand?: string | null
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    serving_size_g: number
    unit_weight_g?: number | null
    unit_label?: string | null
    food_group?: string | null
    is_generic?: boolean
}

/** Campos de macros de un ítem vinculado a un alimento */
export interface DietItemMacroFields {
    food_id?: string | null
    quantity_g?: number | null
    kcal?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    /** Ítems con el mismo grupo dentro de una opción son intercambiables */
    alternative_group?: number | null
    is_alternative?: boolean
    equivalence_basis?: EquivalenceBasis | null
}

export interface DietMeal extends MealMacroTarget {
    id: string
    diet_plan_id: string
    day_type: DayType
    name: string
    order_index: number
    created_at: string
}

export interface DietMealOption {
    id: string
    meal_id: string          // FK to diet_meals
    plan_id: string          // FK to diet_plans (denormalized)
    coach_id: string         // FK to coaches (denormalized)
    client_id: string        // FK to profiles (denormalized)
    name: string
    order_index: number
    notes?: string
    created_at: string
}

export interface DietOptionItem extends DietItemMacroFields {
    id: string
    option_id: string
    item_type: ItemType
    name: string
    quantity_value?: number | null
    quantity_unit?: string | null
    notes?: string
    order_index: number
    created_at: string
    /** Alimento vinculado (incrustado al leer la estructura) */
    food?: DietFoodRef | null
}

// ============================================================================
// COMBINED STRUCTURES (for UI)
// ============================================================================

export interface DietOptionItemInput extends DietItemMacroFields {
    item_type: ItemType
    name: string
    quantity_value?: number | null
    quantity_unit?: string | null
    notes?: string
    order_index: number
}

export interface DietMealOptionInput {
    name: string
    order_index: number
    notes?: string
    items: DietOptionItemInput[]
}

export interface DietMealInput extends MealMacroTarget {
    day_type: DayType
    name: string
    order_index: number
    options: DietMealOptionInput[]
}

export interface DietPlanInput {
    coach_id: string
    client_id: string
    name: string
    type: DietPlanType
    status: DietPlanStatus
    effective_from: string
    effective_to?: string | null
    meals: DietMealInput[]
}

// Full structure for reading a plan with all nested data
export interface DietOptionWithItems extends DietMealOption {
    items: DietOptionItem[]
}

export interface DietMealWithOptions extends DietMeal {
    options: DietOptionWithItems[]
}

export interface DietPlanWithStructure extends DietPlan {
    meals: DietMealWithOptions[]
}
