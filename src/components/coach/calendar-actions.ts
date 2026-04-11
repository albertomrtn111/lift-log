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
