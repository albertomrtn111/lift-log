'use server'

import { z } from 'zod'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { getWeeklySchedule } from './planning-actions'
import { cardioSessionMetrics } from '@/lib/cardio/structure'
import {
    SEASON_DISCIPLINES, addDays, aggregateSeasonVolume, isMonday, measureFor, mondayOf,
    seasonDiscipline, seasonWeekStarts, targetAmount, weekTiming,
} from '@/lib/season/volume'
import type {
    SeasonDiscipline, SeasonEventOption, SeasonOverview, SeasonPlan, SeasonUnit, SeasonWeek,
    SeasonWeekSummary, SeasonWeekTarget, SeasonWeekType,
} from '@/types/season'

type Result<T> = { success: true; data: T } | { success: false; error: string }

const disciplineSchema = z.enum(['run', 'bike', 'swim', 'strength', 'other'])
const weekTypeSchema = z.enum(['carga', 'descarga', 'test', 'competicion', 'transicion'])
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')

function failure(error: unknown): { success: false; error: string } {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0]?.message ?? 'Revisa los datos.' }
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo completar la acción.' }
}

function parseLocalDate(value: string) {
    return new Date(`${value}T12:00:00`)
}

type Supabase = Awaited<ReturnType<typeof requireActiveCoachId>>['supabase']

async function coachToday(supabase: Supabase, coachId: string) {
    const { data } = await supabase.from('coaches').select('timezone').eq('id', coachId).maybeSingle()
    const timeZone = data?.timezone || 'Europe/Madrid'
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    } catch {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    }
}

function isEmptyStructure(value: unknown) {
    return value == null
        || (Array.isArray(value) && value.length === 0)
        || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0)
}

function numberOrNull(value: unknown) {
    const number = Number(value)
    return value === null || value === undefined || !Number.isFinite(number) ? null : number
}

const SEASON_SELECT = `
    id, name, start_date, end_date, primary_unit, disciplines, status, notes,
    target_event:client_events ( id, title, event_date ),
    season_weeks ( id, week_start, week_type, notes, season_week_targets ( discipline, target_minutes, target_km, target_sessions ) ),
    season_phases ( name, start_date, end_date, sort_order )
`

function toSeasonPlan(row: any): SeasonPlan {
    return {
        id: row.id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        primaryUnit: row.primary_unit,
        disciplines: SEASON_DISCIPLINES.filter((discipline) => (row.disciplines || []).includes(discipline)) as SeasonDiscipline[],
        status: row.status,
        notes: row.notes,
        targetEvent: row.target_event
            ? { id: row.target_event.id, title: row.target_event.title, eventDate: row.target_event.event_date }
            : null,
    }
}

async function loadActiveSeason(supabase: Supabase, coachId: string, clientId: string) {
    const { data, error } = await supabase
        .from('season_plans')
        .select(SEASON_SELECT)
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data as any
}

/**
 * Programado y realizado del atleta entre dos fechas, agregado por semana y
 * disciplina (ver src/lib/season/volume.js para las reglas).
 */
