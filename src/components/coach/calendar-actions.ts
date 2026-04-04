'use server'

import { revalidatePath } from 'next/cache'
import type { CalendarNote, CalendarNoteKind } from '@/types/coach'
import { requireActiveCoachId } from '@/lib/auth/require-coach'

interface CreateCalendarNoteInput {
    coachId: string
    date: string
    kind: CalendarNoteKind
    content: string
    clientId?: string | null
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

        revalidatePath('/coach/calendar')
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

        revalidatePath('/coach/calendar')
        return { success: true }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar la nota.'
        return { success: false, error: message }
    }
}
