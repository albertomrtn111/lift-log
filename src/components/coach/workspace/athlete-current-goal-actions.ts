'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import {
    ATHLETE_GOAL_TYPES,
    type AthleteCurrentGoal,
    type AthleteCurrentGoalInput,
} from '@/types/athlete-current-goal'

function validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function assertClientLinked(
    supabase: Awaited<ReturnType<typeof requireActiveCoachId>>['supabase'],
    coachId: string,
    clientId: string
) {
    const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (error || !data) throw new Error('No tienes acceso a este atleta.')
}

export async function saveAthleteCurrentGoalAction(
    coachIdFromClient: string,
    clientId: string,
    input: AthleteCurrentGoalInput
): Promise<{ success: boolean; goal?: AthleteCurrentGoal; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
        await assertClientLinked(supabase, coachId, clientId)

        const title = input.title?.trim() || ''
        const notes = input.notes?.trim() || null
        if (!ATHLETE_GOAL_TYPES.some(option => option.value === input.goal_type)) {
            return { success: false, error: 'Selecciona un tipo de objetivo válido.' }
        }
        if (!title || title.length > 160) {
            return { success: false, error: 'Escribe un objetivo de 1 a 160 caracteres.' }
        }
        if (!validDate(input.start_date) || !validDate(input.target_date)) {
            return { success: false, error: 'Indica fechas válidas de inicio y finalización.' }
        }
        if (input.target_date < input.start_date) {
            return { success: false, error: 'La fecha límite debe ser posterior al inicio.' }
        }
        if (notes && notes.length > 1000) {
            return { success: false, error: 'Las notas no pueden superar los 1000 caracteres.' }
        }

        const { data, error } = await supabase
            .from('athlete_current_goals')
            .upsert({
                coach_id: coachId,
                client_id: clientId,
                goal_type: input.goal_type,
                title,
                start_date: input.start_date,
                target_date: input.target_date,
                notes,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'coach_id,client_id' })
            .select('*')
            .single()

        if (error) {
            console.error('Error saving athlete current goal:', error)
            return { success: false, error: 'No se pudo guardar el objetivo.' }
        }
        revalidatePath('/coach/clients')
        return { success: true, goal: data as AthleteCurrentGoal }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar el objetivo.' }
    }
}

export async function deleteAthleteCurrentGoalAction(
    coachIdFromClient: string,
    clientId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
        await assertClientLinked(supabase, coachId, clientId)
        const { error } = await supabase
            .from('athlete_current_goals')
            .delete()
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
        if (error) return { success: false, error: 'No se pudo quitar el objetivo.' }
        revalidatePath('/coach/clients')
        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo quitar el objetivo.' }
    }
}