async function loadVolume(supabase: Supabase, clientId: string, weekStarts: string[]) {
    const from = weekStarts[0]
    const to = addDays(weekStarts[weekStarts.length - 1], 6)

    const [cardioResult, stravaResult, strengthDoneResult, schedule] = await Promise.all([
        supabase
            .from('cardio_sessions')
            .select('id, scheduled_date, activity_type, training_type, structure, planned_structure, target_distance_km, target_duration_min, is_completed, actual_distance_km, actual_duration_min, source_provider, strava_activity_id')
            .eq('client_id', clientId)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to),
        supabase
            .from('strava_activities')
            .select('id, start_date_local, sport_type, activity_type, distance_meters, moving_time_seconds, cardio_session_id, matched_planned_session_id, is_deleted')
            .eq('client_id', clientId)
            .gte('start_date_local', `${from}T00:00:00`)
            .lte('start_date_local', `${to}T23:59:59`),
        supabase
            .from('scheduled_strength_sessions')
            .select('scheduled_date')
            .eq('client_id', clientId)
            .eq('is_completed', true)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to),
        // Fuerza programada: incluye las sesiones que genera el programa activo
        getWeeklySchedule(clientId, parseLocalDate(from), parseLocalDate(to)),
    ])

    if (cardioResult.error) throw new Error(cardioResult.error.message)
    if (stravaResult.error) throw new Error(stravaResult.error.message)
    if (strengthDoneResult.error) throw new Error(strengthDoneResult.error.message)
    if (!schedule.success) throw new Error(schedule.error || 'No se pudo leer la planificación.')

    const cardio = (cardioResult.data || []) as any[]
    const disciplineOf = (session: any) => seasonDiscipline(
        session.activity_type,
        session.training_type,
        session.structure?.trainingType,
    )

    // Una importación de Strava sin plan no es algo que el coach programara
    const plannedCardio = cardio
        .filter((session) => session.source_provider !== 'strava' || !isEmptyStructure(session.planned_structure))
        .map((session) => {
            const metrics = cardioSessionMetrics(session)
            return { date: session.scheduled_date, discipline: disciplineOf(session), minutes: metrics.durationMin, km: metrics.distanceKm }
        })

    // Hecha: marcada o con datos reales. Cuenta en su día del calendario.
    const doneCardio = cardio
        .filter((session) => session.is_completed || Number(session.actual_duration_min) > 0 || Number(session.actual_distance_km) > 0)
        .map((session) => ({
            id: session.id,
            date: session.scheduled_date,
            discipline: disciplineOf(session),
            minutes: numberOrNull(session.actual_duration_min),
            km: numberOrNull(session.actual_distance_km),
            stravaActivityId: session.strava_activity_id,
        }))

    const stravaActivities = ((stravaResult.data || []) as any[])
        .filter((activity) => !activity.is_deleted)
        .map((activity) => ({
            id: activity.id,
            date: String(activity.start_date_local).slice(0, 10),
            discipline: seasonDiscipline(activity.sport_type, activity.activity_type),
            minutes: Number(activity.moving_time_seconds) > 0 ? Number(activity.moving_time_seconds) / 60 : null,
            km: Number(activity.distance_meters) > 0 ? Number(activity.distance_meters) / 1000 : null,
            cardioSessionId: activity.cardio_session_id,
            matchedSessionId: activity.matched_planned_session_id,
        }))

    const plannedStrength = (schedule.data?.items || [])
        .filter((item) => item.type === 'strength')
        .map((item) => ({ date: item.date }))

    return aggregateSeasonVolume({
        weekStarts,
        plannedCardio,
        plannedStrength,
        doneCardio,
        stravaActivities,
        doneStrength: ((strengthDoneResult.data || []) as any[]).map((row) => ({ date: row.scheduled_date })),
    })
}

function phaseForWeek(phases: any[], weekStart: string) {
    const weekEnd = addDays(weekStart, 6)
    return [...(phases || [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .find((phase) => phase.start_date <= weekEnd && phase.end_date >= weekStart)?.name ?? null
}

function buildWeeks(row: any, volume: Awaited<ReturnType<typeof loadVolume>>, today: string): SeasonWeek[] {
    const weeks = [...(row.season_weeks || [])].sort((a: any, b: any) => a.week_start.localeCompare(b.week_start))
    return weeks.map((week: any, index: number) => {
        const targets = new Map<string, SeasonWeekTarget>(
            (week.season_week_targets || []).map((target: any) => [target.discipline, {
                target_minutes: numberOrNull(target.target_minutes),
                target_km: numberOrNull(target.target_km),
                target_sessions: numberOrNull(target.target_sessions),
            }])
        )
        const weekVolume = volume[week.week_start]
        const disciplines = Object.fromEntries(SEASON_DISCIPLINES.map((discipline) => [discipline, {
            target: targets.get(discipline) ?? null,
            planned: weekVolume?.[discipline]?.planned ?? { minutes: 0, km: 0, sessions: 0 },
            done: weekVolume?.[discipline]?.done ?? { minutes: 0, km: 0, sessions: 0 },
            doneMissingData: weekVolume?.[discipline]?.doneMissingData ?? 0,
        }])) as SeasonWeek['disciplines']

        return {
            id: week.id,
            weekStart: week.week_start,
            weekNumber: index + 1,
            weekType: week.week_type,
            notes: week.notes,
            timing: weekTiming(week.week_start, today),
            phaseName: phaseForWeek(row.season_phases, week.week_start),
            disciplines,
        }
    })
}

// ----------------------------------------------------------------------
// LECTURA
// ----------------------------------------------------------------------

export async function getSeasonOverview(
    clientId: string,
    coachIdFromClient: string,
): Promise<Result<{ overview: SeasonOverview | null; events: SeasonEventOption[] }>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
        const today = await coachToday(supabase, coachId)
        const row = await loadActiveSeason(supabase, coachId, clientId)

        if (!row) {
            const { data: events, error } = await supabase
                .from('client_events')
                .select('id, title, event_date, event_type')
                .eq('coach_id', coachId)
                .eq('client_id', clientId)
                .eq('status', 'planned')
                .gte('event_date', today)
                .order('event_date', { ascending: true })
                .limit(20)
            if (error) throw new Error(error.message)
            return {
                success: true,
                data: {
                    overview: null,
                    events: (events || []).map((event: any) => ({
                        id: event.id, title: event.title, eventDate: event.event_date, eventType: event.event_type,
                    })),
                },
            }
        }

        const weekStarts = [...(row.season_weeks || [])].map((week: any) => week.week_start).sort()
        const volume = weekStarts.length ? await loadVolume(supabase, clientId, weekStarts) : {}
        return {
            success: true,
            data: {
                overview: { season: toSeasonPlan(row), weeks: buildWeeks(row, volume as any, today), today },
                events: [],
            },
        }
    } catch (error) {
        console.error('[getSeasonOverview] Error:', error)
        return failure(error)
    }
}

/** Objetivo y programado de una semana, para la cabecera de Planificación */
export async function getSeasonWeekSummary(
    clientId: string,
    coachIdFromClient: string,
    weekStart: string,
): Promise<Result<SeasonWeekSummary | null>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId(coachIdFromClient)
        const row = await loadActiveSeason(supabase, coachId, clientId)
        if (!row) return { success: true, data: null }

        const monday = mondayOf(weekStart)
        const weeks = [...(row.season_weeks || [])].sort((a: any, b: any) => a.week_start.localeCompare(b.week_start))
        const index = weeks.findIndex((week: any) => week.week_start === monday)
        if (index < 0) return { success: true, data: null }

        const season = toSeasonPlan(row)
        const volume = await loadVolume(supabase, clientId, [monday])
        const [week] = buildWeeks({ ...row, season_weeks: [weeks[index]] }, volume, monday)

        return {
            success: true,
            data: {
                seasonId: season.id,
                seasonName: season.name,
                primaryUnit: season.primaryUnit,
                weekNumber: index + 1,
                totalWeeks: weeks.length,
                weekType: week.weekType,
                phaseName: week.phaseName,
                disciplines: season.disciplines.map((discipline) => {
                    const measure = measureFor(discipline, season.primaryUnit)
                    const value = week.disciplines[discipline]
                    return { discipline, measure, target: targetAmount(value.target, measure), planned: value.planned[measure] }
                }),
            },
        }
    } catch (error) {
        console.error('[getSeasonWeekSummary] Error:', error)
        return failure(error)
    }
}

