'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { revalidatePath } from 'next/cache'
import type { TrainingTemplate, CreateTemplateInput, StrengthStructure } from '@/types/templates'
import { resolveStrengthStructure } from '@/lib/training/strength-catalog'

async function validatedStrengthStructure(
    supabase: Awaited<ReturnType<typeof requireActiveCoachId>>['supabase'],
    structure: StrengthStructure
): Promise<StrengthStructure> {
    const { data, error } = await supabase
        .from('exercise_catalog')
        .select('id, name, primary_group')
        .eq('is_active', true)

    if (error) throw new Error('No se pudo consultar el catálogo de ejercicios.')

    const result = resolveStrengthStructure(structure, data ?? [])
    if (result.unresolved.length > 0) {
        const sample = result.unresolved.slice(0, 3).join(', ')
        throw new Error(`Selecciona un ejercicio del catálogo para: ${sample}${result.unresolved.length > 3 ? '...' : ''}`)
    }
    return result.structure
}

/**
 * Get all templates for the authenticated coach
 */
export async function getTemplates(type?: 'strength' | 'cardio'): Promise<TrainingTemplate[]> {
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch {
        return []
    }

    let query = supabase
        .from('training_templates')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

    if (type) {
        query = query.eq('type', type)
    }

    const { data, error } = await query

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
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    let structure = input.structure
    if (input.type === 'strength' && structure && 'days' in structure) {
        try {
            structure = await validatedStrengthStructure(supabase, structure)
        } catch (cause) {
            return { success: false, error: cause instanceof Error ? cause.message : 'No se pudo validar la plantilla.' }
        }
    }

    const { data, error } = await supabase
        .from('training_templates')
        .insert({
            coach_id: coachId,
            name: input.name,
            description: input.description || null,
            tags: input.tags || [],
            type: input.type, // Explicitly save the type
            structure: structure
                ? structure
                : input.type === 'cardio'
                    ? { blocks: [], description: '', trainingType: 'rodaje', notes: '' }
                    : { days: [], weeks: 4 },
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
 * Create a new draft cardio template immediately
 */
export async function createDraftCardioTemplate(): Promise<{
    success: boolean
    id?: string
    error?: string
}> {
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    const { data, error } = await supabase
        .from('training_templates')
        .insert({
            coach_id: coachId,
            name: 'Nueva Sesión',
            description: '',
            type: 'cardio',
            structure: { blocks: [], description: '', trainingType: 'rodaje', notes: '' },
            is_public: false,
        })
        .select('id')
        .single()

    if (error) {
        console.error('Error creating draft template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/templates')
    return { success: true, id: data.id }
}

/**
 * Delete a training template
 */
export async function deleteTemplate(templateId: string): Promise<{
    success: boolean
    error?: string
}> {
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: e.message }
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

/**
 * Get a specific template by ID
 */
export async function getTemplateById(templateId: string): Promise<TrainingTemplate | null> {
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch {
        return null
    }

    const { data, error } = await supabase
        .from('training_templates')
        .select('*')
        .eq('id', templateId)
        .eq('coach_id', coachId)
        .single()

    if (error) {
        console.error('Error fetching template:', error)
        return null
    }

    return data as TrainingTemplate
}

/**
 * Update a training template structure
 */
export async function updateTemplate(
    templateId: string,
    updates: Partial<TrainingTemplate>
): Promise<{
    success: boolean
    error?: string
}> {
    let supabase, coachId: string
    try {
        ({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    let structure = updates.structure
    if (structure && 'days' in structure) {
        try {
            structure = await validatedStrengthStructure(supabase, structure)
        } catch (cause) {
            return { success: false, error: cause instanceof Error ? cause.message : 'No se pudo validar la plantilla.' }
        }
    }

    // Prepare update data - ensure updated_at is refreshed
    const updateData = {
        ...updates,
        ...(structure ? { structure } : {}),
        updated_at: new Date().toISOString(),
    }

    // Remove immutable fields if present in updates
    delete (updateData as any).id
    delete (updateData as any).coach_id
    delete (updateData as any).created_at

    const { error } = await supabase
        .from('training_templates')
        .update(updateData)
        .eq('id', templateId)
        .eq('coach_id', coachId)

    if (error) {
        console.error('Error updating template:', error)
        return { success: false, error: error.message }
    }

    revalidatePath(`/coach/templates`)
    revalidatePath(`/coach/templates/${templateId}`)
    return { success: true }
}
