'use server'

import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressData {
    metrics: {
        metric_date: string
        weight_kg: number | null
        steps: number | null
        sleep_h: number | null
    }[]
    dietAdherence: {
        log_date: string
        adherence_pct: number
    }[]
    workoutLogs: {
        workout_date: string
        completed: boolean
    }[]
}

// ---------------------------------------------------------------------------
// Fetch all progress data for a client within a date range
// ---------------------------------------------------------------------------

export async function getProgressData(
    clientId: string,
    dateFrom: string, // YYYY-MM-DD
    dateTo: string    // YYYY-MM-DD
): Promise<{ success: boolean; data?: ProgressData; error?: string }> {
    const supabase = await createClient()

    try {
        // 1. Client metrics (weight, steps, sleep)
        const { data: metricsRaw, error: metricsErr } = await supabase
            .from('client_metrics')
            .select('metric_date, weight_kg, steps, sleep_h')
            .eq('client_id', clientId)
            .gte('metric_date', dateFrom)
            .lte('metric_date', dateTo)
            .order('metric_date', { ascending: true })

        if (metricsErr) throw new Error(metricsErr.message)

        // 2. Diet adherence logs
        const { data: dietRaw, error: dietErr } = await supabase
            .from('diet_adherence_logs')
            .select('log_date, adherence_pct')
            .eq('client_id', clientId)
            .gte('log_date', dateFrom)
            .lte('log_date', dateTo)
            .order('log_date', { ascending: true })

        if (dietErr) throw new Error(dietErr.message)

        // 3. Workout logs (completed flag)
        const { data: workoutRaw, error: workoutErr } = await supabase
            .from('workout_logs')
            .select('workout_date, completed')
            .eq('client_id', clientId)
            .gte('workout_date', dateFrom)
            .lte('workout_date', dateTo)
            .order('workout_date', { ascending: true })

        if (workoutErr) throw new Error(workoutErr.message)

        return {
            success: true,
            data: {
                metrics: (metricsRaw || []).map((m: any) => ({
                    metric_date: m.metric_date,
                    weight_kg: m.weight_kg ? Number(m.weight_kg) : null,
                    steps: m.steps,
                    sleep_h: m.sleep_h ? Number(m.sleep_h) : null,
                })),
                dietAdherence: (dietRaw || []).map((d: any) => ({
                    log_date: d.log_date,
                    adherence_pct: d.adherence_pct,
                })),
                workoutLogs: (workoutRaw || []).map((w: any) => ({
                    workout_date: w.workout_date,
                    completed: w.completed,
                })),
            },
        }
    } catch (error: any) {
        console.error('[getProgressData] Error:', error.message)
        return { success: false, error: error.message }
    }
}
