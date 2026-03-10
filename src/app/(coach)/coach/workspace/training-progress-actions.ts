'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface ProgramSummary {
    id: string
    name: string
    status: string
    totalWeeks: number
    effectiveFrom: string
    effectiveTo: string | null
}

export interface ProgressExerciseSet {
    weekIndex: number
    setIndex: number
    weightKg: number | null
    reps: number | null
    rir: number | null
    completed: boolean
    notes: string | null
}

export interface ProgressExercise {
    id: string
    name: string
    order: number
    prescribedSets: number | null
    prescribedReps: string | null
    prescribedRir: number | null
    /** Sets grouped by week_index */
    setsByWeek: Record<number, ProgressExerciseSet[]>
}

export interface ProgressDay {
    id: string
    name: string
    order: number
    exercises: ProgressExercise[]
}

export interface TrainingProgressData {
    program: ProgramSummary
    days: ProgressDay[]
    maxWeek: number
}

// ============================================================================
// Get programs for selector
// ============================================================================

export async function getClientProgramsForSelector(
    clientId: string
): Promise<{ success: boolean; programs?: ProgramSummary[]; error?: string }> {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from('training_programs')
            .select('id, name, status, total_weeks, effective_from, effective_to')
            .eq('client_id', clientId)
            .order('effective_from', { ascending: false })

        if (error) throw new Error(error.message)

        const programs: ProgramSummary[] = (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            totalWeeks: p.total_weeks,
            effectiveFrom: p.effective_from,
            effectiveTo: p.effective_to,
        }))

        return { success: true, programs }
    } catch (error: any) {
        console.error('[getClientProgramsForSelector] Error:', error.message)
        return { success: false, error: error.message }
    }
}

// ============================================================================
// Get full progression data for a program
// ============================================================================

export async function getTrainingProgressData(
    programId: string
): Promise<{ success: boolean; data?: TrainingProgressData; error?: string }> {
    const supabase = await createClient()

    try {
        // 1. Get program info
        const { data: programRow, error: progErr } = await supabase
            .from('training_programs')
            .select('id, name, status, total_weeks, effective_from, effective_to')
            .eq('id', programId)
            .single()

        if (progErr || !programRow) throw new Error(progErr?.message || 'Programa no encontrado')

        const program: ProgramSummary = {
            id: programRow.id,
            name: programRow.name,
            status: programRow.status,
            totalWeeks: programRow.total_weeks,
            effectiveFrom: programRow.effective_from,
            effectiveTo: programRow.effective_to,
        }

        // 2. Get days
        const { data: daysRaw, error: daysErr } = await supabase
            .from('training_days')
            .select('id, name, order_index')
            .eq('program_id', programId)
            .order('order_index', { ascending: true })

        if (daysErr) throw new Error(daysErr.message)

        // 3. Get exercises for all days
        const dayIds = (daysRaw || []).map((d: any) => d.id)
        const { data: exercisesRaw, error: exErr } = await supabase
            .from('training_exercises')
            .select('id, day_id, exercise_name, order_index, sets, reps, rir')
            .in('day_id', dayIds.length > 0 ? dayIds : ['__none__'])
            .order('order_index', { ascending: true })

        if (exErr) throw new Error(exErr.message)

        // 4. Get all sets for all exercises
        const exerciseIds = (exercisesRaw || []).map((e: any) => e.id)
        let setsRaw: any[] = []
        if (exerciseIds.length > 0) {
            const { data: sData, error: sErr } = await supabase
                .from('training_exercise_sets')
                .select('exercise_id, week_index, set_index, weight_kg, reps, rir, completed, notes')
                .in('exercise_id', exerciseIds)
                .order('set_index', { ascending: true })

            if (sErr) throw new Error(sErr.message)
            setsRaw = sData || []
        }

        // 5. Group sets by exercise_id → week_index
        const setsMap = new Map<string, Record<number, ProgressExerciseSet[]>>()
        let maxWeek = 0

        for (const s of setsRaw) {
            const exId = s.exercise_id as string
            const week = s.week_index as number

            if (week > maxWeek) maxWeek = week

            if (!setsMap.has(exId)) setsMap.set(exId, {})
            const byWeek = setsMap.get(exId)!
            if (!byWeek[week]) byWeek[week] = []

            byWeek[week].push({
                weekIndex: week,
                setIndex: s.set_index,
                weightKg: s.weight_kg != null ? Number(s.weight_kg) : null,
                reps: s.reps != null ? Number(s.reps) : null,
                rir: s.rir != null ? Number(s.rir) : null,
                completed: s.completed ?? false,
                notes: s.notes,
            })
        }

        // Use program totalWeeks if no sets exist
        if (maxWeek === 0) maxWeek = program.totalWeeks || 1

        // 6. Build day → exercise tree
        const exercisesByDay = new Map<string, ProgressExercise[]>()
        for (const e of (exercisesRaw || [])) {
            const dayId = e.day_id as string
            if (!exercisesByDay.has(dayId)) exercisesByDay.set(dayId, [])

            exercisesByDay.get(dayId)!.push({
                id: e.id,
                name: e.exercise_name || 'Ejercicio',
                order: e.order_index,
                prescribedSets: e.sets,
                prescribedReps: e.reps,
                prescribedRir: e.rir != null ? Number(e.rir) : null,
                setsByWeek: setsMap.get(e.id) || {},
            })
        }

        const days: ProgressDay[] = (daysRaw || []).map((d: any) => ({
            id: d.id,
            name: d.name || 'Día',
            order: d.order_index,
            exercises: exercisesByDay.get(d.id) || [],
        }))

        return { success: true, data: { program, days, maxWeek } }
    } catch (error: any) {
        console.error('[getTrainingProgressData] Error:', error.message)
        return { success: false, error: error.message }
    }
}
