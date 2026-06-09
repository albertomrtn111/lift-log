'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { analyzeCardioSessionExecution } from '@/lib/cardio/analysis'

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
    supplementAdherence: {
        percent: number | null
        takenDoses: number
        scheduledDoses: number
        skippedDoses: number
        loggedDoses: number
    }
}

function parseDateStr(date: string) {
    return new Date(`${date}T12:00:00`)
}

function toDateStr(date: Date) {
    return date.toISOString().split('T')[0]
}

function getDateRange(dateFrom: string, dateTo: string) {
    const dates: string[] = []
    const cursor = parseDateStr(dateFrom)
    const end = parseDateStr(dateTo)

    while (cursor <= end) {
        dates.push(toDateStr(cursor))
        cursor.setDate(cursor.getDate() + 1)
    }

    return dates
}

function isSupplementActiveOnDate(supplement: any, date: string) {
    if (supplement.is_active === false) return false
    if (supplement.start_date && supplement.start_date > date) return false
    if (supplement.end_date && supplement.end_date < date) return false
    return true
}

function getDoseTimes(supplement: any) {
    return Array.isArray(supplement.dose_schedule)
        ? supplement.dose_schedule.filter((time: unknown): time is string => typeof time === 'string' && time.trim().length > 0)
        : []
}

function getFallbackDailyDoses(supplement: any) {
    const dailyDoses = Number(supplement.daily_doses || 0)
    return Number.isFinite(dailyDoses) && dailyDoses > 0 ? dailyDoses : 0
}

async function getSupplementAdherence(
    clientId: string,
    coachId: string,
    dateFrom: string,
    dateTo: string
): Promise<ProgressData['supplementAdherence']> {
    const admin = createAdminClient()
    const [{ data: supplements, error: supplementsError }, { data: logs, error: logsError }] = await Promise.all([
        admin
            .from('client_supplements')
            .select('id, daily_doses, dose_schedule, start_date, end_date, is_active')
            .eq('client_id', clientId)
            .eq('coach_id', coachId),
        admin
            .from('supplement_dose_logs')
            .select('supplement_id, scheduled_date, scheduled_time, status')
            .eq('client_id', clientId)
            .eq('coach_id', coachId)
            .gte('scheduled_date', dateFrom)
            .lte('scheduled_date', dateTo),
    ])

    if (supplementsError) throw new Error(supplementsError.message)
    if (logsError) throw new Error(logsError.message)

    const dates = getDateRange(dateFrom, dateTo)
    const scheduledKeys = new Set<string>()
    const fallbackCapacityByDoseDay = new Map<string, number>()
    let scheduledDoses = 0

    for (const supplement of supplements || []) {
        for (const date of dates) {
            if (!isSupplementActiveOnDate(supplement, date)) continue

            const doseTimes = getDoseTimes(supplement)
            if (doseTimes.length > 0) {
                scheduledDoses += doseTimes.length
                for (const time of doseTimes) {
                    scheduledKeys.add(`${supplement.id}:${date}:${time}`)
                }
            } else {
                const fallbackDoses = getFallbackDailyDoses(supplement)
                if (fallbackDoses > 0) {
                    scheduledDoses += fallbackDoses
                    fallbackCapacityByDoseDay.set(`${supplement.id}:${date}`, fallbackDoses)
                }
            }
        }
    }

    let takenDoses = 0
    let skippedDoses = 0
    let loggedDoses = 0
    const fallbackTakenByDoseDay = new Map<string, number>()

    for (const log of logs || []) {
        const exactKey = `${log.supplement_id}:${log.scheduled_date}:${log.scheduled_time}`
        const fallbackKey = `${log.supplement_id}:${log.scheduled_date}`
        const isScheduled = scheduledKeys.has(exactKey) || fallbackCapacityByDoseDay.has(fallbackKey)
        if (!isScheduled) continue

        loggedDoses += 1
        if (log.status === 'skipped') skippedDoses += 1

        if (log.status === 'taken') {
            if (scheduledKeys.has(exactKey)) {
                takenDoses += 1
            } else {
                fallbackTakenByDoseDay.set(fallbackKey, (fallbackTakenByDoseDay.get(fallbackKey) || 0) + 1)
            }
        }
    }

    for (const [key, taken] of fallbackTakenByDoseDay) {
        takenDoses += Math.min(taken, fallbackCapacityByDoseDay.get(key) || 0)
    }

    return {
        percent: scheduledDoses > 0 ? Math.round((takenDoses / scheduledDoses) * 100) : null,
        takenDoses,
        scheduledDoses,
        skippedDoses,
        loggedDoses,
    }
}

// ---------------------------------------------------------------------------
// Fetch all progress data for a client within a date range
// ---------------------------------------------------------------------------

