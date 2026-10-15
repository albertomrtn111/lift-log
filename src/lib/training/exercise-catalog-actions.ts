'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATALOG_GROUPS, type CatalogExercise } from '@/lib/training/exercise-catalog'

type CreateCatalogExerciseResult =
    | { success: true; exercise: CatalogExercise; existed: boolean }
    | { success: false; error: string }

// Alta en el catálogo común: visible para todos los entrenadores en cuanto se crea.
export async function createCatalogExerciseAction(input: {
    name: string
    primaryGroup: string
}): Promise<CreateCatalogExerciseResult> {
    try {
        await requireActiveCoachId()
    } catch {
        return { success: false, error: 'Solo los entrenadores pueden crear ejercicios.' }
    }

    const name = input.name.replace(/\s+/g, ' ').trim()
    if (name.length < 3 || name.length > 80) {
        return { success: false, error: 'El nombre debe tener entre 3 y 80 caracteres.' }
    }
    if (!(CATALOG_GROUPS as readonly string[]).includes(input.primaryGroup)) {
        return { success: false, error: 'Selecciona un grupo muscular válido.' }
    }

    // Escribe con la clave de servicio: exercise_catalog solo tiene política de lectura para usuarios.
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('exercise_catalog')
        .insert({ name, primary_group: input.primaryGroup })
        .select('id, name, primary_group')
        .single()

    if (!error && data) return { success: true, exercise: data, existed: false }

    // Índice único sobre lower(name): si ya existe, devolvemos el existente en vez de duplicar.
    if (error?.code === '23505') {
        const { data: existing } = await admin
            .from('exercise_catalog')
            .select('id, name, primary_group')
            .ilike('name', name.replace(/[%_\\]/g, '\\$&'))
            .eq('is_active', true)
            .maybeSingle()
        if (existing) return { success: true, exercise: existing, existed: true }
    }

    return { success: false, error: 'No se pudo crear el ejercicio.' }
}
