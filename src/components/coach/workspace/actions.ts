'use server'

import { createClient } from '@/lib/supabase/server'
import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'
import { revalidatePath } from 'next/cache'
import { ensureReviewForCheckin } from '@/data/workspace'
import { assertClientLinked } from '@/lib/guards'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { toLocalDateStr } from '@/lib/date-utils'
import { sendReviewApprovedNotification, sendReviewFeedbackNotification } from '@/lib/notifications/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCheckinAnalysis } from '@/lib/ai/analyze-checkin'
import { SupabaseClient } from '@supabase/supabase-js'
import { normalizeMuscleGroup } from '@/lib/training/muscle-groups'
import type { StrengthStructure } from '@/types/templates'

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

    try {
        // Validate coach_id against membership
        const { coachId: validatedCoachId, userId } = await requireActiveCoachId(coachId)
        const admin = createAdminClient()

        const { data: checkin, error: checkinError } = await admin
            .from('checkins')
            .select('id')
            .eq('id', checkinId)
            .eq('coach_id', validatedCoachId)
            .eq('client_id', clientId)
            .maybeSingle()

        if (checkinError || !checkin) {
            return { success: false, error: checkinError?.message || 'No se encontró la revisión de este atleta.' }
        }

        const review = await ensureReviewForCheckin(validatedCoachId, clientId, checkinId, userId)

        if (!review) {
            return { success: false, error: 'Error al crear la revisión' }
        }

        if (review.ai_status !== 'completed' || !review.ai_summary) {
            await admin
                .from('reviews')
                .update({
                    ai_status: 'pending',
                    ai_summary: null,
                    ai_error: null,
                    ai_generated_at: null,
                    analysis: null,
                })
                .eq('id', review.id)

            void generateCheckinAnalysis(checkinId, review.id)
        }

        revalidatePath('/coach/clients')
        return { success: true, review }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear la revisión'
        return { success: false, error: message }
    }
}

