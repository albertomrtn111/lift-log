import { createClient } from '@/lib/supabase/client'
import { normalizeExerciseName, type CatalogExercise } from '@/lib/training/exercise-catalog'

export async function loadExerciseCatalog(): Promise<CatalogExercise[]> {
    const supabase = createClient()
    const [catalogResult, aliasResult] = await Promise.all([
        supabase
            .from('exercise_catalog')
            .select('id, name, primary_group')
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
