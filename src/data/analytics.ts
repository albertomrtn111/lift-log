import { createClient } from '@/lib/supabase/server'
import { addDays, seasonDiscipline } from '@/lib/season/volume'
import { normalizeExerciseName } from '@/lib/training/exercise-catalog'
import { epley1RM } from '@/lib/training/progress-summary'
import { trackingRows } from '@/lib/analytics/compute'
import type { AnalyticsFacts, CardioFact } from '@/lib/analytics/engine'

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE_SIZE = 1000

// El seguimiento (adherencia, último registro…) necesita al menos estas semanas de series
const TRACKING_WEEKS = 16

// Series con más repeticiones no cuentan para el e1RM (sí como series y tonelaje)
const E1RM_MAX_REPS = 12

// PostgREST corta en 1.000 filas: pide páginas hasta que una venga incompleta
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await page(from, from + PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE_SIZE) return rows
    }
}

function dayFormatter(timeZone: string) {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })
    }
}

function embedOne<T>(value: T | T[] | null | undefined): T | null {
    return (Array.isArray(value) ? value[0] : value) ?? null
}

function numberOrNull(value: unknown) {
    if (value == null || value === '') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function positiveOrNull(value: unknown) {
    const number = numberOrNull(value)
    return number != null && number > 0 ? number : null
}

/** Día de hoy en la zona del coach y formateador de fechas a día local */
export async function coachClock(supabase: Supabase, coachId: string) {
    const { data: coach } = await supabase.from('coaches').select('timezone').eq('id', coachId).maybeSingle()
    const toDay = dayFormatter(coach?.timezone || 'Europe/Madrid')
    return { toDay, today: toDay.format(new Date()) }
}

const SET_COLUMNS = 'id, exercise_id, week_index, weight_kg, reps, rir, performed_at, training_exercises!inner(coach_id, program_id)'

async function loadSets(supabase: Supabase, coachId: string, since: string, activeProgramIds: string[]) {
    const recent = fetchAll<any>((from, to) => supabase
        .from('training_exercise_sets')
        .select(SET_COLUMNS)
        .eq('training_exercises.coach_id', coachId)
        .gte('performed_at', `${since}T00:00:00Z`)
        .order('id')
        .range(from, to))
    // El Δ del bloque necesita todas las semanas del programa activo, aunque empezara antes
    const active = activeProgramIds.length
        ? fetchAll<any>((from, to) => supabase
            .from('training_exercise_sets')
            .select(SET_COLUMNS)
            .eq('training_exercises.coach_id', coachId)
            .in('training_exercises.program_id', activeProgramIds)
            .not('performed_at', 'is', null)
            .order('id')
            .range(from, to))
        : Promise.resolve([])

    const byId = new Map<string, any>()
    for (const row of [...await recent, ...await active]) byId.set(row.id, row)
    return [...byId.values()]
}

/**
 * Cardio hecho: sesiones de NexTrain (marcadas o con datos) y actividades de
 * Strava que no estén ya contadas a través de una sesión, como en Temporada.
 */
async function loadCardio(supabase: Supabase, coachId: string, since: string): Promise<CardioFact[]> {
    const [sessions, activities] = await Promise.all([
        fetchAll<any>((from, to) => supabase
            .from('cardio_sessions')
            .select('id, client_id, scheduled_date, activity_type, training_type, structure, is_completed, actual_distance_km, actual_duration_min, avg_heart_rate, rpe, strava_activity_id')
            .eq('coach_id', coachId)
            .gte('scheduled_date', since)
            .order('id')
            .range(from, to)),
        fetchAll<any>((from, to) => supabase
            .from('strava_activities')
            .select('id, client_id, start_date_local, sport_type, activity_type, distance_meters, moving_time_seconds, average_heartrate, total_elevation_gain, rpe, cardio_session_id, matched_planned_session_id, is_deleted')
            .eq('coach_id', coachId)
            .gte('start_date_local', `${since}T00:00:00`)
            .order('id')
            .range(from, to)),
    ])

    const stravaById = new Map(activities.filter(activity => !activity.is_deleted).map(activity => [activity.id, activity]))
    const countedSessions = new Set<string>()
    const countedStrava = new Set<string>()
    const facts: CardioFact[] = []

    for (const session of sessions) {
        const done = session.is_completed || Number(session.actual_duration_min) > 0 || Number(session.actual_distance_km) > 0
        if (!done) continue
        countedSessions.add(session.id)
        const linked = session.strava_activity_id ? stravaById.get(session.strava_activity_id) : null
        if (linked) countedStrava.add(linked.id)
        // Marcada como hecha sin datos: se toman los de Strava si está enlazada
        facts.push({
            a: session.client_id,
            d: session.scheduled_date,
            disc: seasonDiscipline(session.activity_type, session.training_type, session.structure?.trainingType),
            km: positiveOrNull(session.actual_distance_km) ?? (linked ? positiveOrNull(Number(linked.distance_meters) / 1000) : null),
            min: positiveOrNull(session.actual_duration_min) ?? (linked ? positiveOrNull(Number(linked.moving_time_seconds) / 60) : null),
            hr: positiveOrNull(session.avg_heart_rate) ?? (linked ? positiveOrNull(linked.average_heartrate) : null),
            rpe: positiveOrNull(session.rpe) ?? (linked ? positiveOrNull(linked.rpe) : null),
            elev: linked ? numberOrNull(linked.total_elevation_gain) : null,
        })
    }

    for (const activity of stravaById.values()) {
        if (countedStrava.has(activity.id)) continue
        if (activity.cardio_session_id && countedSessions.has(activity.cardio_session_id)) continue
        if (activity.matched_planned_session_id && countedSessions.has(activity.matched_planned_session_id)) continue
        facts.push({
            a: activity.client_id,
            d: String(activity.start_date_local).slice(0, 10),
            disc: seasonDiscipline(activity.sport_type, activity.activity_type),
            km: positiveOrNull(Number(activity.distance_meters) / 1000),
            min: positiveOrNull(Number(activity.moving_time_seconds) / 60),
            hr: positiveOrNull(activity.average_heartrate),
            rpe: positiveOrNull(activity.rpe),
            elev: numberOrNull(activity.total_elevation_gain),
        })
    }
    return facts
}

/**
 * Hechos de Analítica del coach desde `since`: series, métricas diarias,
 * cardio y el seguimiento actual de cada atleta. El motor (engine.js) los
 * agrega en el navegador para cada gráfico.
 */
export async function loadAnalyticsFacts(coachId: string, since: string): Promise<AnalyticsFacts> {
    const supabase = await createClient()
    const { toDay, today } = await coachClock(supabase, coachId)
    const setsSince = [since, addDays(today, -7 * TRACKING_WEEKS)].sort()[0]

    const [clientsRes, programsRes, groupsRes, exerciseRows, bodyRows, cardio] = await Promise.all([
        supabase.from('clients').select('id, full_name, status').eq('coach_id', coachId),
        supabase.from('training_programs').select('id, client_id, name, status, effective_from').eq('coach_id', coachId),
        supabase.from('muscle_groups').select('name, legacy_key, counts_for_volume, sort_order').order('sort_order'),
        fetchAll<any>((from, to) => supabase
            .from('training_exercises')
            .select('id, program_id, exercise_name, catalog_exercise_id, muscle_group, sets, rir, exercise_catalog(name, primary_group)')
            .eq('coach_id', coachId)
            .order('id')
            .range(from, to)),
        fetchAll<any>((from, to) => supabase
            .from('client_metrics')
            .select('client_id, metric_date, weight_kg, steps, sleep_h, sleep_score, hrv_ms, fatigue')
            .eq('coach_id', coachId)
            .gte('metric_date', since)
            .order('metric_date')
            .range(from, to)),
        loadCardio(supabase, coachId, since),
    ])
    for (const res of [clientsRes, programsRes, groupsRes]) if (res.error) throw new Error(res.error.message)

    const programs = (programsRes.data ?? []).map((row: any) => ({
        id: row.id as string,
        clientId: row.client_id as string,
        name: row.name as string,
        status: row.status as string,
        effectiveFrom: row.effective_from as string | null,
    }))
    const activeProgramIds = programs.filter(program => program.status === 'active').map(program => program.id)
    const setRows = await loadSets(supabase, coachId, setsSince, activeProgramIds)

    // Grupo de un ejercicio: el de su catálogo; sin catálogo, el de su clave interna (muscle_groups)
    const groups = groupsRes.data ?? []
    const groupByLegacyKey = new Map(groups.filter(group => group.legacy_key).map(group => [group.legacy_key as string, group.name as string]))
    const countsForVolume = new Map(groups.map(group => [group.name as string, group.counts_for_volume as boolean]))

    const exercises = exerciseRows.map((row: any) => {
        const catalog = embedOne<{ name: string; primary_group: string }>(row.exercise_catalog)
        const group = catalog?.primary_group ?? groupByLegacyKey.get(row.muscle_group) ?? null
        const name = catalog?.name || row.exercise_name || 'Ejercicio'
        return {
            id: row.id as string,
            programId: row.program_id as string,
            name,
            exerciseKey: (row.catalog_exercise_id as string | null) ?? `name:${normalizeExerciseName(name)}`,
            group,
            countsForVolume: group ? countsForVolume.get(group) ?? true : false,
            prescribedSets: row.sets ?? null,
            prescribedRir: row.rir != null ? Number(row.rir) : null,
        }
    })

    const athletes = (clientsRes.data ?? []).map((row: any) => ({ id: row.id as string, name: (row.full_name as string) || 'Sin nombre', status: row.status as string }))
    const sets = setRows.map(row => ({
        exerciseId: row.exercise_id as string,
        weekIndex: row.week_index as number,
        weightKg: Number(row.weight_kg),
        reps: Number(row.reps),
        rir: row.rir != null ? Number(row.rir) : null,
        day: toDay.format(new Date(row.performed_at)),
    }))

    // Seguimiento: mismos cálculos que Progreso (adherencia, Δ del bloque, último registro)
    const tracking = trackingRows({ today, athletes, programs, exercises, sets }).map(row => ({
        a: row.id,
        adherence: row.adherence,
        block_e1rm: row.e1rmDelta,
        days_since_log: row.daysSinceLog,
    }))

    const programClient = new Map(programs.map(program => [program.id, program.clientId]))
    const exerciseById = new Map(exercises.map(exercise => [exercise.id, exercise]))
    const strength = sets.flatMap(set => {
        if (set.day < since) return []
        const exercise = exerciseById.get(set.exerciseId)
        const athlete = exercise && programClient.get(exercise.programId)
        if (!exercise || !athlete) return []
        return [{
            a: athlete,
            d: set.day,
            x: exercise.exerciseKey,
            g: exercise.group,
            v: exercise.countsForVolume,
            kg: set.weightKg,
            reps: set.reps,
            rir: set.rir,
            prir: exercise.prescribedRir,
            // Con más de 12 reps la estimación no es fiable (y un 106 por 10 la dispara)
            e1rm: set.reps >= 1 && set.reps <= E1RM_MAX_REPS ? epley1RM({ weightKg: set.weightKg, reps: set.reps } as any) : null,
            ton: set.weightKg * set.reps,
        }]
    })

    // Ejercicios con series en el periodo, una entrada por ejercicio del catálogo
    const exerciseOptions = new Map<string, { key: string; name: string; group: string | null }>()
    for (const exercise of exercises) {
        if (!exerciseOptions.has(exercise.exerciseKey)) exerciseOptions.set(exercise.exerciseKey, { key: exercise.exerciseKey, name: exercise.name, group: exercise.group })
    }

    return {
        today,
        loadedFrom: since,
        athletes,
        exercises: [...exerciseOptions.values()],
        strength,
        body: bodyRows.map((row: any) => ({
            a: row.client_id,
            d: row.metric_date,
            weight: positiveOrNull(row.weight_kg),
            steps: numberOrNull(row.steps),
            sleep_h: positiveOrNull(row.sleep_h),
            sleep_score: numberOrNull(row.sleep_score),
            hrv: positiveOrNull(row.hrv_ms),
            fatigue: numberOrNull(row.fatigue),
        })),
        cardio,
        tracking,
    }
}
