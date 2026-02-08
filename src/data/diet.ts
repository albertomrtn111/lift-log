import { createClient } from '@/lib/supabase/server'
import type { MacroPlan, DietPlan } from '@/types/training'

export interface DBMacroPlan {
    id: string
    client_id: string
    kcal: number
    protein: number
    carbs: number
    fat: number
    steps_goal?: number
    cardio_goal?: string
    effective_from: string
    effective_to?: string
    created_at: string
}

export interface DBDietPlan {
    id: string
    client_id: string
    name: string
    content: string // JSON content
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
    protein: number
    carbs: number
    fat: number
    steps_goal?: number
    cardio_goal?: string
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
    return {
        id: db.id,
        kcal: db.kcal,
        protein: db.protein,
        carbs: db.carbs,
        fat: db.fat,
        stepsGoal: db.steps_goal,
        cardioGoal: db.cardio_goal,
        effectiveFrom: db.effective_from,
        effectiveTo: db.effective_to,
    }
}
