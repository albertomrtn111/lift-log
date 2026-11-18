'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { normalizeMuscleGroup } from '@/lib/training/muscle-groups'
import { planStrengthStructure } from '@/lib/training/strength-structure-plan'
import { planNormalizeOrder } from '@/lib/training/supersets'
import { loadStrengthResults, type StrengthResultConflict } from '@/lib/training/strength-results-data'
import type { StrengthStructure } from '@/types/templates'

export type ApplyStrengthStructureResult =
    | {
        success: true
        days: { id: string; name: string; default_weekday: number | null }[]
        dayCount: number
        exerciseCount: number
        keptExercises: number
        keptDays: number
    }
    | { success: false; needsDecision: true; conflicts: StrengthResultConflict[] }
    | { success: false; needsDecision?: false; error: string }

function toNumberOrNull(value: unknown) {
    if (value == null || value === '') return null
    const parsed = Number(String(value).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
}

function exerciseFields(source: Record<string, any>) {
    return {
        exercise_name: source.exercise_name || '',
        catalog_exercise_id: source.catalog_exercise_id ?? null,
        muscle_group: normalizeMuscleGroup(source.muscle_group),
        sets: source.sets ?? 3,
        reps: source.reps ?? '10',
        rir: toNumberOrNull(source.rir),
        rest_seconds: source.rest_seconds ?? 60,
        notes: source.notes || null,
        // Superseries (NXT-121): la clave viaja con el ejercicio de la plantilla. Si la propuesta no
        // dice nada (la IA aún no propone superseries), el ejercicio que sigue conserva la suya.
        ...(source.superset_key !== undefined ? { superset_key: source.superset_key ?? null } : {}),
    }
}

function firstError(results: { error: { message: string } | null }[]) {
    return results.find(result => result.error)?.error ?? null
}

/**
 * Aplica una estructura (IA o plantilla) sobre un programa sin recrearlo (NXT-124).
 *
 * Lo que sigue conserva su id, y con él sus series, registros y sesiones. Si algo
 * que sobra tiene resultados del atleta, no se escribe nada y se devuelven los
 * conflictos para que el coach elija:
 * - decision 'keep': se aplican los cambios y eso se conserva (al final de su día).
 * - decision 'delete' + confirmedDeleteIds: se quita lo confirmado. Si mientras
 *   tanto aparece otro conflicto, se vuelve a preguntar.
 * Lo último que se hace es quitar.
 */
export async function applyStrengthStructureAction(input: {
    programId: string
    structure: StrengthStructure
    programName?: string | null
    decision?: 'keep' | 'delete'
    confirmedDeleteIds?: string[]
}): Promise<ApplyStrengthStructureResult> {
    const supabase = await createClient()
    const { programId, structure, programName, decision } = input

    try {
        const { data: program, error: programError } = await supabase
            .from('training_programs')
            .select('id, coach_id')
            .eq('id', programId)
            .single()
        if (programError || !program) return { success: false, error: 'Programa no encontrado.' }

        const [daysQuery, exercisesQuery] = await Promise.all([
            supabase.from('training_days').select('id, name, order_index, default_weekday, created_at').eq('program_id', programId),
            supabase.from('training_exercises').select('id, day_id, exercise_name, catalog_exercise_id, order_index, created_at').eq('program_id', programId),
        ])
        if (daysQuery.error) return { success: false, error: daysQuery.error.message }
        if (exercisesQuery.error) return { success: false, error: exercisesQuery.error.message }
        const currentDays = daysQuery.data ?? []
        const currentExercises = exercisesQuery.data ?? []

        const results = await loadStrengthResults(supabase, programId, currentExercises.map(exercise => exercise.id))
        const plan = planStrengthStructure({
            currentDays,
            currentExercises,
            structure,
            results,
            deleteConfirmedIds: decision === 'delete' ? input.confirmedDeleteIds ?? [] : [],
        })

        if (plan.conflicts.length > 0 && decision !== 'keep') {
            return { success: false, needsDecision: true, conflicts: plan.conflicts as StrengthResultConflict[] }
        }

        const coachId = program.coach_id
        const now = new Date().toISOString()

        // 1. Días: los que siguen se renombran y reordenan; los nuevos se crean.
        const dayIds = plan.days.map(day => day.existingId ?? randomUUID())
        const dayUpdates = await Promise.all(plan.days.flatMap(day => day.existingId
            ? [supabase.from('training_days').update({
                name: day.name, day_name: day.name, order_index: day.order_index, day_order: day.order_index,
            }).eq('id', day.existingId)]
            : []))
        const newDayRows = plan.days.flatMap((day, index) => day.existingId ? [] : [{
            id: dayIds[index],
            program_id: programId,
            coach_id: coachId,
            name: day.name,
            day_name: day.name,
            order_index: day.order_index,
            day_order: day.order_index,
            default_weekday: null,
        }])
        const dayInsert = newDayRows.length > 0
            ? await supabase.from('training_days').insert(newDayRows)
            : { error: null }
        const keptDayUpdates = await Promise.all(plan.keptDays.map(day =>
            supabase.from('training_days').update({ order_index: day.order_index, day_order: day.order_index }).eq('id', day.id)))
        const dayError = firstError([...dayUpdates, dayInsert, ...keptDayUpdates])
        if (dayError) return { success: false, error: `No se pudieron guardar los días: ${dayError.message}` }

        // 2. Ejercicios: los que siguen se actualizan; los nuevos se crean; los conservados van al final.
        const exerciseUpdates = await Promise.all(plan.days.flatMap(day => [
            ...day.exercises.flatMap(exercise => exercise.existingId
                ? [supabase.from('training_exercises').update({
                    ...exerciseFields(exercise.source),
                    order_index: exercise.order_index,
                    updated_at: now,
                }).eq('id', exercise.existingId)]
                : []),
            ...day.keptExercises.map(exercise =>
                supabase.from('training_exercises').update({ order_index: exercise.order_index, updated_at: now }).eq('id', exercise.id)),
        ]))
        const newExerciseRows = plan.days.flatMap((day, index) => day.exercises.flatMap(exercise => exercise.existingId ? [] : [{
            id: randomUUID(),
            program_id: programId,
            coach_id: coachId,
            day_id: dayIds[index],
            ...exerciseFields(exercise.source),
            order_index: exercise.order_index,
        }]))
        const exerciseInsert = newExerciseRows.length > 0
            ? await supabase.from('training_exercises').insert(newExerciseRows)
            : { error: null }
        const exerciseError = firstError([...exerciseUpdates, exerciseInsert])
        if (exerciseError) return { success: false, error: `No se pudieron guardar los ejercicios: ${exerciseError.message}` }

        // 3. Programa: semanas y nombre si vienen.
        const programUpdate: Record<string, unknown> = { updated_at: now }
        if (structure.weeks) programUpdate.weeks = structure.weeks
        if (programName?.trim()) programUpdate.name = programName.trim()
        const { error: updateProgramError } = await supabase.from('training_programs').update(programUpdate).eq('id', programId)
        if (updateProgramError) return { success: false, error: updateProgramError.message }

        // 4. Por último, quitar lo que sobra (sin resultados o confirmado por el coach).
        if (plan.deleteExerciseIds.length > 0) {
            const { error } = await supabase.from('training_exercises').delete().in('id', plan.deleteExerciseIds)
            if (error) return { success: false, error: `No se pudieron quitar ejercicios: ${error.message}` }
        }
        if (plan.deleteDayIds.length > 0) {
            const { error } = await supabase.from('training_days').delete().in('id', plan.deleteDayIds)
            if (error) return { success: false, error: `No se pudieron quitar días: ${error.message}` }
        }

        // 5. Superseries: un ejercicio conservado al final o separado de su bloque deja de estarlo.
        const { data: finalExercises } = await supabase
            .from('training_exercises')
            .select('id, day_id, order_index, superset_key, rest_seconds, created_at')
            .eq('program_id', programId)
        const exercisesByDay = new Map<string, any[]>()
        for (const exercise of finalExercises ?? []) {
            const list = exercisesByDay.get(exercise.day_id) ?? []
            list.push(exercise)
            exercisesByDay.set(exercise.day_id, list)
        }
        const supersetFixes = [...exercisesByDay.values()].flatMap(list => planNormalizeOrder(
            list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))),
        ).updates)
        if (supersetFixes.length > 0) {
            await Promise.all(supersetFixes.map(({ id, ...fields }) =>
                supabase.from('training_exercises').update({ ...fields, updated_at: now }).eq('id', id)))
        }

        const { data: finalDays, error: finalDaysError } = await supabase
            .from('training_days')
            .select('id, name, default_weekday, order_index')
            .eq('program_id', programId)
            .order('order_index', { ascending: true })
        if (finalDaysError) return { success: false, error: finalDaysError.message }

        revalidatePath('/coach/clients')
        return {
            success: true,
            days: (finalDays ?? []).map(day => ({ id: day.id, name: day.name ?? 'Día', default_weekday: day.default_weekday ?? null })),
            dayCount: plan.days.length,
            exerciseCount: plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
            keptExercises: plan.days.reduce((sum, day) => sum + day.keptExercises.length, 0),
            keptDays: plan.keptDays.length,
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Error inesperado al aplicar los cambios.' }
    }
}
