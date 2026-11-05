'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATALOG_COLUMNS, CATALOG_GROUPS, type CatalogExercise } from '@/lib/training/exercise-catalog'
import {
    cleanExerciseName,
    pickPossibleDuplicate,
    validateNewExercise,
} from '@/lib/training/exercise-catalog-rules'
import { addToLibraryAction } from '@/lib/training/workspace-library-actions'

type CreateCatalogExerciseResult =
    | { success: true; exercise: CatalogExercise; existed: boolean }
    | { success: false; error: string }

// Alta en el catálogo común: visible para todos los entrenadores en cuanto se crea,
// y dentro de la biblioteca del espacio que lo crea.
export async function createCatalogExerciseAction(input: {
    name: string
    primaryGroup: string
    blockKey: string
    laterality: string
    equipment?: string[]
}): Promise<CreateCatalogExerciseResult> {
    let auth: Awaited<ReturnType<typeof requireActiveCoachId>>
    try {
        auth = await requireActiveCoachId()
    } catch {
        return { success: false, error: 'Solo los entrenadores pueden crear ejercicios.' }
    }

    const name = cleanExerciseName(input.name)
    const equipment = input.equipment ?? []
    const invalid = validateNewExercise({ name, laterality: input.laterality, equipment })
    if (invalid) return { success: false, error: invalid }
    if (!(CATALOG_GROUPS as readonly string[]).includes(input.primaryGroup)) {
        return { success: false, error: 'Selecciona un grupo muscular válido.' }
    }
    if (!input.blockKey) return { success: false, error: 'Selecciona un bloque.' }

    const { data: matches, error: matchError } = await auth.supabase.rpc('find_similar_catalog_exercises', {
        p_name: name,
        p_block_key: input.blockKey,
        p_limit: 5,
    })
    if (matchError) return { success: false, error: 'No se pudo comprobar el catálogo.' }

    // Escribe con la clave de servicio: exercise_catalog solo tiene política de lectura para usuarios.
    const admin = createAdminClient()
    const findExisting = async (id: string) => {
        const { data } = await admin.from('exercise_catalog').select(CATALOG_COLUMNS).eq('id', id).maybeSingle()
        return data as CatalogExercise | null
    }

    // El mismo nombre o un alias ya conocido no crea otro ejercicio.
    const exact = (matches ?? []).find((match: { exact: boolean }) => match.exact)
    if (exact) {
        const existing = await findExisting(exact.id)
        if (existing) {
            await addToLibraryAction(existing.id)
            return { success: true, exercise: existing, existed: true }
        }
    }

    const { data, error } = await admin
        .from('exercise_catalog')
        .insert({
            name,
            primary_group: input.primaryGroup,
            block_key: input.blockKey,
            laterality: input.laterality,
            equipment,
            created_by: auth.userId,
            possible_duplicate_of: pickPossibleDuplicate(matches)?.id ?? null,
        })
        .select(CATALOG_COLUMNS)
        .single()

    if (!error && data) {
        const exercise = data as CatalogExercise
        await addToLibraryAction(exercise.id)
        return { success: true, exercise, existed: false }
    }
    if (error?.code === '23503') return { success: false, error: 'Selecciona un bloque válido.' }

    // Dos personas creando el mismo nombre a la vez: gana el índice único sobre lower(name).
    if (error?.code === '23505') {
        const { data: existing } = await admin
            .from('exercise_catalog')
            .select(CATALOG_COLUMNS)
            .ilike('name', name.replace(/[%_\\]/g, '\\$&'))
            .eq('is_active', true)
            .maybeSingle()
        if (existing) {
            await addToLibraryAction((existing as CatalogExercise).id)
            return { success: true, exercise: existing as CatalogExercise, existed: true }
        }
    }

    return { success: false, error: 'No se pudo crear el ejercicio.' }
}
