'use server'

import { revalidatePath } from 'next/cache'
import type {
    CalendarNote,
    CalendarNoteKind,
    CalendarTask,
    CalendarTaskPriority,
} from '@/types/coach'
import { requireActiveCoachId } from '@/lib/auth/require-coach'

interface CreateCalendarNoteInput {
    coachId: string
    date: string
    kind: CalendarNoteKind
    content: string
    clientId?: string | null
}

interface CreateCoachTaskInput {
    coachId: string
    date: string
    title: string
    description?: string
    clientId?: string | null
    priority?: CalendarTaskPriority
}

function mapCalendarNote(
    note: {
        id: string
        note_date: string
        kind: CalendarNoteKind
        content: string
        client_id: string | null
        created_at: string
        updated_at: string
    },
    clientName: string | null
): CalendarNote {
    return {
        id: note.id,
        date: note.note_date,
        kind: note.kind,
        content: note.content,
        clientId: note.client_id,
        clientName,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
    }
}

function mapCoachTask(
    task: {
        id: string
        task_date: string
        title: string
        description: string | null
        status: CalendarTask['status']
        priority: CalendarTask['priority']
        client_id: string | null
        created_at: string
        updated_at: string
        completed_at: string | null
    },
    clientName: string | null
): CalendarTask {
    return {
        id: task.id,
        date: task.task_date,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        clientId: task.client_id,
        clientName,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
    }
}

function revalidateCalendarSurfaces() {
    revalidatePath('/coach/calendar')
    revalidatePath('/coach/dashboard')
}

export async function createCalendarNoteAction(
    input: CreateCalendarNoteInput
): Promise<{ success: boolean; note?: CalendarNote; error?: string }> {
    const content = input.content.trim()
    if (!content) {
        return { success: false, error: 'La nota no puede estar vacía.' }
    }

    try {
        const { supabase, coachId } = await requireActiveCoachId(input.coachId)

        let clientName: string | null = null
        if (input.clientId) {
            const { data: client, error: clientError } = await supabase
                .from('clients')
                .select('id, full_name')
                .eq('coach_id', coachId)
                .eq('id', input.clientId)
                .single()

            if (clientError || !client) {
                return { success: false, error: 'No se pudo asociar la nota al cliente indicado.' }
            }

            clientName = client.full_name
        }

        const { data, error } = await supabase
            .from('calendar_notes')
            .insert({
                coach_id: coachId,
                client_id: input.clientId ?? null,
                note_date: input.date,
                kind: input.kind,
                content,
            })
            .select('id, note_date, kind, content, client_id, created_at, updated_at')
            .single()

        if (error || !data) {
            return {
                success: false,
                error: error?.message?.includes('calendar_notes')
                    ? 'Las notas aún no están disponibles en este entorno.'
                    : (error?.message || 'No se pudo guardar la nota.'),
            }
        }

        revalidateCalendarSurfaces()
        return {
            success: true,
            note: mapCalendarNote(data, clientName),
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo guardar la nota.'
        return { success: false, error: message }
    }
}

export async function deleteCalendarNoteAction(
    noteId: string,
    coachId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

        const { error } = await supabase
            .from('calendar_notes')
            .delete()
            .eq('id', noteId)
            .eq('coach_id', validatedCoachId)

        if (error) {
            return {
                success: false,
                error: error.message?.includes('calendar_notes')
                    ? 'Las notas aún no están disponibles en este entorno.'
                    : (error.message || 'No se pudo eliminar la nota.'),
            }
        }

        revalidateCalendarSurfaces()
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar la nota.'
        return { success: false, error: message }
    }
}

export async function createCoachTaskAction(
    input: CreateCoachTaskInput
): Promise<{ success: boolean; task?: CalendarTask; error?: string }> {
    const title = input.title.trim()
    const description = input.description?.trim() || null

    if (!title) {
        return { success: false, error: 'El título de la tarea no puede estar vacío.' }
    }

    try {
        const { supabase, coachId } = await requireActiveCoachId(input.coachId)

        let clientName: string | null = null
        if (input.clientId) {
            const { data: client, error: clientError } = await supabase
                .from('clients')
                .select('id, full_name')
                .eq('coach_id', coachId)
                .eq('id', input.clientId)
                .single()

            if (clientError || !client) {
                return { success: false, error: 'No se pudo asociar la tarea al cliente indicado.' }
            }

            clientName = client.full_name
        }

        const { data, error } = await supabase
            .from('coach_tasks')
            .insert({
                coach_id: coachId,
                client_id: input.clientId ?? null,
                task_date: input.date,
                title,
                description,
                priority: input.priority ?? 'normal',
                status: 'pending',
            })
            .select('id, task_date, title, description, status, priority, client_id, created_at, updated_at, completed_at')
            .single()

        if (error || !data) {
            return {
                success: false,
                error: error?.message?.includes('coach_tasks')
                    ? 'Las tareas aún no están disponibles en este entorno.'
                    : (error?.message || 'No se pudo guardar la tarea.'),
            }
        }

        revalidateCalendarSurfaces()
        return {
            success: true,
            task: mapCoachTask(data, clientName),
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo crear la tarea.'
        return { success: false, error: message }
    }
}

export async function completeCoachTaskAction(
    taskId: string,
    coachId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

        const { error } = await supabase
            .from('coach_tasks')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', taskId)
            .eq('coach_id', validatedCoachId)
            .eq('status', 'pending')

        if (error) {
            return {
                success: false,
                error: error.message || 'No se pudo completar la tarea.',
            }
        }

        revalidateCalendarSurfaces()
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo completar la tarea.'
        return { success: false, error: message }
    }
}

