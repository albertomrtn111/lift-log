'use server'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { sessionToTemplateDay, templateDayItems } from '@/lib/studio/copy-rules'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { resolveStrengthStructure } from '@/lib/training/strength-catalog'
import type { StrengthStructure } from '@/types/templates'

export type StudioResult<T = undefined> =
    | { success: true; data: T }
    | { success: false; error: string; conflict?: boolean }

export interface StudioTemplateOption {
    id: string
    name: string
    days: { id: string; name: string; items: Record<string, unknown>[]; skipped: number }[]
}

export interface StudioSetRow {
    set_index: number
    load_kg: number | null
    reps: number | null
    time_seconds: number | null
    rir: number | null
    rpe: number | null
    is_detailed: boolean
}

type RpcError = { code?: string; message?: string }

function failure(error: RpcError | null): { success: false; error: string; conflict?: boolean } {
    if (error?.code === 'NT409') {
        return {
            success: false,
            conflict: true,
            error: 'Otra persona ha cambiado esto. Ya tienes lo último: revísalo y vuelve a guardar.',
        }
    }
    if (error?.code === '42501') {
        return { success: false, error: 'No tienes permiso para hacer esto.' }
    }
    if (error?.code === '22023') {
        return { success: false, error: error.message ?? 'Revisa los datos.' }
    }
    return { success: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' }
}

export async function createSessionAction(input: {
    clientId: string
    date: string
    time: string | null
    professionalId: string | null
    name: string | null
}): Promise<StudioResult<{ id: string }>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_create_session', {
        p_client_id: input.clientId,
        p_session_date: input.date,
        p_start_time: input.time,
        p_professional_id: input.professionalId,
        p_name: input.name,
    })
    if (error) return failure(error)
    return { success: true, data: { id: data.id } }
}

export async function duplicateSessionAction(input: {
    sessionId: string
    date: string
    time: string | null
    professionalId: string | null
    name: string | null
}): Promise<StudioResult<{ id: string }>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_duplicate_session', {
        p_session_id: input.sessionId,
        p_session_date: input.date,
        p_start_time: input.time,
        p_professional_id: input.professionalId,
        p_name: input.name,
    })
    if (error) return failure(error)
    return { success: true, data: { id: data.id } }
}

export async function updateSessionAction(
    sessionId: string,
    version: number,
    patch: Record<string, unknown>
): Promise<StudioResult<{ version: number }>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_update_session', {
        p_session_id: sessionId,
        p_version: version,
        p_patch: patch,
    })
    if (error) return failure(error)
    return { success: true, data: { version: data.version } }
}

export async function deleteSessionAction(sessionId: string, version: number): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_delete_session', { p_session_id: sessionId, p_version: version })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function addItemAction(
    sessionId: string,
    catalogExerciseId: string,
    sectionId: string | null,
    defaults: { sets: number | null; reps: string | null }
): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_item', {
        p_session_id: sessionId,
        p_item_id: null,
        p_version: null,
        p_fields: { catalog_exercise_id: catalogExerciseId, section_id: sectionId, ...defaults },
    })
    return error ? failure(error) : { success: true, data: undefined }
}

/**
 * Guarda el editor de la celda en un solo lote: lo prescrito, Por series y el realizado.
 * `sets` ausente no toca las series; una lista vacía vuelve a las heredadas.
 */
export async function saveCellAction(input: {
    sessionId: string
    itemId: string | null
    version: number | null
    fields: Record<string, unknown>
    sets?: Record<string, number | null>[]
    done: boolean
}): Promise<StudioResult> {
    const supabase = await createClient()
    const batch = randomUUID()

    const saved = await supabase.rpc('studio_save_item', {
        p_session_id: input.sessionId,
        p_item_id: input.itemId,
        p_version: input.version,
        p_fields: input.fields,
        p_batch_id: batch,
    })
    if (saved.error) return failure(saved.error)
    let item = saved.data

    if (input.sets) {
        const details = await supabase.rpc('studio_save_sets', {
            p_item_id: item.id,
            p_version: item.version,
            p_sets: input.sets,
            p_batch_id: batch,
        })
        if (details.error) return failure(details.error)
        item = details.data
    }

    if (item.is_done !== input.done) {
        const done = await supabase.rpc('studio_set_item_done', {
            p_item_id: item.id,
            p_version: item.version,
            p_done: input.done,
            p_batch_id: batch,
        })
        if (done.error) return failure(done.error)
    }

    return { success: true, data: undefined }
}

export async function setItemDoneAction(itemId: string, version: number, done: boolean): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_item_done', {
        p_item_id: itemId,
        p_version: version,
        p_done: done,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function deleteItemAction(itemId: string, version: number): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_delete_item', { p_item_id: itemId, p_version: version })
    return error ? failure(error) : { success: true, data: undefined }
}

/** Deshace mi último cambio con este cliente, si nadie lo ha tocado después. */
export async function undoLastAction(clientId: string): Promise<StudioResult<{ status: 'undone' | 'nothing' | 'blocked' }>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_undo_last', { p_client_id: clientId })
    if (error) return failure(error)
    return { success: true, data }
}

