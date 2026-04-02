'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import type { FormTemplate, CreateFormTemplateInput } from '@/types/forms'
import { ensurePhotoField } from '@/types/forms'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AssignableFormTemplateType = 'checkin' | 'onboarding'

function normalizeAssignedClientIds(ids?: string[]): string[] {
    return Array.from(new Set((ids ?? []).filter(Boolean)))
}

function isAssignableFormTemplateType(type: string): type is AssignableFormTemplateType {
    return type === 'checkin' || type === 'onboarding'
}

async function enforceExclusiveTemplateAssignments(
    supabase: SupabaseClient,
    coachId: string,
    templateId: string,
    type: AssignableFormTemplateType,
    assignedClientIds: string[]
) {
    if (assignedClientIds.length === 0) return

    const assignedSet = new Set(assignedClientIds)

    const { data: otherTemplates, error } = await supabase
        .from('form_templates')
        .select('id, assigned_client_ids')
        .eq('coach_id', coachId)
        .eq('type', type)
        .neq('id', templateId)

    if (error || !otherTemplates?.length) {
        if (error) {
            console.error('[enforceExclusiveTemplateAssignments] Error fetching templates:', error)
        }
        return
    }

    await Promise.all(
        otherTemplates.map(async (template) => {
            const currentAssigned = normalizeAssignedClientIds(template.assigned_client_ids as string[] | undefined)
            const nextAssigned = currentAssigned.filter((clientId) => !assignedSet.has(clientId))

            if (nextAssigned.length === currentAssigned.length) return

            const { error: updateError } = await supabase
                .from('form_templates')
                .update({ assigned_client_ids: nextAssigned })
                .eq('id', template.id)
                .eq('coach_id', coachId)

            if (updateError) {
                console.error(
                    `[enforceExclusiveTemplateAssignments] Error updating template ${template.id}:`,
                    updateError
                )
            }
        })
    )
}

export async function syncClientTemplateAssignment(params: {
    supabase: SupabaseClient
    coachId: string
    clientId: string
    type: AssignableFormTemplateType
    templateId: string | null
}): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId, clientId, type, templateId } = params

    const { data: templates, error } = await supabase
        .from('form_templates')
        .select('id, assigned_client_ids, is_active')
        .eq('coach_id', coachId)
        .eq('type', type)

    if (error || !templates) {
        console.error('[syncClientTemplateAssignment] Error fetching templates:', error)
        return { success: false, error: 'No se pudieron cargar las plantillas del formulario.' }
    }

    if (templateId) {
        const target = templates.find((template) => template.id === templateId)
        if (!target) {
            return { success: false, error: 'La plantilla seleccionada no existe.' }
        }
        if (!target.is_active) {
            return { success: false, error: 'La plantilla seleccionada está inactiva.' }
        }
    }

    await Promise.all(
        templates.map(async (template) => {
            const currentAssigned = normalizeAssignedClientIds(template.assigned_client_ids as string[] | undefined)
            const withoutClient = currentAssigned.filter((assignedClientId) => assignedClientId !== clientId)
            const nextAssigned = template.id === templateId
                ? Array.from(new Set([...withoutClient, clientId]))
                : withoutClient

            if (nextAssigned.length === currentAssigned.length && nextAssigned.every((id, index) => id === currentAssigned[index])) {
                return
            }

            const { error: updateError } = await supabase
                .from('form_templates')
                .update({ assigned_client_ids: nextAssigned })
                .eq('id', template.id)
                .eq('coach_id', coachId)

            if (updateError) {
                console.error(`[syncClientTemplateAssignment] Error updating template ${template.id}:`, updateError)
            }
        })
    )

    return { success: true }
}

