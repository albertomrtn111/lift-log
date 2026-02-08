'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { createReviewForCheckin, updateReview } from '@/data/workspace'

// ============================================================================
// CLIENT ACTIONS
// ============================================================================

export async function updateClientBasicsAction(
    clientId: string,
    updates: {
        full_name?: string
        email?: string
        phone?: string
        start_date?: string
        checkin_frequency_days?: number
        next_checkin_date?: string
    }
) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('clients')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', clientId)

    if (error) {
        console.error('Error updating client:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/clients')
    revalidatePath('/coach/members')
    return { success: true }
}

export async function toggleClientStatusAction(clientId: string, currentStatus: 'active' | 'inactive' | 'pending') {
    const supabase = await createClient()
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

    const { error } = await supabase
        .from('clients')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', clientId)

    if (error) {
        console.error('Error toggling client status:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/clients')
    revalidatePath('/coach/members')
    return { success: true, newStatus }
}

// ============================================================================
// REVIEW ACTIONS
// ============================================================================

export async function createReviewAction(
    coachId: string,
    clientId: string,
    checkinId: string
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const review = await createReviewForCheckin(coachId, clientId, checkinId, user.id)

    if (!review) {
        return { success: false, error: 'Error al crear review' }
    }

    revalidatePath('/coach/clients')
    return { success: true, review }
}

export async function updateReviewAction(
    reviewId: string,
    updates: {
        summary?: string
        message_to_client?: string
        analysis?: Record<string, unknown>
        proposal?: Record<string, unknown>
    }
) {
    const success = await updateReview(reviewId, updates)

    if (!success) {
        return { success: false, error: 'Error al actualizar review' }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function approveReviewAction(reviewId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, error: 'No autenticado' }
    }

    const success = await updateReview(reviewId, {
        status: 'approved',
        approved_by: user.id
    })

    if (!success) {
        return { success: false, error: 'Error al aprobar review' }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function revertReviewToDraftAction(reviewId: string) {
    const success = await updateReview(reviewId, {
        status: 'draft',
        approved_by: null
    })

    if (!success) {
        return { success: false, error: 'Error al revertir review' }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

// ============================================================================
// MACRO PLAN ACTIONS
// ============================================================================

export async function saveMacroPlanAction(plan: {
    id?: string
    coach_id: string
    client_id: string
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    steps_goal?: number
    cardio_goal?: string
    notes?: string
    effective_from: string
    effective_to?: string
}) {
    const supabase = await createClient()

    if (plan.id) {
        // Update
        const { error } = await supabase
            .from('macro_plans')
            .update({
                kcal: plan.kcal,
                protein_g: plan.protein_g,
                carbs_g: plan.carbs_g,
                fat_g: plan.fat_g,
                steps_goal: plan.steps_goal,
                cardio_goal: plan.cardio_goal,
                notes: plan.notes,
                effective_from: plan.effective_from,
                effective_to: plan.effective_to,
            })
            .eq('id', plan.id)

        if (error) {
            return { success: false, error: error.message }
        }
    } else {
        // Insert
        const { error } = await supabase
            .from('macro_plans')
            .insert({
                coach_id: plan.coach_id,
                client_id: plan.client_id,
                kcal: plan.kcal,
                protein_g: plan.protein_g,
                carbs_g: plan.carbs_g,
                fat_g: plan.fat_g,
                steps_goal: plan.steps_goal,
                cardio_goal: plan.cardio_goal,
                notes: plan.notes,
                effective_from: plan.effective_from,
                effective_to: plan.effective_to,
            })

        if (error) {
            return { success: false, error: error.message }
        }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

// ============================================================================
// TRAINING PROGRAM ACTIONS
// ============================================================================

export async function createTrainingProgramAction(data: {
    coach_id: string
    client_id: string
    name: string
    total_weeks: number
    days: string[]
}) {
    const supabase = await createClient()

    // Create program
    const { data: program, error: programError } = await supabase
        .from('training_programs')
        .insert({
            coach_id: data.coach_id,
            client_id: data.client_id,
            name: data.name,
            total_weeks: data.total_weeks,
            status: 'draft',
        })
        .select()
        .single()

    if (programError || !program) {
        return { success: false, error: programError?.message || 'Error creating program' }
    }

    // Create days
    const daysToInsert = data.days.map((name, index) => ({
        program_id: program.id,
        coach_id: data.coach_id, // Añadir coach_id
        day_name: name,
        day_order: index + 1,
        order_index: index + 1, // Añadir order_index que es NOT NULL
    }))

    const { error: daysError } = await supabase
        .from('training_days')
        .insert(daysToInsert)

    if (daysError) {
        console.error('Error creating days:', daysError)
    }

    // Create default columns
    const defaultColumns = [
        { label: 'Ejercicio', data_type: 'text', scope: 'exercise', editable_by: 'coach', col_order: 1, order_index: 1, key: 'exercise' },
        { label: 'Series', data_type: 'number', scope: 'cell', editable_by: 'coach', col_order: 2, order_index: 2, key: 'sets' },
        { label: 'Reps', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 3, order_index: 3, key: 'reps' },
        { label: 'RIR', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 4, order_index: 4, key: 'rir' },
        { label: 'Descanso', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 5, order_index: 5, key: 'rest' },
        { label: 'Tips', data_type: 'text', scope: 'cell', editable_by: 'coach', col_order: 6, order_index: 6, key: 'tips' },
        { label: 'Peso', data_type: 'number', scope: 'cell', editable_by: 'client', col_order: 7, order_index: 7, key: 'weight' },
        { label: 'Reps hechas', data_type: 'number', scope: 'cell', editable_by: 'client', col_order: 8, order_index: 8, key: 'reps_done' },
        { label: 'Notas', data_type: 'text', scope: 'cell', editable_by: 'both', col_order: 9, order_index: 9, key: 'notes' },
    ]

    const columnsToInsert = defaultColumns.map(col => ({
        ...col,
        program_id: program.id,
        coach_id: data.coach_id, // Añadir coach_id
        required: false,
        options: {},
    }))

    const { error: colError } = await supabase
        .from('training_columns')
        .insert(columnsToInsert)

    if (colError) {
        console.error('Error creating columns:', colError)
    }

    revalidatePath('/coach/clients')
    return { success: true, program }
}

export async function activateTrainingProgramAction(programId: string, clientId: string) {
    const supabase = await createClient()

    // Deactivate other programs
    await supabase
        .from('training_programs')
        .update({ status: 'archived' })
        .eq('client_id', clientId)
        .eq('status', 'active')

    // Activate this program
    const { error } = await supabase
        .from('training_programs')
        .update({ status: 'active', effective_from: new Date().toISOString().split('T')[0] })
        .eq('id', programId)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function addExerciseAction(dayId: string, exerciseName: string, order: number) {
    const supabase = await createClient()

    // Obtener coach_id y program_id del día
    const { data: dayData } = await supabase
        .from('training_days')
        .select('coach_id, program_id')
        .eq('id', dayId)
        .single()

    if (!dayData) {
        return { success: false, error: 'Día no encontrado' }
    }

    const { data, error } = await supabase
        .from('training_exercises')
        .insert({
            day_id: dayId,
            coach_id: dayData.coach_id,
            program_id: dayData.program_id,
            exercise_name: exerciseName,
            order_index: order, // Usar order_index que es el nombre en la BBDD
        })
        .select()
        .single()

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/coach/clients')
    return { success: true, exercise: data }
}

export async function saveCellAction(
    exerciseId: string,
    columnId: string,
    weekIndex: number,
    value: string
) {
    const supabase = await createClient()

    // Obtener coach_id y program_id del ejercicio
    const { data: exerciseData } = await supabase
        .from('training_exercises')
        .select('coach_id, program_id, day_id')
        .eq('id', exerciseId)
        .single()

    if (!exerciseData) {
        return { success: false, error: 'Ejercicio no encontrado' }
    }

    const { error } = await supabase
        .from('training_cells')
        .upsert({
            exercise_id: exerciseId,
            column_id: columnId,
            coach_id: exerciseData.coach_id,
            program_id: exerciseData.program_id,
            day_id: exerciseData.day_id,
            week_index: weekIndex,
            value,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'exercise_id,column_id,week_index'
        })

    if (error) {
        return { success: false, error: error.message }
    }

    return { success: true }
}