export async function regenerateReviewAIAction(
    coachId: string,
    checkinId: string,
    reviewId: string
) {
    try {
        const { coachId: validatedCoachId } = await requireActiveCoachId(coachId)

        const admin = createAdminClient()
        const { error: resetError } = await admin
            .from('reviews')
            .update({
                ai_status: 'pending',
                ai_summary: null,
                ai_error: null,
                ai_generated_at: null,
                analysis: null,
            })
            .eq('id', reviewId)
            .eq('checkin_id', checkinId)
            .eq('coach_id', validatedCoachId)

        if (resetError) {
            return { success: false, error: resetError.message }
        }

        const result = await generateCheckinAnalysis(checkinId, reviewId)
        if (!result.success) {
            return { success: false, error: result.error || 'No se pudo regenerar el análisis IA' }
        }

        revalidatePath('/coach/clients')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo regenerar el análisis IA'
        return { success: false, error: message }
    }
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
    const { coachId } = await requireActiveCoachId()
    const admin = createAdminClient()
    const { data: review, error } = await admin
        .from('reviews')
        .update(updates)
        .eq('id', reviewId)
        .eq('coach_id', coachId)
        .select('id')
        .maybeSingle()

    if (error || !review) {
        return { success: false, error: error?.message || 'No tienes permiso para actualizar esta revisión' }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

function revalidateReviewSurfaces() {
    revalidatePath('/coach/clients')
    revalidatePath('/coach/members')
    revalidatePath('/coach/dashboard')
    revalidatePath('/coach/calendar')
}

async function advanceClientNextCheckinDate(
    supabase: SupabaseClient,
    clientId: string,
    checkinId?: string
) {
    const { data: clientData } = await supabase
        .from('clients')
        .select('checkin_frequency_days, next_checkin_date')
        .eq('id', clientId)
        .single()

    if (!clientData) return

    let scheduledAnchorDate: string | null = null
    if (checkinId) {
        const { data: checkinData } = await supabase
            .from('checkins')
            .select('period_end')
            .eq('id', checkinId)
            .single()

        scheduledAnchorDate = checkinData?.period_end ?? null
    }

    const freqDays = clientData.checkin_frequency_days ?? 14
    const baseDate = scheduledAnchorDate
        ? new Date(`${scheduledAnchorDate}T12:00:00`)
        : clientData.next_checkin_date
            ? new Date(`${clientData.next_checkin_date}T12:00:00`)
            : new Date()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const newDate = new Date(baseDate)
    do {
        newDate.setDate(newDate.getDate() + freqDays)
    } while (newDate < today)

    await supabase
        .from('clients')
        .update({ next_checkin_date: toLocalDateStr(newDate) })
        .eq('id', clientId)
}

function advanceDateByFrequency(anchorDate: string, frequencyDays: number) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const nextDate = new Date(`${anchorDate}T12:00:00`)
    do {
        nextDate.setDate(nextDate.getDate() + frequencyDays)
    } while (nextDate < today)

    return toLocalDateStr(nextDate)
}

async function advanceReviewScheduleForCheckin(
    supabase: SupabaseClient,
    coachId: string,
    clientId: string,
    checkinId: string
) {
    const { data: checkin } = await supabase
        .from('checkins')
        .select('id, period_end, review_schedule_id, review_template_id')
        .eq('id', checkinId)
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .maybeSingle()

    if (!checkin?.period_end) return null

    type ScheduleRow = {
        id: string
        review_template_id: string
        frequency_days: number
        next_due_date: string | null
        is_active: boolean
    }

    let schedules: ScheduleRow[] = []

    if (checkin.review_schedule_id) {
        const { data } = await supabase
            .from('client_review_schedules')
            .select('id, review_template_id, frequency_days, next_due_date, is_active')
            .eq('id', checkin.review_schedule_id)
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .maybeSingle()

        if (data) schedules = [data as ScheduleRow]
    } else {
        const { data } = await supabase
            .from('client_review_schedules')
            .select('id, review_template_id, frequency_days, next_due_date, is_active')
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('next_due_date', { ascending: true, nullsFirst: false })

        const activeSchedules = (data ?? []) as ScheduleRow[]
        const exactMatches = activeSchedules.filter((schedule) => schedule.next_due_date === checkin.period_end)
        if (exactMatches.length === 1) {
            schedules = exactMatches
        } else {
            const dueMatches = activeSchedules.filter((schedule) => {
                return schedule.next_due_date != null && schedule.next_due_date <= checkin.period_end!
            })
            if (dueMatches.length === 1) schedules = dueMatches
        }
    }

    const schedule = schedules[0]
    if (!schedule?.next_due_date) return null

    if (schedule.next_due_date > checkin.period_end) {
        return {
            scheduleId: schedule.id,
            nextDueDate: schedule.next_due_date,
            advanced: false,
        }
    }

    const nextDueDate = advanceDateByFrequency(schedule.next_due_date, schedule.frequency_days)
    const { error: scheduleError } = await supabase
        .from('client_review_schedules')
        .update({ next_due_date: nextDueDate })
        .eq('id', schedule.id)
        .eq('coach_id', coachId)
        .eq('client_id', clientId)

    if (scheduleError) {
        console.error('[advanceReviewScheduleForCheckin] schedule update failed:', scheduleError)
        return null
    }

    if (!checkin.review_schedule_id) {
        await supabase
            .from('checkins')
            .update({
                review_schedule_id: schedule.id,
                review_template_id: checkin.review_template_id ?? schedule.review_template_id,
            })
            .eq('id', checkinId)
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
    }

    await supabase
        .from('clients')
        .update({ next_checkin_date: nextDueDate })
        .eq('id', clientId)
        .eq('coach_id', coachId)

    return {
        scheduleId: schedule.id,
        nextDueDate,
        advanced: true,
    }
}

async function finalizeApprovedReview(
    supabase: SupabaseClient,
    coachId: string,
    userId: string,
    reviewId: string,
    checkinId: string,
    clientId: string
) {
    const { data: approved, error: approveError } = await supabase
        .from('reviews')
        .update({
            status: 'approved',
            approved_by: userId,
        })
        .eq('id', reviewId)
        .eq('checkin_id', checkinId)
        .select('id')
        .maybeSingle()

    if (approveError || !approved) {
        return { success: false as const, error: approveError?.message || 'Error al aprobar la revisión' }
    }

    const { data: archivedCheckin, error: checkinError } = await supabase
        .from('checkins')
        .update({ status: 'archived' })
        .eq('id', checkinId)
        .eq('client_id', clientId)
        .select('id')
        .maybeSingle()

    if (checkinError || !archivedCheckin) {
        return { success: false as const, error: checkinError?.message || 'No se pudo cerrar la revisión.' }
    }

    const advancedSchedule = await advanceReviewScheduleForCheckin(supabase, coachId, clientId, checkinId)
    if (!advancedSchedule) {
        await advanceClientNextCheckinDate(supabase, clientId, checkinId)
    }

    return { success: true as const }
}

export async function approveReviewAction(reviewId: string) {
    const { coachId } = await requireActiveCoachId()
    const admin = createAdminClient()
    const { data: review } = await admin
        .from('reviews')
        .select('coach_id, client_id, checkin_id')
        .eq('id', reviewId)
        .eq('coach_id', coachId)
        .single()

    if (!review) {
        return { success: false, error: 'No se encontró la revisión.' }
    }

    return completeReviewAction({
        coachId: review.coach_id,
        clientId: review.client_id,
        checkinId: review.checkin_id,
        sendToClient: false,
    })
}

export async function revertReviewToDraftAction(reviewId: string) {
    const { coachId } = await requireActiveCoachId()
    const admin = createAdminClient()
    const { data: review, error } = await admin
        .from('reviews')
        .update({
            status: 'draft',
            approved_by: null,
        })
        .eq('id', reviewId)
        .eq('coach_id', coachId)
        .select('id')
        .maybeSingle()

    if (error || !review) {
        return { success: false, error: error?.message || 'No tienes permiso para revertir esta revisión' }
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

export async function copyTrainingProgramToTemplateAction(programId: string, clientId: string) {
    try {
        await assertClientLinked(clientId)
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    let supabase, coachId: string
    try {
        ;({ supabase, coachId } = await requireActiveCoachId())
    } catch (e: any) {
        return { success: false, error: e.message }
    }

    const { data: program, error: programError } = await supabase
        .from('training_programs')
        .select('id, name, total_weeks, weeks, client_id')
        .eq('id', programId)
        .eq('client_id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (programError || !program) {
        return { success: false, error: programError?.message || 'No se encontró el programa de fuerza.' }
    }

    const { data: days, error: daysError } = await supabase
        .from('training_days')
        .select('id, name, order_index, day_order')
        .eq('program_id', programId)
        .eq('coach_id', coachId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })

    if (daysError) return { success: false, error: daysError.message }
    if (!days || days.length === 0) {
        return { success: false, error: 'Este programa no tiene días para copiar.' }
    }

    const { data: exercises, error: exercisesError } = await supabase
        .from('training_exercises')
        .select('id, day_id, exercise_name, order_index, muscle_group, sets, reps, rir, rest_seconds, notes, created_at')
        .eq('program_id', programId)
        .eq('coach_id', coachId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })

    if (exercisesError) return { success: false, error: exercisesError.message }

    const exercisesByDay = new Map<string, typeof exercises>()
    ;(exercises || []).forEach((exercise) => {
        const current = exercisesByDay.get(exercise.day_id) || []
        current.push(exercise)
        exercisesByDay.set(exercise.day_id, current)
    })

    const structure: StrengthStructure = {
        weeks: program.total_weeks ?? program.weeks ?? 4,
        days: days.map((day, dayIndex) => ({
            id: crypto.randomUUID(),
            name: day.name || `Día ${dayIndex + 1}`,
            order: day.order_index ?? day.day_order ?? dayIndex + 1,
            exercises: (exercisesByDay.get(day.id) || []).map((exercise, exerciseIndex) => ({
                id: crypto.randomUUID(),
                exercise_name: exercise.exercise_name || '',
                order: exercise.order_index ?? exerciseIndex + 1,
                muscle_group: normalizeMuscleGroup(exercise.muscle_group),
                sets: exercise.sets ?? 0,
                reps: exercise.reps ?? '',
                rir: exercise.rir != null ? String(exercise.rir) : '',
                rest_seconds: exercise.rest_seconds ?? 0,
                notes: exercise.notes ?? null,
            })),
        })),
    }

    const templateName = `Plantilla - ${program.name || 'Rutina de fuerza'}`
    const { data: template, error: templateError } = await supabase
        .from('training_templates')
        .insert({
            coach_id: coachId,
            name: templateName,
            description: `Copiada desde el programa "${program.name || 'Rutina de fuerza'}".`,
            tags: ['fuerza'],
            type: 'strength',
            structure,
            is_public: false,
        })
        .select('id, name')
        .single()

    if (templateError || !template) {
        return { success: false, error: templateError?.message || 'No se pudo crear la plantilla.' }
    }

    revalidatePath('/coach/templates')
    return { success: true, template }
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
            muscle_group: 'otros',
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
        .select('id, order_index, created_at')
        .eq('day_id', dayId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })

    if (error || !dayExercises) return { success: false, error: 'No se pudieron cargar los ejercicios' }

    const normalizedExercises = dayExercises.map((exercise, index) => ({
        id: exercise.id,
        order_index: index + 1,
    }))

    const idx = normalizedExercises.findIndex(e => e.id === exerciseId)
    if (idx === -1) return { success: false, error: 'Ejercicio no encontrado' }

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= normalizedExercises.length) return { success: false, error: 'No se puede mover más' }

    const reordered = [...normalizedExercises]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(swapIdx, 0, moved)

    const updates = await Promise.all(
        reordered.map((exercise, index) =>
            supabase
                .from('training_exercises')
                .update({ order_index: index + 1, updated_at: new Date().toISOString() })
                .eq('id', exercise.id)
                .eq('day_id', dayId)
        )
    )

    const updateError = updates.find(result => result.error)?.error
    if (updateError) return { success: false, error: updateError.message }

    revalidatePath('/coach/clients')
    return {
        success: true,
        exercises: reordered.map((exercise, index) => ({
            id: exercise.id,
            order_index: index + 1,
        })),
    }
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
    let validatedCoachId: string
    try {
        ;({ coachId: validatedCoachId } = await requireActiveCoachId())
    } catch {
        return { success: false, error: 'No autenticado' }
    }

    const supabase = createAdminClient()

    const { data: client } = await supabase
        .from('clients')
        .select('checkin_frequency_days, next_checkin_date')
        .eq('id', clientId)
        .eq('coach_id', validatedCoachId)
        .maybeSingle()

    if (!client) return { success: false, error: 'Cliente no encontrado' }

    const { data: activeSchedules } = await supabase
        .from('client_review_schedules')
        .select('id, frequency_days, next_due_date')
        .eq('client_id', clientId)
        .eq('coach_id', validatedCoachId)
        .eq('is_active', true)
        .not('next_due_date', 'is', null)
        .order('next_due_date', { ascending: true })

    const scheduleToAdvance = activeSchedules?.[0]
    if (scheduleToAdvance?.next_due_date) {
        const nextDateStr = advanceDateByFrequency(
            scheduleToAdvance.next_due_date,
            scheduleToAdvance.frequency_days ?? client.checkin_frequency_days ?? 14
        )

        const { error: scheduleError } = await supabase
            .from('client_review_schedules')
            .update({ next_due_date: nextDateStr })
            .eq('id', scheduleToAdvance.id)
            .eq('coach_id', validatedCoachId)
            .eq('client_id', clientId)

        if (scheduleError) return { success: false, error: scheduleError.message }

        await supabase
            .from('clients')
            .update({ next_checkin_date: nextDateStr })
            .eq('id', clientId)
            .eq('coach_id', validatedCoachId)

        revalidatePath('/coach/clients')
        revalidatePath('/coach/dashboard')
        revalidatePath('/coach/calendar')
        return { success: true, nextDate: nextDateStr }
    }

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
        .eq('coach_id', validatedCoachId)

    if (error) return { success: false, error: error.message }

    // Marcar cualquier checkin en 'reviewed' sin revisión como archivado
    await supabase
        .from('checkins')
        .update({ status: 'archived' })
        .eq('client_id', clientId)
        .eq('coach_id', validatedCoachId)
        .eq('status', 'reviewed')

    revalidatePath('/coach/clients')
    revalidatePath('/coach/dashboard')
    revalidatePath('/coach/calendar')
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

// ============================================================================
// REVIEW WITH FEEDBACK
// ============================================================================

export async function createReviewWithFeedbackAction(
    coachId: string,
    clientId: string,
    checkinId: string,
    feedbackMessage: string
): Promise<{ success: boolean; sentToClient?: boolean; partialSuccess?: boolean; error?: string }> {
    return completeReviewAction({
        coachId,
        clientId,
        checkinId,
        feedbackMessage,
        sendToClient: true,
    })
}

export async function completeReviewAction(input: {
    coachId: string
    clientId: string
    checkinId: string
    feedbackMessage?: string
    sendToClient?: boolean
}): Promise<{ success: boolean; sentToClient?: boolean; partialSuccess?: boolean; error?: string }> {
    const feedbackMessage = input.feedbackMessage?.trim() || ''

    if (input.sendToClient && !feedbackMessage) {
        return { success: false, error: 'Escribe un feedback antes de enviarlo al cliente.' }
    }

    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'No autenticado' }

        const { coachId: validatedCoachId } = await requireActiveCoachId(input.coachId)
        const admin = createAdminClient()

        const { data: checkin, error: checkinError } = await admin
            .from('checkins')
            .select('id, coach_id, client_id')
            .eq('id', input.checkinId)
            .eq('coach_id', validatedCoachId)
            .eq('client_id', input.clientId)
            .maybeSingle()

        if (checkinError || !checkin) {
            return { success: false, error: checkinError?.message || 'No se encontró la revisión de este atleta.' }
        }

        const review = await ensureReviewForCheckin(validatedCoachId, input.clientId, input.checkinId, user.id)
        if (!review) {
            return { success: false, error: 'No se pudo cargar o crear la revisión.' }
        }

        if (review.ai_status === 'pending' && !review.ai_summary && !review.analysis) {
            void generateCheckinAnalysis(input.checkinId, review.id)
        }

        const isAlreadyApproved = review.status === 'approved'

        if (!isAlreadyApproved) {
            const finalized = await finalizeApprovedReview(
                admin,
                validatedCoachId,
                user.id,
                review.id,
                input.checkinId,
                input.clientId
            )

            if (!finalized.success) {
                return { success: false, error: finalized.error }
            }
        } else {
            await advanceReviewScheduleForCheckin(admin, validatedCoachId, input.clientId, input.checkinId)
        }

        if (input.sendToClient) {
            const { error: messageError } = await admin
                .from('messages')
                .insert({
                    coach_id: validatedCoachId,
                    client_id: input.clientId,
                    sender_role: 'coach',
                    sender_id: user.id,
                    content: feedbackMessage,
                    message_type: 'review_feedback',
                })

            if (messageError) {
                revalidateReviewSurfaces()
                return {
                    success: false,
                    partialSuccess: true,
                    error: 'La revisión quedó aprobada, pero no se pudo enviar el feedback al cliente.',
                }
            }

            const { data: messageSaved, error: messageSaveError } = await admin
                .from('reviews')
                .update({ message_to_client: feedbackMessage })
                .eq('id', review.id)
                .eq('checkin_id', input.checkinId)
                .select('id')
                .maybeSingle()

            if (messageSaveError || !messageSaved) {
                revalidateReviewSurfaces()
                return {
                    success: false,
                    partialSuccess: true,
                    error: messageSaveError?.message || 'La revisión quedó aprobada y el mensaje salió a mensajes, pero no se pudo guardar el feedback en la revisión.',
                }
            }

            await sendReviewFeedbackNotification(input.clientId, feedbackMessage)
            revalidateReviewSurfaces()
            return { success: true, sentToClient: true }
        }

        if (!isAlreadyApproved) {
            await sendReviewApprovedNotification(input.clientId)
        }
        revalidateReviewSurfaces()
        return { success: true, sentToClient: false }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo completar la revisión.'
        return { success: false, error: message }
    }
}