// ----------------------------------------------------------------------
// ESCRITURA
// ----------------------------------------------------------------------

const createSeasonSchema = z.object({
    coachId: z.string().uuid(),
    clientId: z.string().uuid(),
    name: z.string().trim().min(1, 'Ponle un nombre a la temporada.').max(120),
    startDate: dateSchema.refine(isMonday, 'La temporada empieza siempre en lunes.'),
    weeks: z.number().int().min(1, 'Mínimo 1 semana.').max(60, 'Máximo 60 semanas.'),
    primaryUnit: z.enum(['time', 'distance']),
    disciplines: z.array(disciplineSchema).min(1, 'Elige al menos una disciplina.'),
    targetEventId: z.string().uuid().nullable().optional(),
    // Volumen igual para todas las semanas, en la magnitud de cada disciplina
    baseTargets: z.record(disciplineSchema, z.number().min(0).max(100000)).optional(),
})

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>

function targetColumns(discipline: SeasonDiscipline, unit: SeasonUnit, value: number | null) {
    const measure = measureFor(discipline, unit)
    return {
        target_minutes: measure === 'minutes' && value !== null ? Math.round(value) : null,
        target_km: measure === 'km' && value !== null ? Math.round(value * 10) / 10 : null,
        target_sessions: measure === 'sessions' && value !== null ? Math.round(value) : null,
    }
}

export async function createSeasonPlan(input: CreateSeasonInput): Promise<Result<{ id: string }>> {
    try {
        const data = createSeasonSchema.parse(input)
        const { supabase, coachId } = await requireActiveCoachId(data.coachId)
        const weekStarts = seasonWeekStarts(data.startDate, data.weeks)

        const { data: plan, error } = await supabase
            .from('season_plans')
            .insert({
                coach_id: coachId,
                client_id: data.clientId,
                name: data.name,
                start_date: data.startDate,
                end_date: addDays(weekStarts[weekStarts.length - 1], 6),
                target_event_id: data.targetEventId || null,
                primary_unit: data.primaryUnit,
                disciplines: data.disciplines,
                status: 'active',
            })
            .select('id')
            .single()

        if (error) {
            if (error.code === '23505') throw new Error('Este atleta ya tiene una temporada activa. Archívala antes de crear otra.')
            throw new Error(error.message)
        }

        try {
            const { data: weeks, error: weeksError } = await supabase
                .from('season_weeks')
                .insert(weekStarts.map((weekStart) => ({ season_plan_id: plan.id, week_start: weekStart })))
                .select('id, week_start')
            if (weeksError) throw new Error(weeksError.message)

            const targets = (weeks || []).flatMap((week: any) => data.disciplines
                .filter((discipline) => (data.baseTargets?.[discipline] ?? 0) > 0)
                .map((discipline) => ({
                    season_week_id: week.id,
                    discipline,
                    ...targetColumns(discipline, data.primaryUnit, data.baseTargets![discipline]!),
                })))
            if (targets.length) {
                const { error: targetsError } = await supabase.from('season_week_targets').insert(targets)
                if (targetsError) throw new Error(targetsError.message)
            }
        } catch (childError) {
            // Sin transacción desde el cliente: no dejar una temporada a medias
            await supabase.from('season_plans').delete().eq('id', plan.id)
            throw childError
        }

        return { success: true, data: { id: plan.id } }
    } catch (error) {
        console.error('[createSeasonPlan] Error:', error)
        return failure(error)
    }
}

