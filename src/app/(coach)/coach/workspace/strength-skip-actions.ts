'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { sendPlanUpdatedNotification } from '@/lib/notifications/client'
import { programDayDate, programWeekRange } from '@/lib/training/strength-week-skips'

/**
 * Quitar un día de fuerza solo en una semana del programa, y deshacerlo.
 * Se guarda en strength_day_week_skips: el programa, sus series y las demás
 * semanas no cambian. Restaurar borra esa fila y el día vuelve tal cual.
 */

export type StrengthSkipInput = {
    clientId: string
    programId: string
    dayId: string
    weekIndex: number
    reason?: string | null
}

export type StrengthSkipResult =
    | { success: true; skipId?: string; date: string | null; dayName: string; weekIndex: number }
    | { success: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function todayStr() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function loadTarget(supabase: SupabaseClient, input: StrengthSkipInput) {
    const week = Number(input.weekIndex)
    if (![input.clientId, input.programId, input.dayId].every((id) => UUID.test(String(id ?? '')))) {
        throw new Error('Faltan datos para identificar el día.')
    }
    if (!Number.isInteger(week) || week < 1) throw new Error('La semana no es válida.')

    const { data: program } = await supabase
        .from('training_programs')
        .select('id, client_id, coach_id, weeks, effective_from')
        .eq('id', input.programId)
        .eq('client_id', input.clientId)
        .maybeSingle()
    if (!program) throw new Error('No se ha encontrado el programa de este atleta.')

    const totalWeeks = Number(program.weeks) || 4
    if (week > totalWeeks) throw new Error(`El programa solo tiene ${totalWeeks} semanas.`)

    const { data: day } = await supabase
        .from('training_days')
        .select('id, name, default_weekday')
        .eq('id', input.dayId)
        .eq('program_id', input.programId)
        .maybeSingle()
    if (!day) throw new Error('Ese día no pertenece a este programa.')

    return {
        program,
        day,
        week,
        date: programDayDate(program.effective_from, week, day.default_weekday),
    }
}

/** ¿El atleta ya entrenó ese día en esa semana (series confirmadas o sesión hecha)? */
async function hasTrainingLogged(
    supabase: SupabaseClient,
    clientId: string,
    program: { id: string; effective_from: string },
    dayId: string,
    week: number,
) {
    const range = programWeekRange(program.effective_from, week)
    const [{ data: exercises }, { data: sessions }] = await Promise.all([
        supabase.from('training_exercises').select('id').eq('day_id', dayId),
        supabase
            .from('scheduled_strength_sessions')
            .select('id')
            .eq('client_id', clientId)
            .eq('program_id', program.id)
            .eq('day_id', dayId)
            .eq('is_completed', true)
            .gte('scheduled_date', range.start)
            .lte('scheduled_date', range.end)
            .limit(1),
    ])
    if ((sessions ?? []).length > 0) return true

    const exerciseIds = (exercises ?? []).map((exercise: { id: string }) => exercise.id)
    if (exerciseIds.length === 0) return false
    const { data: sets } = await supabase
        .from('training_exercise_sets')
        .select('id')
        .in('exercise_id', exerciseIds)
        .eq('week_index', week)
        .eq('completed', true)
        .limit(1)
    return (sets ?? []).length > 0
}

/** Avisa al atleta (como mucho uno cada 12 h) si el cambio afecta a hoy o a lo que viene. */
function notifyAthlete(clientId: string, date: string | null) {
    if (date && date < todayStr()) return
    void sendPlanUpdatedNotification(clientId, 'cardio').catch((error) => {
        console.warn('[strength-skips] Aviso al atleta no enviado:', error)
    })
}

export async function skipStrengthDayWeekAction(input: StrengthSkipInput): Promise<StrengthSkipResult> {
    try {
        const { supabase, userId } = await requireActiveCoachId()
        const { program, day, week, date } = await loadTarget(supabase, input)

        if (await hasTrainingLogged(supabase, input.clientId, program, day.id, week)) {
            return { success: false, error: `El atleta ya ha registrado «${day.name}» en la semana ${week}. No se puede quitar.` }
        }

        const reason = input.reason?.trim() ? input.reason.trim().slice(0, 300) : null
        const { data, error } = await supabase
            .from('strength_day_week_skips')
            .insert({
                coach_id: program.coach_id,
                client_id: input.clientId,
                program_id: program.id,
                day_id: day.id,
                week_index: week,
                reason,
                created_by: userId,
            })
            .select('id')
            .single()

        let skipId = data?.id as string | undefined
        if (error) {
            // Ya estaba quitado: no es un error.
            if (error.code !== '23505') {
                console.error('[skipStrengthDayWeekAction]', error.message)
                return { success: false, error: 'No se ha podido quitar el día. Inténtalo de nuevo.' }
            }
            const { data: existing } = await supabase
                .from('strength_day_week_skips')
                .select('id')
                .eq('program_id', program.id)
                .eq('day_id', day.id)
                .eq('week_index', week)
                .maybeSingle()
            skipId = existing?.id
        }

        notifyAthlete(input.clientId, date)
        return { success: true, skipId, date, dayName: day.name, weekIndex: week }
    } catch (error: any) {
        return { success: false, error: error?.message || 'No se ha podido quitar el día.' }
    }
}

export async function restoreStrengthDayWeekAction(input: StrengthSkipInput): Promise<StrengthSkipResult> {
    try {
        const { supabase } = await requireActiveCoachId()
        const { program, day, week, date } = await loadTarget(supabase, input)

        const { error } = await supabase
            .from('strength_day_week_skips')
            .delete()
            .eq('client_id', input.clientId)
            .eq('program_id', program.id)
            .eq('day_id', day.id)
            .eq('week_index', week)
        if (error) {
            console.error('[restoreStrengthDayWeekAction]', error.message)
            return { success: false, error: 'No se ha podido restaurar el día. Inténtalo de nuevo.' }
        }

        notifyAthlete(input.clientId, date)
        return { success: true, date, dayName: day.name, weekIndex: week }
    } catch (error: any) {
        return { success: false, error: error?.message || 'No se ha podido restaurar el día.' }
    }
}
