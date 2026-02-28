'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { DietPlanMeals } from '@/data/workspace'
import { assertClientLinked } from '@/lib/guards'
import { requireActiveCoachId } from '@/lib/auth/require-coach'

export async function saveDietPlanAction(data: {
    id?: string
    coach_id: string
    client_id: string
    name: string
    meals: DietPlanMeals
    effective_from: string
    effective_to?: string
}) {
    try {
        await assertClientLinked(data.client_id)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    // Validate coach_id against membership
    const { supabase, coachId } = await requireActiveCoachId(data.coach_id)

    if (data.id) {
        // Update existing
        const { error } = await supabase
            .from('diet_plans')
            .update({
                name: data.name,
                meals: data.meals,
                effective_from: data.effective_from,
                effective_to: data.effective_to || null,
            })
            .eq('id', data.id)

        if (error) {
            return { success: false, error: error.message }
        }
    } else {
        // Insert new
        const { error } = await supabase
            .from('diet_plans')
            .insert({
                coach_id: coachId,
                client_id: data.client_id,
                name: data.name,
                meals: data.meals,
                effective_from: data.effective_from,
                effective_to: data.effective_to || null,
            })

        if (error) {
            return { success: false, error: error.message }
        }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}
