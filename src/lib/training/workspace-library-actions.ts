'use server'

import { getCoachActor } from '@/lib/auth/get-coach-actor'
import { canManageTeam } from '@/lib/team/team-rules'
import {
    mergeBlocks,
    parseLibraryFields,
    sortEntries,
    sortOrderFor,
} from '@/lib/training/workspace-library-rules'

export interface LibraryEntry {
    id: string
    catalogExerciseId: string
    name: string
    primaryGroup: string
    blockKey: string | null
    shortName: string | null
    groupTitle: string | null
    defaultSets: number | null
    defaultReps: string | null
    sortOrder: number | null
    isHidden: boolean
}

export interface LibraryBlock {
    key: string
    name: string
    displayName: string
    groupTitle: string | null
    defaultSets: number | null
    defaultReps: string | null
    isHidden: boolean
    order: number
}

export interface LibraryData {
    canManage: boolean
    blocks: LibraryBlock[]
    entries: LibraryEntry[]
}

export interface ExerciseUsage {
    clients: { id: string; name: string; programs: number; completed_sets: number }[]
    templates: number
    similar: { id: string; name: string; inLibrary: boolean }[]
}

export interface LibraryFields {
    name?: string | null
    title?: string | null
    sets?: string | number | null
    reps?: string | null
    isHidden: boolean
}

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const NOT_ALLOWED = 'Solo el propietario y los administradores pueden cambiar la biblioteca.'

async function requireLibraryManager() {
    const actor = await getCoachActor()
    if (!canManageTeam(actor.role)) throw new Error(NOT_ALLOWED)
    return actor
}

function failure(cause: unknown, fallback: string): { success: false; error: string } {
    const message = cause instanceof Error ? cause.message : ''
    return { success: false, error: message === NOT_ALLOWED ? NOT_ALLOWED : fallback }
}

export async function getLibraryAction(): Promise<ActionResult<LibraryData>> {
    try {
        const { supabase, coachId, role } = await getCoachActor()
        const [entriesResult, blocksResult, overridesResult] = await Promise.all([
            supabase
                .from('workspace_exercises')
                .select('id, catalog_exercise_id, short_name, group_title, default_sets, default_reps, sort_order, is_hidden, exercise_catalog(name, primary_group, block_key)')
                .eq('coach_id', coachId),
            supabase.from('exercise_blocks').select('key, name, sort_order').eq('is_active', true),
            supabase
                .from('workspace_blocks')
                .select('block_key, display_name, group_title, default_sets, default_reps, sort_order, is_hidden')
                .eq('coach_id', coachId),
        ])
        if (entriesResult.error || blocksResult.error || overridesResult.error) {
            return { success: false, error: 'No se pudo cargar la biblioteca.' }
        }

        const entries = (entriesResult.data ?? []).map(row => {
            const embed = row.exercise_catalog as unknown as
                | { name: string; primary_group: string; block_key: string | null }
                | { name: string; primary_group: string; block_key: string | null }[]
                | null
            const catalog = Array.isArray(embed) ? embed[0] : embed
            return {
                id: row.id,
                catalogExerciseId: row.catalog_exercise_id,
                name: catalog?.name ?? '',
                primaryGroup: catalog?.primary_group ?? '',
                blockKey: catalog?.block_key ?? null,
                shortName: row.short_name,
                groupTitle: row.group_title,
                defaultSets: row.default_sets,
                defaultReps: row.default_reps,
                sortOrder: row.sort_order,
                isHidden: row.is_hidden,
            }
        })

        return {
            success: true,
            data: {
                canManage: canManageTeam(role),
                blocks: mergeBlocks(blocksResult.data ?? [], overridesResult.data ?? []),
                entries: sortEntries(entries),
            },
        }
    } catch (cause) {
        return failure(cause, 'No se pudo cargar la biblioteca.')
    }
}

// Cualquier profesional del espacio puede añadir. Si ya estaba, no cambia nada.
export async function addToLibraryAction(catalogExerciseId: string): Promise<ActionResult> {
    try {
        const { supabase, coachId, userId } = await getCoachActor()
        const { error } = await supabase
            .from('workspace_exercises')
            .upsert(
                { coach_id: coachId, catalog_exercise_id: catalogExerciseId, added_by: userId },
                { onConflict: 'coach_id,catalog_exercise_id', ignoreDuplicates: true }
            )
        return error ? { success: false, error: 'No se pudo añadir a la biblioteca.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo añadir a la biblioteca.')
    }
}

// Añade varios ejercicios de golpe. Lo que ya estaba no cambia.
export async function addManyToLibraryAction(catalogExerciseIds: string[]): Promise<ActionResult> {
    if (catalogExerciseIds.length === 0) return { success: true }
    try {
        const { supabase, coachId, userId } = await getCoachActor()
        const { error } = await supabase
            .from('workspace_exercises')
            .upsert(
                catalogExerciseIds.map(id => ({ coach_id: coachId, catalog_exercise_id: id, added_by: userId })),
                { onConflict: 'coach_id,catalog_exercise_id', ignoreDuplicates: true }
            )
        return error ? { success: false, error: 'No se pudieron añadir los ejercicios.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudieron añadir los ejercicios.')
    }
}

