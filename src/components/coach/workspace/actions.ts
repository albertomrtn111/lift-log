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

    // Obtener checkin_id del review
    const { data: review } = await supabase
        .from('reviews')
        .select('checkin_id')
        .eq('id', reviewId)
        .single()

    if (review?.checkin_id) {
        // Obtener client_id desde el checkin
        const { data: checkin } = await supabase
            .from('checkins')
            .select('client_id')
            .eq('id', review.checkin_id)
            .single()

        // Marcar checkin como aprobado
        await supabase
            .from('checkins')
            .update({ status: 'approved' })
            .eq('id', review.checkin_id)

        if (checkin?.client_id) {
            // ── Avanzar next_checkin_date al siguiente ciclo del calendario ──
            const { data: clientData } = await supabase
                .from('clients')
                .select('checkin_frequency_days, next_checkin_date')
                .eq('id', checkin.client_id)
                .single()

            if (clientData) {
                const freqDays = clientData.checkin_frequency_days ?? 14
                const nextCheckinDate = clientData.next_checkin_date
                    ? new Date(clientData.next_checkin_date + 'T12:00:00') // noon para evitar desfase UTC
                    : new Date()

                // Avanzar desde la fecha agendada (no desde hoy)
                // Si sigue en el pasado, seguir sumando ciclos hasta fecha futura
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const newDate = new Date(nextCheckinDate)
                do {
                    newDate.setDate(newDate.getDate() + freqDays)
                } while (newDate < today)

                const newDateStr = toLocalDateStr(newDate)

                await supabase
                    .from('clients')
                    .update({ next_checkin_date: newDateStr })
                    .eq('id', checkin.client_id)
            }

            // Enviar push notification al cliente
            try {
                const { sendPushToClient } = await import('@/lib/push')
                await sendPushToClient(checkin.client_id, {
                    title: '¡Tu revisión ha sido revisada! ✅',
                    body: 'Tu entrenador ha revisado y aprobado tu check-in. Entra para ver los comentarios.',
                    url: '/summary',
                    tag: 'review-approved',
                })
            } catch {
                // Silencioso: notificaciones son best-effort
            }
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

export async function deleteExerciseAction(exerciseId: string) {
    const supabase = await createClient()

    // Eliminar primero las celdas asociadas para evitar huérfanos
    await supabase
        .from('training_cells')
        .delete()
        .eq('exercise_id', exerciseId)

    // Eliminar también los sets si los hay
    await supabase
        .from('training_exercise_sets')
        .delete()
        .eq('exercise_id', exerciseId)

    const { error } = await supabase
        .from('training_exercises')
        .delete()
        .eq('id', exerciseId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/clients')
    return { success: true }
}

export async function reorderExerciseAction(exerciseId: string, direction: 'up' | 'down', dayId: string) {
    const supabase = await createClient()

    // Obtener todos los ejercicios del día ordenados
    const { data: dayExercises, error } = await supabase
        .from('training_exercises')
        .select('id, order_index')
        .eq('day_id', dayId)
        .order('order_index', { ascending: true })

    if (error || !dayExercises) return { success: false, error: 'No se pudieron cargar los ejercicios' }

    const idx = dayExercises.findIndex(e => e.id === exerciseId)
    if (idx === -1) return { success: false, error: 'Ejercicio no encontrado' }

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= dayExercises.length) return { success: false, error: 'No se puede mover más' }

    const current = dayExercises[idx]
    const swap = dayExercises[swapIdx]

    // Intercambiar order_index entre los dos ejercicios
    await supabase.from('training_exercises').update({ order_index: swap.order_index }).eq('id', current.id)
    await supabase.from('training_exercises').update({ order_index: current.order_index }).eq('id', swap.id)

    revalidatePath('/coach/clients')
    return { success: true }
}

// ============================================================================
// CHECK-IN ADVANCE ACTIONS
// ============================================================================

/**
 * Fuerza el avance del próximo check-in sin necesitar una revisión formal.
 * Útil cuando el cliente no ha enviado check-in esa semana o cuando
 * el checkin existe pero no tiene revisión asociada.
 */
export async function forceAdvanceCheckinAction(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const { data: client } = await supabase
        .from('clients')
        .select('checkin_frequency_days, next_checkin_date')
        .eq('id', clientId)
        .single()

    if (!client) return { success: false, error: 'Cliente no encontrado' }

    const freqDays = client.checkin_frequency_days ?? 14
    const nextCheckinDate = client.next_checkin_date
        ? new Date(client.next_checkin_date + 'T12:00:00')
        : new Date()

    // Avanzar desde la fecha agendada, no desde hoy
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newDate = new Date(nextCheckinDate)
    do {
        newDate.setDate(newDate.getDate() + freqDays)
    } while (newDate < today)

    const nextDateStr = toLocalDateStr(newDate)

    const { error } = await supabase
        .from('clients')
        .update({ next_checkin_date: nextDateStr })
        .eq('id', clientId)

    if (error) return { success: false, error: error.message }

    // Marcar cualquier checkin en 'reviewed' sin revisión como aprobado
    await supabase
        .from('checkins')
        .update({ status: 'approved' })
        .eq('client_id', clientId)
        .eq('status', 'reviewed')

    revalidatePath('/coach/clients')
    return { success: true, nextDate: nextDateStr }
}

// ============================================================================
// CHECKIN DELETE ACTION
// ============================================================================

export async function deleteCheckinAction(checkinId: string, coachId: string) {
    const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

    const { error } = await supabase
        .from('checkins')
        .delete()
        .eq('id', checkinId)
        .eq('coach_id', validatedCoachId) // seguridad: solo el coach dueño puede borrar

    if (error) return { success: false, error: error.message }

    revalidatePath('/coach/clients')
    revalidatePath('/coach/members')
    return { success: true }
}
