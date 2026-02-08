import { createClient } from '@/lib/supabase/client'
import type { MacroPlan, MacroPlanInput } from './types'

/**
 * Get active macro plan for a client
 * Active = effective_from <= today AND (effective_to IS NULL OR effective_to >= today)
 */
export async function getActiveMacroPlan(
    coachId: string,
    clientId: string
): Promise<MacroPlan | null> {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching active macro plan:', error)
        throw error
    }

    return data as MacroPlan | null
}

/**
 * List all macro plans for a client
 */
export async function listMacroPlans(
    coachId: string,
    clientId: string
): Promise<MacroPlan[]> {
    const supabase = createClient()

    const { data, error } = await supabase
        .from('macro_plans')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .order('effective_from', { ascending: false })

    if (error) {
        console.error('Error listing macro plans:', error)
        throw error
    }

    return (data || []) as MacroPlan[]
}

/**
 * Create or update a macro plan
 */
export async function upsertMacroPlan(
    input: MacroPlanInput & { id?: string }
): Promise<MacroPlan> {
    const supabase = createClient()

    console.log('[upsertMacroPlan] Starting with:', {
        action: input.id ? 'UPDATE' : 'INSERT',
        id: input.id,
        coach_id: input.coach_id,
        client_id: input.client_id,
        effective_from: input.effective_from,
    })

    if (input.id) {
        // Update existing
        const { data, error } = await supabase
            .from('macro_plans')
            .update({
                kcal: input.kcal,
                protein_g: input.protein_g,
                carbs_g: input.carbs_g,
                fat_g: input.fat_g,
                steps_goal: input.steps_goal,
                notes: input.notes,
                effective_from: input.effective_from,
                effective_to: input.effective_to || null,
            })
            .eq('id', input.id)
            .select()
            .single()

        if (error) {
            console.error('[upsertMacroPlan] Update error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
            })
            throw error
        }
        console.log('[upsertMacroPlan] Update success:', data.id)
        return data as MacroPlan
    } else {
        // Insert new
        const { data, error } = await supabase
            .from('macro_plans')
            .insert({
                coach_id: input.coach_id,
                client_id: input.client_id,
                kcal: input.kcal,
                protein_g: input.protein_g,
                carbs_g: input.carbs_g,
                fat_g: input.fat_g,
                steps_goal: input.steps_goal,
                notes: input.notes,
                effective_from: input.effective_from,
                effective_to: input.effective_to || null,
            })
            .select()
            .single()

        if (error) {
            console.error('[upsertMacroPlan] Insert error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                payload: {
                    coach_id: input.coach_id,
                    client_id: input.client_id,
                    effective_from: input.effective_from,
                }
            })
            throw error
        }
        console.log('[upsertMacroPlan] Insert success:', data.id)
        return data as MacroPlan
    }
}


