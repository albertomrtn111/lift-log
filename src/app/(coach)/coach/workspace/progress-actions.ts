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

// ---------------------------------------------------------------------------
// Cardio Progress Types
// ---------------------------------------------------------------------------

export interface CardioWeekData {
    weekStart: string      // YYYY-MM-DD (lunes de la semana)
    weekLabel: string      // "10 mar" para el eje X
    tooltipLabel: string   // "10 - 16 mar" para el tooltip
    distanceKm: number     // suma de actual_distance_km (sesiones completadas)
    durationMin: number    // suma de actual_duration_min
    sessionsCount: number  // número de sesiones completadas esa semana
}

export interface CardioProgressData {
    weeks: CardioWeekData[]
    totalDistanceKm: number
    totalDurationMin: number
    totalSessions: number
    avgDistanceKmPerWeek: number
    avgDurationMinPerWeek: number
}

// ---------------------------------------------------------------------------
// Fetch cardio progress data grouped by week
// ---------------------------------------------------------------------------

export async function getCardioProgressData(
    clientId: string,
    dateFrom: string,
    dateTo: string
): Promise<{ success: boolean; data?: CardioProgressData; error?: string }> {
    const supabase = await createClient()

    try {
        const { data: sessions, error } = await supabase
            .from('cardio_sessions')
            .select('scheduled_date, actual_distance_km, actual_duration_min, is_completed, structure')
            .eq('client_id', clientId)
            .eq('is_completed', true)
            .gte('scheduled_date', dateFrom)
            .lte('scheduled_date', dateTo)
            .order('scheduled_date', { ascending: true })

        if (error) throw new Error(error.message)

        // Agrupar por semana (lunes como inicio)
        const weekMap = new Map<string, CardioWeekData>()

        // Generar todas las semanas del rango aunque estén vacías
        const from = new Date(dateFrom + 'T12:00:00')
        const to = new Date(dateTo + 'T12:00:00')
        const cursor = new Date(from)
        // Ir al lunes de esa semana
        const dayOfWeek = cursor.getDay()
        const diffToMonday = (dayOfWeek + 6) % 7
        cursor.setDate(cursor.getDate() - diffToMonday)

        while (cursor <= to) {
            const key = cursor.toISOString().split('T')[0]
            const end = new Date(cursor)
            end.setDate(end.getDate() + 6)
            const weekLabel = cursor.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
            const tooltipLabel = `${cursor.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
            weekMap.set(key, {
                weekStart: key,
                weekLabel,
                tooltipLabel,
                distanceKm: 0,
                durationMin: 0,
                sessionsCount: 0,
            })
            cursor.setDate(cursor.getDate() + 7)
        }

        // Acumular sesiones en la semana correspondiente
        for (const s of sessions || []) {
            const d = new Date(s.scheduled_date + 'T12:00:00')
            const dow = (d.getDay() + 6) % 7
            d.setDate(d.getDate() - dow)
            const key = d.toISOString().split('T')[0]
            if (weekMap.has(key)) {
                const w = weekMap.get(key)!
                w.distanceKm += Number(s.actual_distance_km ?? 0)
                w.durationMin += Number(s.actual_duration_min ?? 0)
                w.sessionsCount += 1
            }
        }

        const weeks = Array.from(weekMap.values())
        const totalDistanceKm = weeks.reduce((a, w) => a + w.distanceKm, 0)
        const totalDurationMin = weeks.reduce((a, w) => a + w.durationMin, 0)
        const totalSessions = weeks.reduce((a, w) => a + w.sessionsCount, 0)
        const weeksWithData = weeks.filter(w => w.sessionsCount > 0).length || 1
        const avgDistanceKmPerWeek = totalDistanceKm / weeksWithData
        const avgDurationMinPerWeek = totalDurationMin / weeksWithData

        return {
            success: true,
            data: { weeks, totalDistanceKm, totalDurationMin, totalSessions, avgDistanceKmPerWeek, avgDurationMinPerWeek },
        }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}
