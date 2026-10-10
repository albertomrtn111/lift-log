'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { isDailyMetricExtraKey, type DailyMetricExtraKey } from '@/lib/daily-metrics'

/** Medidas diarias adicionales que el coach pide a un atleta */
export async function getAthleteDailyMetricsAction(clientId: string): Promise<DailyMetricExtraKey[]> {
    const { supabase, coachId } = await requireActiveCoachId()
    const { data, error } = await supabase
        .from('clients')
        .select('daily_metrics_enabled')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()

    if (error || !data) return []
    return ((data.daily_metrics_enabled as string[] | null) ?? []).filter(isDailyMetricExtraKey)
}

export async function setAthleteDailyMetricsAction(
    clientId: string,
    keys: DailyMetricExtraKey[]
): Promise<{ success: boolean; error?: string; keys?: DailyMetricExtraKey[] }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const clean = [...new Set(keys.filter(isDailyMetricExtraKey))]

        const { data, error } = await supabase
            .from('clients')
            .update({ daily_metrics_enabled: clean })
            .eq('id', clientId)
            .eq('coach_id', coachId)
            .select('daily_metrics_enabled')
            .maybeSingle()

        if (error) return { success: false, error: error.message }
        if (!data) return { success: false, error: 'No tienes acceso a este atleta.' }
        return { success: true, keys: ((data.daily_metrics_enabled as string[]) ?? []).filter(isDailyMetricExtraKey) }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar' }
    }
}
