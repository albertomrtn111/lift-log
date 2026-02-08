'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { DietPlanMeals } from '@/data/workspace'

export async function saveDietPlanAction(data: {
    id?: string
    coach_id: string
    client_id: string
    name: string
    meals: DietPlanMeals
    effective_from: string
    effective_to?: string
}) {
    const supabase = await createClient()

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
                coach_id: data.coach_id,
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
