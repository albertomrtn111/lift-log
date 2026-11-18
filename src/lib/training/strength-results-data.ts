import type { SupabaseClient } from '@supabase/supabase-js'
import { summarizeStrengthResults } from './strength-structure-plan'

export type StrengthResults = ReturnType<typeof summarizeStrengthResults>

/** Lo que se quitaría con registros del atleta: el aviso lo enseña y el coach decide. */
export type StrengthResultConflict =
    | { kind: 'exercise'; id: string; name: string; dayName: string; sets: number; weeks: number[] }
    | {
        kind: 'day'
        id: string
        name: string
        sets: number
        weeks: number[]
        completedSessions: number
        default_weekday: number | null
        order_index: number | null
    }

const CHUNK = 100

/**
 * Series, registros y sesiones completadas de un programa (NXT-124).
 * Lanza si no se puede leer: sin ese dato no se puede decidir qué es seguro quitar.
 * Sirve con el cliente del navegador y con el del servidor (RLS del coach).
 */
export async function loadStrengthResults(
    supabase: SupabaseClient,
    programId: string,
    exerciseIds: string[],
): Promise<StrengthResults> {
    const sets: any[] = []
    for (let start = 0; start < exerciseIds.length; start += CHUNK) {
        const { data, error } = await supabase
            .from('training_exercise_sets')
            .select('exercise_id, week_index, completed, weight_kg, reps, rir, notes')
            .in('exercise_id', exerciseIds.slice(start, start + CHUNK))
        if (error) throw new Error(`No se pudieron leer las series registradas: ${error.message}`)
        sets.push(...(data ?? []))
    }

    const [logs, sessions] = await Promise.all([
        supabase
            .from('training_exercise_logs')
            .select('exercise_id, day_id, week_index, sets')
            .eq('program_id', programId),
        supabase
            .from('scheduled_strength_sessions')
            .select('day_id')
            .eq('program_id', programId)
            .eq('is_completed', true),
    ])
    if (logs.error) throw new Error(`No se pudieron leer los registros: ${logs.error.message}`)
    if (sessions.error) throw new Error(`No se pudieron leer las sesiones: ${sessions.error.message}`)

    return summarizeStrengthResults({ sets, logs: logs.data ?? [], sessions: sessions.data ?? [] })
}
