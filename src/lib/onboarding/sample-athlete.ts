import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { todayInTimezone } from '@/lib/reviews/scheduler'
import { getDefaultTrainingColumns } from '@/lib/training/defaultColumns'
import { getCoachWorkspaceInfo, updateCoachOnboardingState } from './coach-workspace'
import {
    SAMPLE_MACROS,
    SAMPLE_PROGRAM,
    buildSampleAnalysis,
    buildSampleAthleteData,
} from './sample-athlete-data.js'

export const SAMPLE_ATHLETE_NAME = 'Lucía Romero'

/** Dominio reservado (RFC 2606): ningún email puede llegar a entregarse */
function sampleEmail(coachId: string) {
    return `lucia.ejemplo.${coachId.slice(0, 8)}@example.invalid`
}

/** Id de la atleta de ejemplo del coach, si existe */
export async function getSampleClientId(coachId: string): Promise<string | null> {
    const admin = createAdminClient()
    const { data } = await admin
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
        .eq('is_sample', true)
        .limit(1)
        .maybeSingle()
    return data?.id ?? null
}

/** ¿Es la atleta de ejemplo? Devuelve false si la columna aún no existe. */
export async function isSampleClient(clientId: string): Promise<boolean> {
    const admin = createAdminClient()
    const { data, error } = await admin.from('clients').select('is_sample').eq('id', clientId).maybeSingle()
    if (error) return false
    return Boolean(data?.is_sample)
}

/**
 * Crea a Lucía con seis semanas de datos. Solo una vez por espacio: si el
 * coach la borra, no vuelve a aparecer.
 */
export async function createSampleAthlete(coachId: string, coachUserId: string): Promise<string | null> {
    const workspace = await getCoachWorkspaceInfo(coachId)
    if (!workspace) throw new Error('Espacio no encontrado')

    const existing = await getSampleClientId(coachId)
    if (existing) return existing
    if (workspace.onboarding_state.sample_created_at) return null

    const admin = createAdminClient()
    const data = buildSampleAthleteData(todayInTimezone())
    const owned = { coach_id: coachId }

    const { data: client, error: clientError } = await admin
        .from('clients')
        .insert({
            ...owned,
            full_name: SAMPLE_ATHLETE_NAME,
            email: sampleEmail(coachId),
            status: 'active',
            is_sample: true,
            start_date: data.startDate,
            checkin_frequency_days: 7,
            next_checkin_date: data.nextCheckinDate,
            height_cm: 166,
            onboarding_status: 'accepted',
            invite_status: 'accepted',
            notes: 'Atleta de ejemplo de NexTrain. No recibe emails ni avisos.',
        })
        .select('id')
        .single()

    if (clientError || !client) throw new Error(clientError?.message ?? 'No se pudo crear la atleta de ejemplo')
    const clientId = client.id as string
    const forClient = { ...owned, client_id: clientId }

    try {
        await seedTraining(admin, forClient, coachUserId, data)
        await insertAll(admin, 'client_metrics', data.metrics.map(metric => ({ ...forClient, ...metric, created_by: coachUserId })))
        await insertAll(admin, 'diet_adherence_logs', data.adherence.map(log => ({ ...forClient, ...log, created_by: coachUserId })))
        await insertAll(admin, 'macro_plans', [{
            ...forClient,
            ...SAMPLE_MACROS,
            effective_from: data.startDate,
            created_by: coachUserId,
        }])
        await seedReviews(admin, forClient, coachUserId, data)
        await updateCoachOnboardingState(coachId, { sample_created_at: new Date().toISOString() })
        return clientId
    } catch (error) {
        // No dejamos a medias a la atleta de ejemplo
        await admin.rpc('delete_sample_client', { p_coach_id: coachId, p_client_id: clientId })
        throw error
    }
}

/** Borra a Lucía y todo lo que cuelgue de ella, en una sola transacción */
export async function deleteSampleAthlete(coachId: string, clientId: string) {
    const admin = createAdminClient()
    const { error } = await admin.rpc('delete_sample_client', { p_coach_id: coachId, p_client_id: clientId })
    if (error) throw new Error(error.message)
}

type Admin = ReturnType<typeof createAdminClient>
type SampleData = ReturnType<typeof buildSampleAthleteData>
type ClientScope = { coach_id: string; client_id: string }