export async function snoozeCoachTaskAction(
    taskId: string,
    coachId: string,
    newDate: string
): Promise<{ success: boolean; error?: string }> {
    if (!newDate) {
        return { success: false, error: 'Debes elegir una nueva fecha para aplazar la tarea.' }
    }

    try {
        const { supabase, coachId: validatedCoachId } = await requireActiveCoachId(coachId)

        const { error } = await supabase
            .from('coach_tasks')
            .update({
                task_date: newDate,
                updated_at: new Date().toISOString(),
            })
            .eq('id', taskId)
            .eq('coach_id', validatedCoachId)
            .eq('status', 'pending')

        if (error) {
            return {
                success: false,
                error: error.message || 'No se pudo aplazar la tarea.',
            }
        }

        revalidateCalendarSurfaces()
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo aplazar la tarea.'
        return { success: false, error: message }
    }
}

interface RescheduleReviewEventInput {
    coachId: string
    clientId: string
    newDate: string
    reviewScheduleId?: string | null
    checkinId?: string | null
}

/**
 * Mueve una revisión programada a otra fecha (drag & drop del calendario).
 * - Revisión ya enviada (checkin pendiente): mueve period_end/period_start del checkin.
 *   Si es legacy (sin schedule), sincroniza también clients.next_checkin_date para
 *   que el evento no desaparezca del calendario.
 * - Revisión aún no enviada de un schedule: mueve next_due_date del schedule.
 * - Evento legacy sin schedule ni checkin: mueve clients.next_checkin_date.
 */
export async function rescheduleReviewEventAction(
    input: RescheduleReviewEventInput
): Promise<{ success: boolean; error?: string }> {
    if (!input.newDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.newDate)) {
        return { success: false, error: 'Fecha no válida.' }
    }

    try {
        const { supabase, coachId } = await requireActiveCoachId(input.coachId)

        if (input.checkinId) {
            // Revisión ya enviada al atleta: mover el periodo del checkin pendiente
            const { data: checkin, error: checkinErr } = await supabase
                .from('checkins')
                .select('id, review_schedule_id, status, submitted_at')
                .eq('id', input.checkinId)
                .eq('coach_id', coachId)
                .single()

            if (checkinErr || !checkin) {
                return { success: false, error: 'Revisión no encontrada.' }
            }
            if (checkin.status !== 'pending' || checkin.submitted_at) {
                return { success: false, error: 'Solo se pueden mover revisiones aún no respondidas.' }
            }

            let frequency = 14
            if (checkin.review_schedule_id) {
                const { data: schedule } = await supabase
                    .from('client_review_schedules')
                    .select('frequency_days')
                    .eq('id', checkin.review_schedule_id)
                    .single()
                frequency = schedule?.frequency_days ?? 14
            } else {
                const { data: client } = await supabase
                    .from('clients')
                    .select('checkin_frequency_days')
                    .eq('id', input.clientId)
                    .eq('coach_id', coachId)
                    .single()
                frequency = client?.checkin_frequency_days ?? 14
            }

            const periodStart = new Date(`${input.newDate}T12:00:00`)
            periodStart.setDate(periodStart.getDate() - frequency)

            const { error: updateErr } = await supabase
                .from('checkins')
                .update({
                    period_end: input.newDate,
                    period_start: periodStart.toISOString().slice(0, 10),
                })
                .eq('id', checkin.id)

            if (updateErr) {
                return { success: false, error: updateErr.message }
            }

            // Legacy sin schedule: el calendario ancla el pendiente a next_checkin_date
            if (!checkin.review_schedule_id) {
                await supabase
                    .from('clients')
                    .update({ next_checkin_date: input.newDate })
                    .eq('id', input.clientId)
                    .eq('coach_id', coachId)
            }
        } else if (input.reviewScheduleId) {
            // Revisión programada aún no enviada: mover la próxima fecha del schedule
            const { error: scheduleErr } = await supabase
                .from('client_review_schedules')
                .update({ next_due_date: input.newDate })
                .eq('id', input.reviewScheduleId)
                .eq('coach_id', coachId)

            if (scheduleErr) {
                return { success: false, error: scheduleErr.message }
            }
        } else {
            // Evento legacy: mover la fecha del cliente
            const { error: clientErr } = await supabase
                .from('clients')
                .update({ next_checkin_date: input.newDate })
                .eq('id', input.clientId)
                .eq('coach_id', coachId)

            if (clientErr) {
                return { success: false, error: clientErr.message }
            }
        }

        revalidateCalendarSurfaces()
        revalidatePath('/coach/members')
        revalidatePath('/coach/clients')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo mover la revisión.'
        return { success: false, error: message }
    }
}
