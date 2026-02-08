import { createClient } from '@/lib/supabase/server'
import type { TrainingProgram, TrainingDay, TrainingColumn, TrainingExercise, TrainingCell, TrainingProgramFull } from '@/types/training'

export interface DBTrainingProgram {
    id: string
    client_id: string
    name: string
    total_weeks: number
    effective_from: string
    effective_to?: string
    status: 'draft' | 'active' | 'completed'
    created_at: string
}

/**
 * Get all training programs for a client
 */
export async function getPrograms(clientId: string): Promise<DBTrainingProgram[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_programs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })

    if (error || !data) return []
    return data
}

/**
 * Get active program for a client
 */
export async function getActiveProgram(clientId: string): Promise<DBTrainingProgram | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_programs')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)

    if (error || !data || data.length === 0) return null
    return data[0]
}

/**
 * Get training days for a program
 */
export async function getTrainingDays(programId: string): Promise<TrainingDay[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_days')
        .select('*')
        .eq('program_id', programId)
        .order('order', { ascending: true })

    if (error || !data) return []
    return data.map(d => ({
        id: d.id,
        name: d.name,
        order: d.order,
    }))
}

/**
 * Get columns for a program
 */
export async function getTrainingColumns(programId: string): Promise<TrainingColumn[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_columns')
        .select('*')
        .eq('program_id', programId)
        .order('order', { ascending: true })

    if (error || !data) return []
    return data.map(c => ({
        id: c.id,
        label: c.label,
        type: c.type,
        scope: c.scope,
        editable: c.editable_by === 'client' || c.editable_by === 'both',
        order: c.order,
    }))
}

/**
 * Get exercises for a training day
 */
export async function getTrainingExercises(dayId: string): Promise<TrainingExercise[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_exercises')
        .select('*')
        .eq('day_id', dayId)
        .order('order', { ascending: true })

    if (error || !data) return []
    return data.map(e => ({
        id: e.id,
        dayId: e.day_id,
        name: e.name,
        order: e.order,
    }))
}

/**
 * Get cells for a program and week
 */
export async function getTrainingCells(programId: string, weekIndex?: number): Promise<TrainingCell[]> {
    const supabase = await createClient()

    let query = supabase
        .from('training_cells')
        .select('*')
        .eq('program_id', programId)

    if (weekIndex !== undefined) {
        query = query.eq('week_index', weekIndex)
    }

    const { data, error } = await query

    if (error || !data) return []
    return data.map(c => ({
        id: c.id,
        exerciseId: c.exercise_id,
        columnId: c.column_id,
        weekNumber: c.week_index,
        value: c.value,
    }))
}

export interface CreateProgramInput {
    coach_id: string
    client_id: string
    name: string
    weeks: number
    effective_from: string
    effective_to?: string
}

/**
 * Create a new training program (draft status)
 */
export async function createProgram(input: CreateProgramInput): Promise<DBTrainingProgram | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('training_programs')
        .insert({
            ...input,
            status: 'draft',
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating program:', error)
        return null
    }

    return data
}

/**
 * Activate a program (set status to active)
 */
export async function activateProgram(programId: string): Promise<boolean> {
    const supabase = await createClient()

    // First, deactivate any other active programs for this client
    const { data: program } = await supabase
        .from('training_programs')
        .select('client_id')
        .eq('id', programId)
        .single()

    if (program) {
        await supabase
            .from('training_programs')
            .update({ status: 'archived' })
            .eq('client_id', program.client_id)
            .eq('status', 'active')
    }

    // Activate this program
    const { error } = await supabase
        .from('training_programs')
        .update({ status: 'active', effective_from: new Date().toISOString().split('T')[0] })
        .eq('id', programId)

    return !error
}

export interface CreateColumnInput {
    program_id: string
    coach_id: string
    label: string
    data_type: 'text' | 'number' | 'time' | 'textarea'
    scope: 'exercise' | 'cell'
    editable_by: 'coach' | 'client' | 'both'
    order_index: number
    key: string
}

/**
 * Create a new column (coach only)
 */
export async function createColumn(input: CreateColumnInput): Promise<boolean> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('training_columns')
        .insert(input)

    return !error
}

/**
 * Save a training cell value
 */
export async function saveCell(
    programId: string,
    coachId: string,
    dayId: string,
    exerciseId: string,
    columnId: string,
    weekIndex: number,
    value: string
): Promise<boolean> {
    const supabase = await createClient()

    // Upsert the cell
    const { error } = await supabase
        .from('training_cells')
        .upsert({
            program_id: programId,
            coach_id: coachId,
            day_id: dayId,
            exercise_id: exerciseId,
            column_id: columnId,
            week_index: weekIndex,
            value,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'exercise_id,column_id,week_index',
        })

    return !error
}

/**
 * Get all data for a training program (for client view)
 */
export async function getTrainingProgramFull(programId: string): Promise<TrainingProgramFull | null> {
    const supabase = await createClient()

    // 1. Fetch all related data in parallel
    const [
        { data: program, error: pError },
        { data: days, error: dError },
        { data: columns, error: cError },
        { data: exercises, error: eError },
        { data: cells, error: clError }
    ] = await Promise.all([
        supabase.from('training_programs').select('*').eq('id', programId).single(),
        supabase.from('training_days').select('*').eq('program_id', programId).order('order_index', { ascending: true }),
        supabase.from('training_columns').select('*').eq('program_id', programId).order('order_index', { ascending: true }),
        supabase.from('training_exercises').select('*').eq('program_id', programId).order('order_index', { ascending: true }),
        supabase.from('training_cells').select('*').eq('program_id', programId)
    ])

    if (pError || !program) return null

    // 2. Map to frontend types
    return {
        program: {
            id: program.id,
            name: program.name,
            totalWeeks: program.weeks,
            effectiveFrom: program.effective_from,
            effectiveTo: program.effective_to
        },
        days: (days || []).map(d => ({
            id: d.id,
            name: d.name,
            order: d.order_index
        })),
        columns: (columns || []).map(c => ({
            id: c.id,
            label: c.label,
            type: c.data_type as any,
            scope: c.scope as any,
            editable: c.editable_by !== 'coach',
            order: c.order_index
        })),
        exercises: (exercises || []).map(e => ({
            id: e.id,
            dayId: e.day_id,
            name: e.exercise_name,
            order: e.order_index
        })),
        cells: (cells || []).map(c => ({
            id: c.id,
            exerciseId: c.exercise_id,
            columnId: c.column_id,
            weekNumber: c.week_index,
            value: c.value
        }))
    }
}
