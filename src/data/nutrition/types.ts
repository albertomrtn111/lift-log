// TypeScript interfaces for normalized diet tables

// ============================================================================
// MACRO PLANS (existing macro_plans table)
// ============================================================================

export interface MacroPlan {
    id: string
    coach_id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps_goal?: number
    cardio_goal?: string
    notes?: string
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
    steps_goal?: number
    notes?: string
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

export interface DietMeal {
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

export interface DietOptionItem {
    id: string
    option_id: string
    item_type: ItemType
    name: string
    quantity_value?: number | null
    quantity_unit?: string | null
    notes?: string
    order_index: number
    created_at: string
}

// ============================================================================
// COMBINED STRUCTURES (for UI)
// ============================================================================

export interface DietOptionItemInput {
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

export interface DietMealInput {
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