export async function getItemSetsAction(itemId: string): Promise<StudioResult<StudioSetRow[]>> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('studio_session_sets')
        .select('set_index, load_kg, reps, time_seconds, rir, rpe, is_detailed')
        .eq('item_id', itemId)
        .order('set_index')
    if (error) return failure(error)
    return { success: true, data: (data ?? []) as StudioSetRow[] }
}

export async function saveSectionAction(
    sessionId: string,
    sectionId: string | null,
    title: string
): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_section', {
        p_session_id: sessionId,
        p_section_id: sectionId,
        p_title: title,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function deleteSectionAction(sectionId: string): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_delete_section', { p_section_id: sectionId })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function arrangeSessionAction(
    sessionId: string,
    sectionIds: string[],
    items: { id: string; section_id: string | null }[]
): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_arrange_session', {
        p_session_id: sessionId,
        p_section_ids: sectionIds,
        p_items: items,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function addItemsAction(
    sessionId: string,
    items: Record<string, unknown>[],
    options: { routineId?: string; origin?: 'copy' | 'template' } = {}
): Promise<StudioResult<{ added: number }>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_add_items', {
        p_session_id: sessionId,
        p_items: items,
        p_routine_id: options.routineId ?? null,
        p_origin: options.origin ?? null,
    })
    if (error) return failure(error)
    return { success: true, data: { added: data } }
}

export async function saveRoutineAction(input: {
    coachId: string
    routineId: string | null
    name: string
    kind: string
    clientId: string | null
    items: Record<string, unknown>[]
}): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_routine', {
        p_coach_id: input.coachId,
        p_routine_id: input.routineId,
        p_name: input.name,
        p_kind: input.kind,
        p_client_id: input.clientId,
        p_items: input.items,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function deleteRoutineAction(routineId: string): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_delete_routine', { p_routine_id: routineId })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function createRequestAction(input: {
    sessionId: string
    toUser: string | null
    title: string
    message: string
    items: Record<string, unknown>[]
}): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_create_request', {
        p_session_id: input.sessionId,
        p_to_user: input.toUser,
        p_title: input.title,
        p_message: input.message,
        p_items: input.items,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function setRequestStatusAction(requestId: string, status: 'pending' | 'done'): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_request_status', { p_request_id: requestId, p_status: status })
    return error ? failure(error) : { success: true, data: undefined }
}

/** Plantillas de fuerza del espacio, con cada día listo para añadirlo a una sesión. */
export async function getStudioTemplatesAction(): Promise<StudioResult<StudioTemplateOption[]>> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    const supabase = await createClient()
    const [{ data: templates, error }, { data: catalog }] = await Promise.all([
        supabase
            .from('training_templates')
            .select('id, name, structure')
            .eq('coach_id', coachId)
            .eq('type', 'strength')
            .order('name'),
        supabase.from('exercise_catalog').select('id, name, primary_group').eq('is_active', true),
    ])
    if (error) return failure(error)

    return {
        success: true,
        data: (templates ?? []).map(template => {
            const { structure } = resolveStrengthStructure(template.structure as StrengthStructure, catalog ?? [])
            return {
                id: template.id,
                name: template.name,
                days: (structure.days ?? []).map(day => {
                    const items = templateDayItems(day)
                    return {
                        id: day.id,
                        name: day.name,
                        items,
                        skipped: (day.exercises ?? []).length - items.length,
                    }
                }),
            }
        }),
    }
}

/** Convierte la ficha de una sesión en una plantilla de un día. */
export async function saveSessionAsTemplateAction(
    name: string,
    entries: Parameters<typeof sessionToTemplateDay>[1]
): Promise<StudioResult> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    const supabase = await createClient()
    const { data: catalog } = await supabase.from('exercise_catalog').select('id, name, primary_group').eq('is_active', true)
    const { structure } = resolveStrengthStructure(
        sessionToTemplateDay(name.trim(), entries, randomUUID) as StrengthStructure,
        catalog ?? []
    )
    const { error } = await supabase.from('training_templates').insert({
        coach_id: coachId,
        name: name.trim(),
        description: 'Guardada desde una sesión de sala.',
        tags: ['fuerza', 'sala'],
        type: 'strength',
        structure,
        is_public: false,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function setBlockCollapsedAction(clientId: string, blockKey: string, collapsed: boolean): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_block_collapsed', {
        p_client_id: clientId,
        p_block_key: blockKey,
        p_collapsed: collapsed,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function setBlockOrderAction(clientId: string, blockKeys: string[]): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_block_order', { p_client_id: clientId, p_block_keys: blockKeys })
    return error ? failure(error) : { success: true, data: undefined }
}

export async function setSectionParentAction(sectionId: string, parentTitle: string): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_set_section_parent', {
        p_section_id: sectionId,
        p_parent_title: parentTitle,
    })
    return error ? failure(error) : { success: true, data: undefined }
}
