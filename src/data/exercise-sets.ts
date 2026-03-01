'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ExerciseSet } from '@/types/training'

// ─── Reads ──────────────────────────────────────────────────────────

export async function getExerciseSets(
    exerciseId: string,
    weekIndex: number
): Promise<ExerciseSet[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_exercise_sets')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekIndex)
        .order('set_index', { ascending: true })

    if (error || !data) return []
    return data.map(mapRow)
}

export async function getAllSetsForProgram(
    exerciseIds: string[]
): Promise<ExerciseSet[]> {
    if (exerciseIds.length === 0) return []

    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_exercise_sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .order('set_index', { ascending: true })

    if (error || !data) return []
    return data.map(mapRow)
}

// ─── Base Block: Generate / Apply ───────────────────────────────────

/**
 * Generate or re-apply base block to all non-override sets.
 *
 * - If no sets exist → insert N sets with base values.
 * - If N increases   → add extra sets with base values.
 * - If N decreases   → delete excess non-override sets from the end.
 * - If base weight/reps change → update all sets where is_override=false.
 */
export async function generateOrApplySets(
    exerciseId: string,
    weekIndex: number,
    baseSeries: number,
    baseWeight: number | null,
    baseReps: number | null,
    baseRir: number | null
): Promise<{ success: boolean; sets?: ExerciseSet[]; error?: string }> {
    const supabase = await createClient()

    // Get current sets
    const { data: current } = await supabase
        .from('training_exercise_sets')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekIndex)
        .order('set_index', { ascending: true })

    const existing = current || []
    const currentCount = existing.length

    // 1. Update all non-override sets with new base values
    if (existing.length > 0) {
        const nonOverrideIds = existing.filter((s: any) => !s.is_override).map((s: any) => s.id)
        if (nonOverrideIds.length > 0) {
            await supabase
                .from('training_exercise_sets')
                .update({
                    weight_kg: baseWeight,
                    reps: baseReps,
                    rir: baseRir,
                    updated_at: new Date().toISOString(),
                })
                .in('id', nonOverrideIds)
        }
    }

    // 2. Add extra sets if N increased
    if (baseSeries > currentCount) {
        const toInsert = []
        for (let i = currentCount; i < baseSeries; i++) {
            toInsert.push({
                exercise_id: exerciseId,
                week_index: weekIndex,
                set_index: i,
                weight_kg: baseWeight,
                reps: baseReps,
                rir: baseRir,
                is_override: false,
                completed: false,
            })
        }
        await supabase.from('training_exercise_sets').insert(toInsert)
    }

    // 3. Delete excess sets if N decreased (only non-override from the end)
    if (baseSeries < currentCount) {
        const toDelete = existing
            .filter((s: any) => s.set_index >= baseSeries && !s.is_override)
            .map((s: any) => s.id)

        if (toDelete.length > 0) {
            await supabase
                .from('training_exercise_sets')
                .delete()
                .in('id', toDelete)
        }
    }

    // 4. Re-fetch final state
    const { data: final } = await supabase
        .from('training_exercise_sets')
        .select('*')
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekIndex)
        .order('set_index', { ascending: true })

    return { success: true, sets: (final || []).map(mapRow) }
}

// ─── Single Set Operations ──────────────────────────────────────────

/**
 * Update a single set and mark it as override
 */
export async function updateSingleSet(
    setId: string,
    payload: { weightKg?: number | null; reps?: number | null; rir?: number | null }
): Promise<{ success: boolean; set?: ExerciseSet; error?: string }> {
    const supabase = await createClient()

    const updateData: any = {
        is_override: true,
        updated_at: new Date().toISOString(),
    }
    if (payload.weightKg !== undefined) updateData.weight_kg = payload.weightKg
    if (payload.reps !== undefined) updateData.reps = payload.reps
    if (payload.rir !== undefined) updateData.rir = payload.rir

    const { data, error } = await supabase
        .from('training_exercise_sets')
        .update(updateData)
        .eq('id', setId)
        .select()
        .single()

    if (error) {
        console.error('[updateSingleSet] Error:', error.message)
        return { success: false, error: error.message }
    }

    return { success: true, set: mapRow(data) }
}

/**
 * Revert an override set back to base values
 */
export async function revertSetToBase(
    setId: string,
    baseWeight: number | null,
    baseReps: number | null,
    baseRir: number | null
): Promise<{ success: boolean; set?: ExerciseSet; error?: string }> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_exercise_sets')
        .update({
            weight_kg: baseWeight,
            reps: baseReps,
            rir: baseRir,
            is_override: false,
            updated_at: new Date().toISOString(),
        })
        .eq('id', setId)
        .select()
        .single()

    if (error) {
        console.error('[revertSetToBase] Error:', error.message)
        return { success: false, error: error.message }
    }

    return { success: true, set: mapRow(data) }
}

/**
 * Add one more set using base values
 */
export async function addSetFromBase(
    exerciseId: string,
    weekIndex: number,
    baseWeight: number | null,
    baseReps: number | null,
    baseRir: number | null
): Promise<{ success: boolean; set?: ExerciseSet; error?: string }> {
    const supabase = await createClient()

    // Get max set_index
    const { data: existing } = await supabase
        .from('training_exercise_sets')
        .select('set_index')
        .eq('exercise_id', exerciseId)
        .eq('week_index', weekIndex)
        .order('set_index', { ascending: false })
        .limit(1)

    const newIndex = (existing?.[0]?.set_index ?? -1) + 1

    const { data, error } = await supabase
        .from('training_exercise_sets')
        .insert({
            exercise_id: exerciseId,
            week_index: weekIndex,
            set_index: newIndex,
            weight_kg: baseWeight,
            reps: baseReps,
            rir: baseRir,
            is_override: false,
            completed: false,
        })
        .select()
        .single()

    if (error) {
        console.error('[addSetFromBase] Error:', error.message)
        return { success: false, error: error.message }
    }

    return { success: true, set: mapRow(data) }
}

/**
 * Delete a set
 */
export async function deleteExerciseSet(
    setId: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('training_exercise_sets')
        .delete()
        .eq('id', setId)

    if (error) {
        console.error('[deleteExerciseSet] Error:', error.message)
        return { success: false, error: error.message }
    }

    return { success: true }
}

// ─── Helpers ────────────────────────────────────────────────────────

function mapRow(row: any): ExerciseSet {
    return {
        id: row.id,
        exerciseId: row.exercise_id,
        weekNumber: row.week_index,
        setIndex: row.set_index,
        weightKg: row.weight_kg,
        reps: row.reps,
        rir: row.rir,
        completed: row.completed,
        isOverride: row.is_override ?? false,
        notes: row.notes,
    }
}