export async function getProgressData(
    clientId: string,
    dateFrom: string, // YYYY-MM-DD
    dateTo: string,   // YYYY-MM-DD
    coachIdFromClient?: string | null
): Promise<{ success: boolean; data?: ProgressData; error?: string }> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)

        const { data: clientAccess, error: clientAccessError } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('coach_id', coachId)
            .maybeSingle()

        if (clientAccessError) throw new Error(clientAccessError.message)
        if (!clientAccess) throw new Error('No tienes acceso a este cliente')

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

        const supplementAdherence = await getSupplementAdherence(clientId, coachId, dateFrom, dateTo)

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
                supplementAdherence,
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
    distanceKm: number     // suma de actual_distance_km
    durationMin: number    // suma de actual_duration_min
    sessionsCount: number  // número de sesiones con trabajo registrado / completadas
    plannedDistanceKm: number
    plannedDurationMin: number
    plannedSessionsCount: number
}

export interface CardioSessionProgress {
    id: string
    scheduledDate: string
    title: string
    trainingType: string | null
    description: string | null
    coachNotes: string | null
    feedbackNotes: string | null
    plannedStructure: unknown | null
    targetDistanceKm: number | null
    targetDurationMin: number | null
    targetPace: string | null
    actualDistanceKm: number | null
    actualDurationMin: number | null
    actualAvgPace: string | null
    avgHeartRate: number | null
    maxHeartRate: number | null
    rpe: number | null
    analysisSource: 'streams' | 'laps' | 'summary'
    analysisSegments: {
        label: string
        kind: string
        targetSummary: string
        actualSummary: string
        actualDistanceMeters: number | null
        actualDurationSec: number | null
        avgPaceSecondsPerKm: number | null
        avgHeartRate: number | null
        maxHeartRate: number | null
        startHeartRate: number | null
        endHeartRate: number | null
        delta: number | null
        deltaUnit: string | null
    }[]
    chartAxis: 'distance' | 'time'
    chartPoints: {
        x: number | null
        distanceKm: number | null
        timeMin: number | null
        paceSecondsPerKm: number | null
        heartRate: number | null
    }[]
    isCompleted: boolean
    completionStatus: 'completed' | 'partial' | 'not_completed'
    primaryGoal: 'distance' | 'duration' | 'mixed' | 'none'
    primaryProgressPct: number | null
    distanceProgressPct: number | null
    durationProgressPct: number | null
    distanceDeltaKm: number | null
    durationDeltaMin: number | null
}

export interface CardioProgressData {
    weeks: CardioWeekData[]
    sessions: CardioSessionProgress[]
    totalDistanceKm: number
    totalDurationMin: number
    totalSessions: number
    completedSessions: number
    avgDistanceKmPerWeek: number
    avgDurationMinPerWeek: number
}

function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function getPrimaryGoal(targetDistanceKm: number | null, targetDurationMin: number | null) {
    if (targetDistanceKm && targetDurationMin) return 'mixed' as const
    if (targetDistanceKm) return 'distance' as const
    if (targetDurationMin) return 'duration' as const
    return 'none' as const
}

