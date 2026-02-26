'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FormTemplate, CreateFormTemplateInput } from '@/types/forms'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthCoachId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { supabase, coachId: null as string | null }
    // Use user.id directly — RLS policy checks coach_id = auth.uid()
    return { supabase, coachId: user.id }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getFormTemplates(
    type?: 'checkin' | 'onboarding' | 'general'
): Promise<FormTemplate[]> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return []

    let query = supabase
        .from('form_templates')
        .select('*')
        .eq('coach_id', coachId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)

    const { data, error } = await query
    if (error) {
        console.error('Error fetching form templates:', error)
        return []
    }
    return data as FormTemplate[]
}

export async function createFormTemplate(
    input: CreateFormTemplateInput
): Promise<{ success: boolean; template?: FormTemplate; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    const { data, error } = await supabase
        .from('form_templates')
        .insert({
            coach_id: coachId,
            title: input.title,
            type: input.type,
            schema: input.schema,
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating form template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true, template: data as FormTemplate }
}

export async function updateFormTemplate(
    templateId: string,
    updates: { title?: string; schema?: any[]; is_active?: boolean }
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
        .from('form_templates')
        .update(updates)
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error updating form template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function duplicateFormTemplate(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    // Fetch original
    const { data: original, error: fetchErr } = await supabase
        .from('form_templates')
        .select('*')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (fetchErr || !original) {
        return { success: false, error: 'Template not found' }
    }

    const { error } = await supabase
        .from('form_templates')
        .insert({
            coach_id: coachId,
            title: `${original.title} (copy)`,
            type: original.type,
            schema: original.schema,
            is_active: original.is_active,
            is_default: false,
        })

    if (error) {
        console.error('Error duplicating form template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function setFormTemplateDefault(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    // Get the template to know its type
    const { data: template, error: fetchErr } = await supabase
        .from('form_templates')
        .select('type, is_active')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (fetchErr || !template) {
        return { success: false, error: 'Template not found' }
    }

    if (!template.is_active) {
        return { success: false, error: 'Cannot set inactive template as default' }
    }

    // Unset current default for this coach+type
    await supabase
        .from('form_templates')
        .update({ is_default: false })
        .eq('coach_id', coachId)
        .eq('type', template.type)
        .eq('is_default', true)

    // Set new default
    const { error } = await supabase
        .from('form_templates')
        .update({ is_default: true })
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error setting default:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function toggleFormTemplateActive(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    const { data: template, error: fetchErr } = await supabase
        .from('form_templates')
        .select('is_active, is_default')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (fetchErr || !template) {
        return { success: false, error: 'Template not found' }
    }

    // Block deactivation of default template
    if (template.is_active && template.is_default) {
        return { success: false, error: 'Default template cannot be deactivated' }
    }

    const { error } = await supabase
        .from('form_templates')
        .update({ is_active: !template.is_active })
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error toggling active:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function deleteFormTemplate(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await getAuthCoachId()
    if (!coachId) return { success: false, error: 'Not authenticated' }

    // Check if it's default
    const { data: template, error: fetchErr } = await supabase
        .from('form_templates')
        .select('is_default')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (fetchErr || !template) {
        return { success: false, error: 'Template not found' }
    }

    if (template.is_default) {
        return { success: false, error: 'Cannot delete default template. Remove default status first.' }
    }

    const { error } = await supabase
        .from('form_templates')
        .delete()
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error deleting form template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}
