'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import type { ClientEventPriority, ClientEventStatus, ClientEventType } from '@/data/workspace'

type EventPayload = {
    coachId: string
    clientId: string
    title: string
    eventDate: string
    eventType: ClientEventType
    status: ClientEventStatus
    priority: ClientEventPriority
    location?: string
    target?: string
    notes?: string
}

const EVENT_TYPES: ClientEventType[] = ['race', 'test', 'camp', 'other']
const EVENT_STATUSES: ClientEventStatus[] = ['planned', 'completed', 'cancelled']
const EVENT_PRIORITIES: ClientEventPriority[] = ['a', 'b', 'c']

function normalizeText(value?: string | null) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
}

function isIsoDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validateEventPayload(payload: EventPayload) {
    const title = payload.title.trim()
    if (!title) return { success: false as const, error: 'Añade un nombre para el evento.' }
    if (!isIsoDate(payload.eventDate)) return { success: false as const, error: 'Selecciona una fecha válida.' }
    if (!EVENT_TYPES.includes(payload.eventType)) return { success: false as const, error: 'Tipo de evento no válido.' }
    if (!EVENT_STATUSES.includes(payload.status)) return { success: false as const, error: 'Estado no válido.' }
    if (!EVENT_PRIORITIES.includes(payload.priority)) return { success: false as const, error: 'Prioridad no válida.' }

    return {
        success: true as const,
        data: {
            title,
            event_date: payload.eventDate,
            event_type: payload.eventType,
            status: payload.status,
            priority: payload.priority,
            location: normalizeText(payload.location),
            target: normalizeText(payload.target),
            notes: normalizeText(payload.notes),
        },
    }
}

async function assertClientLinked(supabase: Awaited<ReturnType<typeof requireActiveCoachId>>['supabase'], coachId: string, clientId: string) {
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .single()

    if (error || !data) {
        throw new Error('Cliente no encontrado para este coach.')
    }
}

export async function createClientEventAction(payload: EventPayload) {
    try {
        const { supabase, coachId, userId } = await requireActiveCoachId(payload.coachId)
        await assertClientLinked(supabase, coachId, payload.clientId)

        const validated = validateEventPayload(payload)
        if (!validated.success) return validated

        const { error } = await supabase
            .from('client_events')
            .insert({
                ...validated.data,
                coach_id: coachId,
                client_id: payload.clientId,
                created_by: userId,
            })

        if (error) {
            console.error('Error creating client event:', error)
            return { success: false as const, error: 'No se pudo crear el evento.' }
        }

        revalidatePath('/coach/clients')
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Error inesperado.' }
    }
}

export async function updateClientEventAction(eventId: string, payload: EventPayload) {
    try {
        const { supabase, coachId } = await requireActiveCoachId(payload.coachId)
        await assertClientLinked(supabase, coachId, payload.clientId)

        const validated = validateEventPayload(payload)
        if (!validated.success) return validated

        const { error } = await supabase
            .from('client_events')
            .update({
                ...validated.data,
                updated_at: new Date().toISOString(),
            })
            .eq('id', eventId)
            .eq('coach_id', coachId)
            .eq('client_id', payload.clientId)

        if (error) {
            console.error('Error updating client event:', error)
            return { success: false as const, error: 'No se pudo actualizar el evento.' }
        }

        revalidatePath('/coach/clients')
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Error inesperado.' }
    }
}

export async function deleteClientEventAction(coachIdFromClient: string, clientId: string, eventId: string) {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
        await assertClientLinked(supabase, coachId, clientId)

        const { error } = await supabase
            .from('client_events')
            .delete()
            .eq('id', eventId)
            .eq('coach_id', coachId)
            .eq('client_id', clientId)

        if (error) {
            console.error('Error deleting client event:', error)
            return { success: false as const, error: 'No se pudo eliminar el evento.' }
        }

        revalidatePath('/coach/clients')
        return { success: true as const }
    } catch (error) {
        return { success: false as const, error: error instanceof Error ? error.message : 'Error inesperado.' }
    }
}
