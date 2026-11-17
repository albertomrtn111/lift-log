import type { SupabaseClient } from '@supabase/supabase-js'

export type StrengthSkipRow = {
    id: string
    program_id: string
    day_id: string
    week_index: number
    reason: string | null
    created_at: string
}

/**
 * Días de fuerza quitados por el coach de un atleta (strength_day_week_skips).
 * Con RLS: el equipo ve los de sus atletas y el atleta los suyos. Si la tabla
 * aún no existe o falla la lectura, devuelve [] y el plan se ve como siempre.
 */
export async function loadStrengthSkips(
    supabase: SupabaseClient,
    clientId: string,
    programIds?: string[],
): Promise<StrengthSkipRow[]> {
    if (!clientId) return []
    if (programIds && programIds.length === 0) return []

    let query = supabase
        .from('strength_day_week_skips')
        .select('id, program_id, day_id, week_index, reason, created_at')
        .eq('client_id', clientId)
    if (programIds) query = query.in('program_id', programIds)

    const { data, error } = await query
    if (error) {
        if (error.code !== '42P01') console.warn('[strength-skips] No se pudieron leer los días quitados:', error.message)
        return []
    }
    return (data ?? []) as StrengthSkipRow[]
}
