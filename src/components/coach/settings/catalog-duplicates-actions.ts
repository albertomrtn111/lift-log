'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface DuplicateExercise {
    id: string
    name: string
    primaryGroup: string
    blockName: string | null
    uses: number
}

export interface DuplicatePair {
    created: DuplicateExercise
    existing: DuplicateExercise
    createdBy: string | null
}

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }

const NOT_ALLOWED = 'Solo el equipo de NexTrain puede revisar los duplicados.'

async function isPlatformAdmin() {
    const supabase = await createClient()
    const { data } = await supabase.rpc('is_platform_admin')
    return data === true
}

export async function getCatalogDuplicatesAction(): Promise<ActionResult<DuplicatePair[]>> {
    if (!(await isPlatformAdmin())) return { success: false, error: NOT_ALLOWED }

    // Clave de servicio: el número de usos es de todos los espacios.
    const admin = createAdminClient()
    const columns = 'id, name, primary_group, created_by, possible_duplicate_of, exercise_blocks(name)'
    const { data: flagged, error } = await admin
        .from('exercise_catalog')
        .select(columns)
        .eq('is_active', true)
        .not('possible_duplicate_of', 'is', null)
        .order('created_at', { ascending: false })
    if (error) return { success: false, error: 'No se pudo cargar la lista.' }
    if (!flagged?.length) return { success: true, data: [] }

    const { data: others } = await admin
        .from('exercise_catalog')
        .select(columns)
        .in('id', flagged.map(row => row.possible_duplicate_of as string))
    const othersById = new Map((others ?? []).map(row => [row.id, row]))

    const toExercise = async (row: (typeof flagged)[number]): Promise<DuplicateExercise> => {
        const { count } = await admin
            .from('training_exercises')
            .select('id', { count: 'exact', head: true })
            .eq('catalog_exercise_id', row.id)
        const block = row.exercise_blocks as { name: string } | { name: string }[] | null
        return {
            id: row.id,
            name: row.name,
            primaryGroup: row.primary_group,
            blockName: (Array.isArray(block) ? block[0]?.name : block?.name) ?? null,
            uses: count ?? 0,
        }
    }

    const authorIds = Array.from(new Set(flagged.map(row => row.created_by).filter(Boolean))) as string[]
    const { data: authors } = authorIds.length
        ? await admin.from('profiles').select('id, full_name').in('id', authorIds)
        : { data: [] }
    const authorNames = new Map((authors ?? []).map(author => [author.id, author.full_name as string | null]))

    const pairs = await Promise.all(flagged.map(async row => {
        const other = othersById.get(row.possible_duplicate_of as string)
        if (!other) return null
        return {
            created: await toExercise(row),
            existing: await toExercise(other),
            createdBy: authorNames.get(row.created_by as string) ?? null,
        }
    }))

    return { success: true, data: pairs.filter((pair): pair is DuplicatePair => pair !== null) }
}

// El duplicado desaparece y su historial, plantillas y alias pasan al ejercicio que se queda.
export async function mergeCatalogExercisesAction(sourceId: string, targetId: string): Promise<ActionResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('merge_catalog_exercise', {
        p_source_id: sourceId,
        p_target_id: targetId,
    })
    if (!error) return { success: true }
    return { success: false, error: error.code === '42501' ? NOT_ALLOWED : error.message }
}

export async function dismissCatalogDuplicateAction(exerciseId: string): Promise<ActionResult> {
    if (!(await isPlatformAdmin())) return { success: false, error: NOT_ALLOWED }
    const { error } = await createAdminClient()
        .from('exercise_catalog')
        .update({ possible_duplicate_of: null })
        .eq('id', exerciseId)
    return error ? { success: false, error: 'No se pudo guardar.' } : { success: true }
}