export async function resolveFormTemplateForClient(params: {
    supabase: SupabaseClient
    coachId: string
    clientId: string
    type: AssignableFormTemplateType
}): Promise<Pick<FormTemplate, 'id' | 'title'> | null> {
    const { supabase, coachId, clientId, type } = params

    const { data: templates, error } = await supabase
        .from('form_templates')
        .select('id, title, assigned_client_ids, is_default, created_at')
        .eq('coach_id', coachId)
        .eq('type', type)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

    if (error || !templates?.length) {
        if (error) {
            console.error('[resolveFormTemplateForClient] Error:', error)
        }
        return null
    }

    const assignedTemplate = templates.find((template) =>
        normalizeAssignedClientIds(template.assigned_client_ids as string[] | undefined).includes(clientId)
    )

    if (assignedTemplate) {
        return { id: assignedTemplate.id, title: assignedTemplate.title }
    }

    const defaultTemplate = templates.find((template) => template.is_default)
    return defaultTemplate ? { id: defaultTemplate.id, title: defaultTemplate.title } : null
}

export async function resolveCheckinTemplateForClient(params: {
    supabase: SupabaseClient
    coachId: string
    clientId: string
}) {
    return resolveFormTemplateForClient({ ...params, type: 'checkin' })
}

export async function resolveOnboardingTemplateForClient(params: {
    supabase: SupabaseClient
    coachId: string
    clientId: string
}) {
    return resolveFormTemplateForClient({ ...params, type: 'onboarding' })
}

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
    const assignedClientIds = isAssignableFormTemplateType(input.type)
        ? normalizeAssignedClientIds(input.assigned_client_ids)
        : []
    console.log(`[createFormTemplate] Injected photo field. Fields: ${finalSchema.length} (last: ${finalSchema[finalSchema.length - 1]?.id})`)

    const { data, error } = await supabase
        .from('form_templates')
        .insert({
            coach_id: coachId,
            title: input.title,
            type: input.type,
            schema: finalSchema,
            assigned_client_ids: assignedClientIds,
            is_active: true,
            is_default: false,
        })
        .select()
        .single()

    if (error) {
        console.error('[createFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    if (isAssignableFormTemplateType(input.type)) {
        await enforceExclusiveTemplateAssignments(supabase, coachId, data.id, input.type, assignedClientIds)
    }

    revalidatePath('/coach/forms')
    revalidatePath('/coach/members')
    return { success: true, template: data as FormTemplate }
}

export async function updateFormTemplate(
    templateId: string,
    updates: { title?: string; schema?: any[]; is_active?: boolean; assigned_client_ids?: string[] }
): Promise<{ success: boolean; error?: string }> {
    const { supabase, coachId } = await requireActiveCoachId()

    const { data: currentTemplate, error: currentTemplateError } = await supabase
        .from('form_templates')
        .select('type')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (currentTemplateError || !currentTemplate) {
        console.error('[updateFormTemplate] Error loading template:', currentTemplateError)
        return { success: false, error: 'Template not found' }
    }

    // Ensure photo field when schema is being updated
    const safeUpdates: Record<string, unknown> = { ...updates }
    if (safeUpdates.schema) {
        safeUpdates.schema = ensurePhotoField(safeUpdates.schema as any)
        console.log(
            `[updateFormTemplate] Ensured photo field. Fields: ${(safeUpdates.schema as any[]).length}`
        )
    }

    if (isAssignableFormTemplateType(currentTemplate.type)) {
        safeUpdates.assigned_client_ids = normalizeAssignedClientIds(updates.assigned_client_ids)
    } else {
        delete safeUpdates.assigned_client_ids
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

    if (isAssignableFormTemplateType(currentTemplate.type)) {
        await enforceExclusiveTemplateAssignments(
            supabase,
            coachId,
            templateId,
            currentTemplate.type,
            normalizeAssignedClientIds(updates.assigned_client_ids)
        )
    }

    revalidatePath('/coach/forms')
    revalidatePath('/coach/members')
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
            assigned_client_ids: [],
            is_active: original.is_active,
            is_default: false,
        })

    if (error) {
        console.error('[duplicateFormTemplate] Error:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/forms')
    revalidatePath('/coach/members')
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
    revalidatePath('/coach/members')
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
    revalidatePath('/coach/members')
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
    revalidatePath('/coach/members')
    return { success: true }
}
