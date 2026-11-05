import { createClient } from '@/lib/supabase/client'
import {
    CATALOG_COLUMNS,
    normalizeExerciseName,
    type CatalogBlock,
    type CatalogExercise,
} from '@/lib/training/exercise-catalog'

export async function loadExerciseCatalog(): Promise<CatalogExercise[]> {
    const supabase = createClient()
    const [catalogResult, aliasResult] = await Promise.all([
        supabase
            .from('exercise_catalog')
            .select(CATALOG_COLUMNS)
            .eq('is_active', true)
            .order('name', { ascending: true }),
        supabase
            .from('exercise_catalog_aliases')
            .select('alias, catalog_exercise_id'),
    ])

    if (catalogResult.error) throw new Error(catalogResult.error.message)
    // Los alias son una ayuda: si fallan, el catálogo sigue funcionando por nombre exacto.
    const aliasesByExercise = new Map<string, string[]>()
    for (const row of aliasResult.data ?? []) {
        const list = aliasesByExercise.get(row.catalog_exercise_id) ?? []
        list.push(normalizeExerciseName(row.alias))
        aliasesByExercise.set(row.catalog_exercise_id, list)
    }

    return (catalogResult.data ?? []).map(exercise => ({
        ...exercise,
        aliases: aliasesByExercise.get(exercise.id) ?? [],
    }))
}

export async function loadExerciseBlocks(): Promise<CatalogBlock[]> {
    const { data, error } = await createClient()
        .from('exercise_blocks')
        .select('key, name, category, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    if (error) throw new Error(error.message)
    return data ?? []
}

export interface SimilarCatalogExercise {
    id: string
    name: string
    primary_group: string
    block_key: string | null
    exact: boolean
    score: number
}

// Ejercicios parecidos para avisar antes de crear uno. Es una ayuda: si falla, no hay aviso.
export async function findSimilarExercises(name: string, blockKey: string | null): Promise<SimilarCatalogExercise[]> {
    const { data, error } = await createClient().rpc('find_similar_catalog_exercises', {
        p_name: name,
        p_block_key: blockKey,
        p_limit: 4,
    })
    return error ? [] : ((data ?? []) as SimilarCatalogExercise[])
}

export interface LibrarySummaryEntry {
    catalog_exercise_id: string
    short_name: string | null
    is_hidden: boolean
}

// Lo justo de la biblioteca para el selector de ejercicios. Un bloque oculto oculta sus ejercicios.
export async function loadWorkspaceLibrary(): Promise<LibrarySummaryEntry[]> {
    const supabase = createClient()
    const [entries, hiddenBlocks] = await Promise.all([
        supabase.from('workspace_exercises').select('catalog_exercise_id, short_name, is_hidden'),
        supabase.from('workspace_blocks').select('block_key').eq('is_hidden', true),
    ])
    if (entries.error) throw new Error(entries.error.message)
    if (!hiddenBlocks.data?.length) return entries.data ?? []

    const { data: hiddenExercises } = await supabase
        .from('exercise_catalog')
        .select('id')
        .in('block_key', hiddenBlocks.data.map(block => block.block_key))
    const hiddenIds = new Set((hiddenExercises ?? []).map(exercise => exercise.id))

    return (entries.data ?? []).map(entry => ({
        ...entry,
        is_hidden: entry.is_hidden || hiddenIds.has(entry.catalog_exercise_id),
    }))
}