function getProgressPct(actual: number | null, planned: number | null) {
    if (!planned || planned <= 0) return null
    if (!actual || actual <= 0) return 0
    return (actual / planned) * 100
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
            .select(`
                id,
                scheduled_date,
                name,
                description,
                activity_type,
                training_type,
                target_distance_km,
                target_duration_min,
                target_pace,
                notes,
                structure,
                planned_structure,
                coach_notes,
                is_completed,
                actual_distance_km,
                actual_duration_min,
                actual_avg_pace,
                rpe,
                feedback_notes,
                avg_heart_rate,
                max_heart_rate,
                strava_activity_id
            `)
            .eq('client_id', clientId)
            .gte('scheduled_date', dateFrom)
            .lte('scheduled_date', dateTo)
            .order('scheduled_date', { ascending: true })

        if (error) throw new Error(error.message)

        const stravaActivityIds = [...new Set((sessions || [])
            .map((session: any) => session.strava_activity_id)
            .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))]
        const streamsByActivityId = new Map<string, any>()
        const lapsByActivityId = new Map<string, any[]>()

        if (stravaActivityIds.length > 0) {
            const [{ data: streams, error: streamsError }, { data: laps, error: lapsError }] = await Promise.all([
                supabase
                    .from('strava_activity_streams')
                    .select('strava_activity_id, streams')
                    .in('strava_activity_id', stravaActivityIds),
                supabase
                    .from('strava_activity_laps')
                    .select(`
                        strava_activity_id,
                        lap_index,
                        name,
                        distance_meters,
                        moving_time_seconds,
                        avg_pace_seconds_per_km,
                        avg_heartrate,
                        max_heartrate,
                        start_heartrate,
                        end_heartrate
                    `)
                    .in('strava_activity_id', stravaActivityIds)
                    .order('lap_index', { ascending: true }),
            ])

            if (streamsError) throw new Error(streamsError.message)
            if (lapsError) throw new Error(lapsError.message)

            for (const stream of streams || []) {
                streamsByActivityId.set(stream.strava_activity_id, stream.streams)
            }

            for (const lap of laps || []) {
                const list = lapsByActivityId.get(lap.strava_activity_id) || []
                list.push(lap)
                lapsByActivityId.set(lap.strava_activity_id, list)
            }
        }

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
                plannedDistanceKm: 0,
                plannedDurationMin: 0,
                plannedSessionsCount: 0,
            })
            cursor.setDate(cursor.getDate() + 7)
        }

        const detailedSessions: CardioSessionProgress[] = []

        // Acumular sesiones en la semana correspondiente
        for (const s of sessions || []) {
            const d = new Date(s.scheduled_date + 'T12:00:00')
            const dow = (d.getDay() + 6) % 7
            d.setDate(d.getDate() - dow)
            const key = d.toISOString().split('T')[0]

            const targetDistanceKm = toNullableNumber(s.target_distance_km)
            const targetDurationMin = toNullableNumber(s.target_duration_min)
            const actualDistanceKm = toNullableNumber(s.actual_distance_km)
            const actualDurationMin = toNullableNumber(s.actual_duration_min)
            const avgHeartRate = toNullableNumber((s as any).avg_heart_rate)
            const maxHeartRate = toNullableNumber((s as any).max_heart_rate)
            const plannedStructure = s.planned_structure || s.structure || null
            const hasActualWork = (actualDistanceKm ?? 0) > 0 || (actualDurationMin ?? 0) > 0
            const completionStatus = s.is_completed
                ? 'completed'
                : hasActualWork
                    ? 'partial'
                    : 'not_completed'
            const primaryGoal = getPrimaryGoal(targetDistanceKm, targetDurationMin)
            const distanceProgressPct = getProgressPct(actualDistanceKm, targetDistanceKm)
            const durationProgressPct = getProgressPct(actualDurationMin, targetDurationMin)
            const primaryProgressPct = primaryGoal === 'distance'
                ? distanceProgressPct
                : primaryGoal === 'duration'
                    ? durationProgressPct
                    : primaryGoal === 'mixed'
                        ? [distanceProgressPct, durationProgressPct].filter((value): value is number => value !== null)
                            .reduce((sum, value, _, arr) => sum + value / arr.length, 0)
                        : null
            const analysis = analyzeCardioSessionExecution({
                structure: plannedStructure,
                streams: s.strava_activity_id ? streamsByActivityId.get(s.strava_activity_id) : null,
                laps: s.strava_activity_id ? lapsByActivityId.get(s.strava_activity_id) || [] : [],
                session: {
                    actualDistanceKm,
                    actualDurationMin,
                    actualAvgPace: s.actual_avg_pace || null,
                    avgHeartRate,
                    maxHeartRate,
                },
            })

            if (weekMap.has(key)) {
                const w = weekMap.get(key)!
                w.plannedSessionsCount += 1
                w.plannedDistanceKm += targetDistanceKm ?? 0
                w.plannedDurationMin += targetDurationMin ?? 0
                if (hasActualWork || s.is_completed) {
                    w.distanceKm += actualDistanceKm ?? 0
                    w.durationMin += actualDurationMin ?? 0
                    w.sessionsCount += 1
                }
            }

            detailedSessions.push({
                id: s.id,
                scheduledDate: s.scheduled_date,
                title: s.name || s.structure?.trainingType || s.training_type || s.activity_type || 'Cardio',
                trainingType: s.structure?.trainingType || s.training_type || s.activity_type || null,
                description: s.description || null,
                coachNotes: s.coach_notes || s.notes || null,
                feedbackNotes: s.feedback_notes || null,
                plannedStructure,
                targetDistanceKm,
                targetDurationMin,
                targetPace: s.target_pace || null,
                actualDistanceKm,
                actualDurationMin,
                actualAvgPace: s.actual_avg_pace || null,
                avgHeartRate,
                maxHeartRate,
                rpe: toNullableNumber(s.rpe),
                analysisSource: analysis.source as CardioSessionProgress['analysisSource'],
                analysisSegments: analysis.segments,
                chartAxis: analysis.chartAxis as CardioSessionProgress['chartAxis'],
                chartPoints: analysis.chartPoints,
                isCompleted: Boolean(s.is_completed),
                completionStatus,
                primaryGoal,
                primaryProgressPct,
                distanceProgressPct,
                durationProgressPct,
                distanceDeltaKm: targetDistanceKm !== null && actualDistanceKm !== null
                    ? actualDistanceKm - targetDistanceKm
                    : null,
                durationDeltaMin: targetDurationMin !== null && actualDurationMin !== null
                    ? actualDurationMin - targetDurationMin
                    : null,
            })
        }

        const weeks = Array.from(weekMap.values())
        const totalDistanceKm = weeks.reduce((a, w) => a + w.distanceKm, 0)
        const totalDurationMin = weeks.reduce((a, w) => a + w.durationMin, 0)
        const totalSessions = detailedSessions.length
        const completedSessions = detailedSessions.filter((session) => session.completionStatus === 'completed').length
        const weeksWithData = weeks.filter(w => w.plannedSessionsCount > 0 || w.sessionsCount > 0).length || 1
        const avgDistanceKmPerWeek = totalDistanceKm / weeksWithData
        const avgDurationMinPerWeek = totalDurationMin / weeksWithData

        return {
            success: true,
            data: {
                weeks,
                sessions: detailedSessions.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
                totalDistanceKm,
                totalDurationMin,
                totalSessions,
                completedSessions,
                avgDistanceKmPerWeek,
                avgDurationMinPerWeek,
            },
        }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}