export async function updateLibraryEntryAction(entryId: string, fields: LibraryFields): Promise<ActionResult> {
    const parsed = parseLibraryFields(fields)
    if ('error' in parsed) return { success: false, error: parsed.error }
    try {
        const { supabase, coachId } = await requireLibraryManager()
        const { error } = await supabase
            .from('workspace_exercises')
            .update({
                short_name: parsed.values.name,
                group_title: parsed.values.title,
                default_sets: parsed.values.sets,
                default_reps: parsed.values.reps,
                is_hidden: fields.isHidden,
            })
            .eq('id', entryId)
            .eq('coach_id', coachId)
        return error ? { success: false, error: 'No se pudo guardar.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo guardar.')
    }
}

export async function updateLibraryBlockAction(blockKey: string, fields: LibraryFields): Promise<ActionResult> {
    const parsed = parseLibraryFields(fields)
    if ('error' in parsed) return { success: false, error: parsed.error }
    try {
        const { supabase, coachId } = await requireLibraryManager()
        const { error } = await supabase
            .from('workspace_blocks')
            .upsert(
                {
                    coach_id: coachId,
                    block_key: blockKey,
                    display_name: parsed.values.name,
                    group_title: parsed.values.title,
                    default_sets: parsed.values.sets,
                    default_reps: parsed.values.reps,
                    is_hidden: fields.isHidden,
                },
                { onConflict: 'coach_id,block_key' }
            )
        return error ? { success: false, error: 'No se pudo guardar.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo guardar.')
    }
}

export async function reorderLibraryEntriesAction(entryIds: string[]): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireLibraryManager()
        const results = await Promise.all(entryIds.map((id, index) =>
            supabase
                .from('workspace_exercises')
                .update({ sort_order: sortOrderFor(index) })
                .eq('id', id)
                .eq('coach_id', coachId)
        ))
        return results.some(result => result.error)
            ? { success: false, error: 'No se pudo guardar el orden.' }
            : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo guardar el orden.')
    }
}

export async function reorderLibraryBlocksAction(blockKeys: string[]): Promise<ActionResult> {
    try {
        const { supabase, coachId } = await requireLibraryManager()
        const { error } = await supabase
            .from('workspace_blocks')
            .upsert(
                blockKeys.map((blockKey, index) => ({
                    coach_id: coachId,
                    block_key: blockKey,
                    sort_order: sortOrderFor(index),
                })),
                { onConflict: 'coach_id,block_key' }
            )
        return error ? { success: false, error: 'No se pudo guardar el orden.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo guardar el orden.')
    }
}

// Qué pasa si se quita un ejercicio: clientes con datos, plantillas y ejercicios parecidos.
export async function getExerciseUsageAction(entry: LibraryEntry): Promise<ActionResult<ExerciseUsage>> {
    try {
        const { supabase, coachId } = await requireLibraryManager()
        const [usageResult, similarResult, libraryResult] = await Promise.all([
            supabase.rpc('workspace_exercise_usage', { p_entry_id: entry.id }),
            supabase.rpc('find_similar_catalog_exercises', {
                p_name: entry.name,
                p_block_key: entry.blockKey,
                p_limit: 6,
            }),
            supabase.from('workspace_exercises').select('catalog_exercise_id').eq('coach_id', coachId),
        ])
        if (usageResult.error) return { success: false, error: 'No se pudo comprobar qué datos hay.' }

        const inLibrary = new Set((libraryResult.data ?? []).map(row => row.catalog_exercise_id))
        const similar = ((similarResult.data ?? []) as { id: string; name: string }[])
            .filter(match => match.id !== entry.catalogExerciseId)
            .map(match => ({ id: match.id, name: match.name, inLibrary: inLibrary.has(match.id) }))
            .sort((a, b) => Number(b.inLibrary) - Number(a.inLibrary))
            .slice(0, 4)

        return { success: true, data: { ...(usageResult.data as Omit<ExerciseUsage, 'similar'>), similar } }
    } catch (cause) {
        return failure(cause, 'No se pudo comprobar qué datos hay.')
    }
}

export async function removeFromLibraryAction(entryId: string, targetCatalogId: string | null): Promise<ActionResult> {
    try {
        const { supabase } = await requireLibraryManager()
        const { error } = await supabase.rpc('remove_workspace_exercise', {
            p_entry_id: entryId,
            p_target_catalog_id: targetCatalogId,
        })
        return error ? { success: false, error: 'No se pudo quitar el ejercicio.' } : { success: true }
    } catch (cause) {
        return failure(cause, 'No se pudo quitar el ejercicio.')
    }
}