async function insertAll(admin: Admin, table: string, rows: Record<string, unknown>[], columns = 'id') {
    if (rows.length === 0) return []
    const { data, error } = await admin.from(table).insert(rows).select(columns)
    if (error) throw new Error(`${table}: ${error.message}`)
    return (data ?? []) as unknown as { id: string; order_index?: number }[]
}

async function seedTraining(admin: Admin, scope: ClientScope, coachUserId: string, data: SampleData) {
    const [program] = await insertAll(admin, 'training_programs', [{
        ...scope,
        name: SAMPLE_PROGRAM.name,
        weeks: SAMPLE_PROGRAM.weeks,
        total_weeks: SAMPLE_PROGRAM.weeks,
        status: 'active',
        effective_from: data.startDate,
        created_by: coachUserId,
    }])
    const owned = { coach_id: scope.coach_id, program_id: program.id }

    await insertAll(admin, 'training_columns', getDefaultTrainingColumns().map(column => ({ ...owned, ...column })))

    const days = await insertAll(admin, 'training_days', SAMPLE_PROGRAM.days.map((day, index) => ({
        ...owned,
        name: day.name,
        day_name: day.name,
        order_index: index + 1,
        day_order: index + 1,
        default_weekday: day.default_weekday,
    })), 'id, order_index')
    const dayIds = SAMPLE_PROGRAM.days.map((_, index) => {
        const day = days.find(row => row.order_index === index + 1)
        if (!day) throw new Error('training_days: falta un día del programa')
        return day.id
    })

    await insertAll(admin, 'training_exercises', SAMPLE_PROGRAM.days.flatMap((day, dayIndex) =>
        day.exercises.map((exercise, index) => ({
            ...owned,
            day_id: dayIds[dayIndex],
            order_index: index + 1,
            ...exercise,
        }))
    ))

    await insertAll(admin, 'scheduled_strength_sessions', data.sessions.map(session => ({
        ...scope,
        program_id: program.id,
        day_id: dayIds[session.day_index],
        scheduled_date: session.scheduled_date,
        is_completed: session.is_completed,
    })))
}

async function seedReviews(admin: Admin, scope: ClientScope, coachUserId: string, data: SampleData) {
    const checkins = await insertAll(admin, 'checkins', data.checkins.map(checkin => ({
        ...scope,
        type: 'checkin',
        source: 'sample',
        status: checkin.reviewed ? 'archived' : 'reviewed',
        submitted_at: `${checkin.submitted_on}T08:30:00+02:00`,
        period_start: checkin.period_start,
        period_end: checkin.period_end,
        weight_kg: checkin.weight_kg,
        weight_avg_kg: checkin.weight_avg_kg,
        steps_avg: checkin.steps_avg,
        sleep_avg_h: checkin.sleep_avg_h,
        training_adherence_pct: checkin.training_adherence_pct,
        nutrition_adherence_pct: checkin.nutrition_adherence_pct,
        notes: checkin.notes,
        raw_payload: {},
    })))

    const current = data.checkins[data.checkins.length - 1]
    const previous = data.checkins[data.checkins.length - 2]
    const analysis = buildSampleAnalysis(current, previous)

    await insertAll(admin, 'reviews', data.checkins.map((checkin, index) => {
        const base = { ...scope, checkin_id: checkins[index].id, created_by: coachUserId }
        if (checkin.reviewed) {
            return {
                ...base,
                status: 'approved',
                approved_by: coachUserId,
                message_to_client: checkin.message_to_client,
                created_at: `${checkin.submitted_on}T10:00:00+02:00`,
            }
        }
        return {
            ...base,
            status: 'draft',
            ai_status: 'completed',
            ai_summary: analysis.overall_summary,
            analysis,
            ai_generated_at: `${checkin.submitted_on}T08:31:00+02:00`,
            created_at: `${checkin.submitted_on}T08:30:00+02:00`,
        }
    }))

    // Historial de chat con el feedback de las semanas anteriores
    await insertAll(admin, 'messages', data.checkins
        .filter(checkin => checkin.message_to_client)
        .map(checkin => ({
            ...scope,
            sender_role: 'coach',
            sender_id: coachUserId,
            content: checkin.message_to_client,
            message_type: 'review_feedback',
            read_at: `${checkin.submitted_on}T20:00:00+02:00`,
            created_at: `${checkin.submitted_on}T10:00:00+02:00`,
        })))
}