const saveTargetsSchema = z.object({
    coachId: z.string().uuid(),
    changes: z.array(z.object({
        seasonWeekId: z.string().uuid(),
        discipline: disciplineSchema,
        value: z.number().min(0).max(100000).nullable(),
    })).min(1).max(300),
})

export type SeasonTargetChange = z.infer<typeof saveTargetsSchema>['changes'][number]

/**
 * Guarda objetivos de una o varias celdas (edición, copiar semana, reescalar).
 * El valor va en la magnitud de la disciplina; null borra el objetivo.
 */
export async function saveSeasonWeekTargets(input: z.infer<typeof saveTargetsSchema>): Promise<Result<null>> {
    try {
        const data = saveTargetsSchema.parse(input)
        const { supabase } = await requireActiveCoachId(data.coachId)
        const weekIds = [...new Set(data.changes.map((change) => change.seasonWeekId))]

        const { data: weeks, error: weeksError } = await supabase
            .from('season_weeks')
            .select('id, season_plans!inner ( primary_unit )')
            .in('id', weekIds)
        if (weeksError) throw new Error(weeksError.message)
        if (!weeks || weeks.length !== weekIds.length) throw new Error('Semana no encontrada.')
        const unitByWeek = new Map((weeks as any[]).map((week) => [week.id, week.season_plans.primary_unit as SeasonUnit]))

        for (const change of data.changes.filter((item) => item.value === null)) {
            const { error } = await supabase
                .from('season_week_targets')
                .delete()
                .eq('season_week_id', change.seasonWeekId)
                .eq('discipline', change.discipline)
            if (error) throw new Error(error.message)
        }

        const rows = data.changes
            .filter((change) => change.value !== null)
            .map((change) => ({
                season_week_id: change.seasonWeekId,
                discipline: change.discipline,
                ...targetColumns(change.discipline, unitByWeek.get(change.seasonWeekId)!, change.value),
            }))
        if (rows.length) {
            const { error } = await supabase
                .from('season_week_targets')
                .upsert(rows, { onConflict: 'season_week_id,discipline' })
            if (error) throw new Error(error.message)
        }
        return { success: true, data: null }
    } catch (error) {
        console.error('[saveSeasonWeekTargets] Error:', error)
        return failure(error)
    }
}

const saveWeekSchema = z.object({
    coachId: z.string().uuid(),
    seasonWeekId: z.string().uuid(),
    weekType: weekTypeSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
})

export async function saveSeasonWeek(input: z.infer<typeof saveWeekSchema>): Promise<Result<null>> {
    try {
        const data = saveWeekSchema.parse(input)
        const { supabase } = await requireActiveCoachId(data.coachId)
        const patch: { week_type?: SeasonWeekType; notes?: string | null } = {}
        if (data.weekType) patch.week_type = data.weekType
        if (data.notes !== undefined) patch.notes = data.notes?.trim() || null
        const { error } = await supabase.from('season_weeks').update(patch).eq('id', data.seasonWeekId)
        if (error) throw new Error(error.message)
        return { success: true, data: null }
    } catch (error) {
        console.error('[saveSeasonWeek] Error:', error)
        return failure(error)
    }
}

const archiveSchema = z.object({ coachId: z.string().uuid(), seasonId: z.string().uuid() })

export async function archiveSeasonPlan(input: z.infer<typeof archiveSchema>): Promise<Result<null>> {
    try {
        const data = archiveSchema.parse(input)
        const { supabase, coachId } = await requireActiveCoachId(data.coachId)
        const { error } = await supabase
            .from('season_plans')
            .update({ status: 'archived' })
            .eq('id', data.seasonId)
            .eq('coach_id', coachId)
        if (error) throw new Error(error.message)
        return { success: true, data: null }
    } catch (error) {
        console.error('[archiveSeasonPlan] Error:', error)
        return failure(error)
    }
}
