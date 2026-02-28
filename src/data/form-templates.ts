'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import type { FormTemplate, CreateFormTemplateInput } from '@/types/forms'
import { ensurePhotoField } from '@/types/forms'

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getFormTemplates(
    type?: 'checkin' | 'onboarding' | 'general'
): Promise<FormTemplate[]> {
    const { supabase, coachId } = await requireActiveCoachId()

    let query = supabase
        .from('form_templates')
        .select('*')
        .eq('coach_id', coachId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)

    const { data, error } = await query

    if (error) {
        console.error('[getFormTemplates] Error:', error)
        return []
    }

    console.log(`[getFormTemplates] Fetched ${data.length} templates for coach ${coachId}`)
    return data as FormTemplate[]
}

export async function createFormTemplate(
    input: CreateFormTemplateInput
): Promise<{ success: boolean; template?: FormTemplate; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    const finalSchema = ensurePhotoField(input.schema)
    console.log(`[createFormTemplate] Injected photo field. Fields: ${finalSchema.length} (last: ${finalSchema[finalSchema.length - 1]?.id})`)

    const { data, error } = await supabase
        .from('form_templates')
        .insert({
            coach_id: coachId,
            title: input.title,
            type: input.type,
            schema: finalSchema,
            is_active: true,
            is_default: false,
        })
        .select()
        .single()

    if (error) {
        console.error('[createFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true, template: data as FormTemplate }
}

export async function updateFormTemplate(
    templateId: string,
    updates: { title?: string; schema?: any[]; is_active?: boolean }
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    // Ensure photo field when schema is being updated
    const safeUpdates = { ...updates }
    if (safeUpdates.schema) {
        safeUpdates.schema = ensurePhotoField(safeUpdates.schema as any)
        console.log(`[updateFormTemplate] Ensured photo field. Fields: ${safeUpdates.schema.length}`)
    }

    const { error } = await supabase
        .from('form_templates')
        .update(safeUpdates)
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('[updateFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function duplicateFormTemplate(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

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

    const duplicatedSchema = ensurePhotoField(original.schema as any[])

    const { error } = await supabase
        .from('form_templates')
        .insert({
            coach_id: coachId,
            title: `${original.title} (copy)`,
            type: original.type,
            schema: duplicatedSchema,
            is_active: original.is_active,
            is_default: false,
        })

    if (error) {
        console.error('[duplicateFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function setFormTemplateDefault(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

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
        console.error('[setFormTemplateDefault] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function toggleFormTemplateActive(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

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
        console.error('[toggleFormTemplateActive] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}

export async function deleteFormTemplate(
    templateId: string
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

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
        console.error('[deleteFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    return { success: true }
}
