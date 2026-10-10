import { createClient } from '@/lib/supabase/server'
import type { MacroPlan, DietPlan } from '@/types/training'

export interface DBMacroPlan {
    id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number
    cardio_target?: any
    day_type_config?: string | null
    effective_from: string
    effective_to?: string
    created_at: string
}

export interface DBDietPlan {
    id: string
    client_id: string
    name: string
    meals: any // JSON content
    effective_from: string
    effective_to?: string
    created_at: string
}

/**
 * Get active macro plan for a client
 */
export async function getActiveMacroPlan(clientId: string): Promise<DBMacroPlan | null> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('client_id', clientId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()

    if (error || !data) return null
    return data
}

/**
 * Get all macro plans for a client
 */
export async function getMacroPlanHistory(clientId: string): Promise<DBMacroPlan[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('client_id', clientId)
        .order('effective_from', { ascending: false })

    if (error || !data) return []
    return data
}

export interface CreateMacroPlanInput {
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps?: number
    cardio_target?: any
    effective_from: string
}

/**
 * Create a new macro plan (coach only)
 */
export async function createMacroPlan(input: CreateMacroPlanInput): Promise<DBMacroPlan | null> {
    const supabase = await createClient()

    // End currently active plan
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    await supabase
        .from('macro_plans')
        .update({ effective_to: yesterday })
        .eq('client_id', input.client_id)
        .is('effective_to', null)
        .lt('effective_from', input.effective_from)

    const { data, error } = await supabase
        .from('macro_plans')
        .insert(input)
        .select()
        .single()

    if (error) {
        console.error('Error creating macro plan:', error)
        return null
    }

    return data
}

/**
 * Get active diet plan for a client
 */
export async function getActiveDietPlan(clientId: string): Promise<DBDietPlan | null> {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('client_id', clientId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()

    if (error || !data) return null
    return data
}

/**
 * Convert DB macro plan to frontend format
 */
export function toFrontendMacroPlan(db: DBMacroPlan): MacroPlan {
    let dayTypeConfig = null
    if (db.day_type_config) {
        try {
            dayTypeConfig = typeof db.day_type_config === 'string'
                ? JSON.parse(db.day_type_config)
                : db.day_type_config
        } catch {
            dayTypeConfig = null
        }
    }
    return {
        id: db.id,
        kcal: db.kcal,
        protein: db.protein_g,
        carbs: db.carbs_g,
        fat: db.fat_g,
        stepsGoal: db.steps,
        cardioGoal: typeof db.cardio_target === 'string' ? db.cardio_target : JSON.stringify(db.cardio_target),
        effectiveFrom: db.effective_from,
        effectiveTo: db.effective_to,
        day_type_config: dayTypeConfig,
    }
}

// ============================================================================
// Dieta por opciones con macros (vista del cliente)
// ============================================================================

export interface ClientDietItem {
    id: string
    name: string
    quantity_value: number | null
    quantity_unit: string | null
    notes: string | null
    food_id: string | null
    quantity_g: number | null
    kcal: number | null
    protein_g: number | null
    carbs_g: number | null
    fat_g: number | null
    alternative_group: number | null
    is_alternative: boolean
    unit_weight_g: number | null
    unit_label: string | null
}

export interface ClientDietOption {
    id: string
    name: string
    notes: string | null
    items: ClientDietItem[]
}

export interface ClientDietMeal {
    id: string
    name: string
    day_type: string
    order_index: number
    target: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null
    options: ClientDietOption[]
}

function numberOrNull(value: unknown) {
    return value === null || value === undefined ? null : Number(value)
}

/**
 * Comidas, opciones y alimentos (con macros) de un plan de dieta por opciones.
 * Lee las tablas normalizadas; el JSON `diet_plans.meals` queda solo como
 * respaldo para planes sin estructura.
 */
export async function getDietPlanMealsWithMacros(planId: string): Promise<ClientDietMeal[]> {
    const supabase = await createClient()

    const { data: meals, error: mealsError } = await supabase
        .from('diet_meals')
        .select('id, name, day_type, order_index, target_kcal, target_protein_g, target_carbs_g, target_fat_g')
        .eq('diet_plan_id', planId)
        .order('order_index', { ascending: true })
    if (mealsError || !meals?.length) return []

    const { data: options } = await supabase
        .from('diet_meal_options')
        .select('id, meal_id, title, name, notes, order_index')
        .in('meal_id', meals.map(meal => meal.id))
        .order('order_index', { ascending: true })

    const optionIds = (options ?? []).map(option => option.id)
    const { data: items } = optionIds.length > 0
        ? await supabase
            .from('diet_meal_items')
            .select('id, option_id, food_name, quantity, unit, details, order_index, food_id, quantity_g, kcal, protein_g, carbs_g, fat_g, alternative_group, is_alternative, food:foods(unit_weight_g, unit_label)')
            .in('option_id', optionIds)
            .order('order_index', { ascending: true })
        : { data: [] as any[] }

    const itemsByOption = new Map<string, ClientDietItem[]>()
    for (const item of items ?? []) {
        const food = Array.isArray((item as any).food) ? (item as any).food[0] : (item as any).food
        const list = itemsByOption.get(item.option_id) ?? []
        list.push({
            id: item.id,
            name: String(item.food_name ?? '').trim(),
            quantity_value: numberOrNull(item.quantity),
            quantity_unit: item.unit ?? null,
            notes: item.details ?? null,
            food_id: item.food_id ?? null,
            quantity_g: numberOrNull(item.quantity_g),
            kcal: numberOrNull(item.kcal),
            protein_g: numberOrNull(item.protein_g),
            carbs_g: numberOrNull(item.carbs_g),
            fat_g: numberOrNull(item.fat_g),
            alternative_group: item.alternative_group ?? null,
            is_alternative: Boolean(item.is_alternative),
            unit_weight_g: numberOrNull(food?.unit_weight_g),
            unit_label: food?.unit_label ?? null,
        })
        itemsByOption.set(item.option_id, list)
    }

    return meals.map(meal => {
        const target = {
            kcal: numberOrNull(meal.target_kcal),
            protein_g: numberOrNull(meal.target_protein_g),
            carbs_g: numberOrNull(meal.target_carbs_g),
            fat_g: numberOrNull(meal.target_fat_g),
        }
        const hasTarget = Object.values(target).some(value => Number(value) > 0)
        return {
            id: meal.id,
            name: meal.name,
            day_type: meal.day_type,
            order_index: meal.order_index,
            target: hasTarget ? target : null,
            options: (options ?? [])
                .filter(option => option.meal_id === meal.id)
                .map(option => ({
                    id: option.id,
                    name: String(option.title ?? option.name ?? '').trim() || 'Opción',
                    notes: option.notes ?? null,
                    items: itemsByOption.get(option.id) ?? [],
                })),
        }
    })
}
