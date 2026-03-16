'use server'

import { createClient } from '@/lib/supabase/server'
import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'
import { revalidatePath } from 'next/cache'
import { createReviewForCheckin, updateReview } from '@/data/workspace'
import { assertClientLinked } from '@/lib/guards'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { toLocalDateStr } from '@/lib/date-utils'

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
    try {
        await assertClientLinked(clientId)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    // Validate coach_id against membership
    const { coachId: validatedCoachId, userId } = await requireActiveCoachId(coachId)

    const review = await createReviewForCheckin(validatedCoachId, clientId, checkinId, userId)

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

    // ── Advance next_checkin_date & mark checkin as approved ──
    const { data: review } = await supabase
        .from('reviews')
        .select('checkin_id, client_id')
        .eq('id', reviewId)
        .single()

    if (review?.client_id) {
        // 1. Compute next checkin date
        const { data: client } = await supabase
            .from('clients')
            .select('checkin_frequency_days')
            .eq('id', review.client_id)
            .single()

        const freqDays = client?.checkin_frequency_days ?? 14
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + freqDays)
        const nextDateStr = toLocalDateStr(nextDate)

        await supabase
            .from('clients')
            .update({ next_checkin_date: nextDateStr })
            .eq('id', review.client_id)

        // 2. Mark the checkin as fully processed
        if (review.checkin_id) {
            await supabase
                .from('checkins')
                .update({ status: 'approved' })
                .eq('id', review.checkin_id)
        }
    }

    revalidatePath('/coach/clients')
    revalidatePath('/coach/members')
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
    steps?: number
    notes?: string
    day_type_config?: string | null
    effective_from: string
    effective_to?: string
}) {
    try {
        await assertClientLinked(plan.client_id)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    // Validate coach_id against membership
    const { supabase, coachId } = await requireActiveCoachId(plan.coach_id)

    if (plan.id) {
        // Update
        const { error } = await supabase
            .from('macro_plans')
            .update({
                kcal: plan.kcal,
                protein_g: plan.protein_g,
                carbs_g: plan.carbs_g,
                fat_g: plan.fat_g,
                steps: plan.steps ?? null,
                notes: plan.notes,
                day_type_config: plan.day_type_config ?? null,
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
                coach_id: coachId,
                client_id: plan.client_id,
                kcal: plan.kcal,
                protein_g: plan.protein_g,
                carbs_g: plan.carbs_g,
                fat_g: plan.fat_g,
                steps: plan.steps ?? null,
                notes: plan.notes,
                day_type_config: plan.day_type_config ?? null,
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
    try {
        await assertClientLinked(data.client_id)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    // Validate coach_id against membership
    const { supabase, coachId } = await requireActiveCoachId(data.coach_id)

    // Create program
    const { data: program, error: programError } = await supabase
        .from('training_programs')
        .insert({
            coach_id: coachId,
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
        coach_id: coachId,
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
    const defaultColumns = getDefaultTrainingColumns()

    const columnsToInsert = defaultColumns.map(col => ({
        ...col,
        program_id: program.id,
        coach_id: coachId,
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
    try {
        await assertClientLinked(clientId)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

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

export async function archiveTrainingProgramAction(programId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('training_programs')
        .update({ status: 'archived' })
        .eq('id', programId)
        .eq('status', 'active')

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
