'use server'

import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { revalidatePath } from 'next/cache'
import type { TrainingTemplate, CreateTemplateInput } from '@/types/templates'

/**
 * Get all templates for the authenticated coach
 */
export async function getTemplates(): Promise<TrainingTemplate[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return []

    const { data, error } = await supabase
        .from('training_templates')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching templates:', error)
        return []
    }

    return data as TrainingTemplate[]
}

/**
 * Create a new training template
 */
export async function createTemplate(input: CreateTemplateInput): Promise<{
    success: boolean
    template?: TrainingTemplate
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) {
        return { success: false, error: 'No tienes permisos de coach' }
    }

    const { data, error } = await supabase
        .from('training_templates')
        .insert({
            coach_id: coachId,
            name: input.name,
            description: input.description || null,
            tags: input.tags || [],
            structure: { days: [] }, // Empty structure initially
            is_public: false,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/templates')
    return { success: true, template: data as TrainingTemplate }
}

/**
 * Delete a training template
 */
export async function deleteTemplate(templateId: string): Promise<{
    success: boolean
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) {
        return { success: false, error: 'No tienes permisos de coach' }
    }

    // Delete only if owned by this coach
    const { error } = await supabase
        .from('training_templates')
        .delete()
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error deleting template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/templates')
    return { success: true }
}
