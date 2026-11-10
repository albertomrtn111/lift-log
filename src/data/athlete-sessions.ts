import 'server-only'

import { itemForPerson } from '@/lib/studio/group-rules'
import { mediaForExercise } from '@/lib/studio/media-rules'
import { createClient } from '@/lib/supabase/server'

export interface AthleteSessionSummary {
    id: string
    session_date: string
    start_time: string | null
    name: string | null
    is_group: boolean
    rpe: number | null
    exercises: number
    report_code: string | null
}

export interface AthleteMedia {
    id: string
    catalog_exercise_id: string
    client_id: string | null
    kind: 'youtube' | 'link' | 'image' | 'video'
    url: string | null
    storage_key: string | null
    title: string | null
    video: { title: string; storage_key: string; thumb_key: string | null } | null
}

export interface AthleteAppointment {
    id: string
    starts_at: string
}

export interface AthleteSessionItem {
    id: string
    catalog_exercise_id: string
    media: AthleteMedia[]
    section_id: string | null
    sort_order: number
    exercise_name: string
    sets: number | null
    reps: string | null
    time_seconds: number | null
    load_kg: number | null
    rir: number | null
    rpe: number | null
    velocity_ms: number | null
    next_load: string | null
    tags: string[]
    circuit: string[]
}

export interface AthleteSessionDetail extends Omit<AthleteSessionSummary, 'exercises'> {
    duration_min: number | null
    sections: { id: string; title: string; parent_title: string | null; sort_order: number }[]
    items: AthleteSessionItem[]
    feedback: { rpe: number | null; comment: string | null } | null
}

const SESSION_COLUMNS = 'id, group_id, session_date, start_time, name, rpe, duration_min, session_reports(code, client_id)'

type SessionRow = {
    id: string
    group_id: string | null
    session_date: string
    start_time: string | null
    name: string | null
    rpe: number | null
    duration_min: number | null
    session_reports: { code: string; client_id: string }[] | null
    studio_session_items?: { id: string }[] | null
}

function toSummary(row: SessionRow, clientId: string) {
    return {
        id: row.id,
        session_date: row.session_date,
        start_time: row.start_time,
        name: row.name,
        is_group: row.group_id !== null,
        rpe: row.rpe,
        report_code: row.session_reports?.find(report => report.client_id === clientId)?.code ?? null,
    }
}

/** Sesiones hechas: las suyas y las clases a las que vino. Las nuevas, primero. */
export async function getAthleteSessions(clientId: string): Promise<AthleteSessionSummary[]> {
    const supabase = await createClient()
    const { data: attended } = await supabase
        .from('studio_session_attendance')
        .select('session_id')
        .eq('client_id', clientId)
        .eq('status', 'attended')
    const classes = (attended ?? []).map(row => row.session_id as string)
    const { data } = await supabase
        .from('studio_sessions')
        .select(`${SESSION_COLUMNS}, studio_session_items(id)`)
        .eq('status', 'done')
        .or(classes.length > 0 ? `client_id.eq.${clientId},id.in.(${classes.join(',')})` : `client_id.eq.${clientId}`)
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false, nullsFirst: false })
        .limit(200)

    return ((data ?? []) as unknown as SessionRow[]).map(row => ({
        ...toSummary(row, clientId),
        exercises: row.studio_session_items?.length ?? 0,
    }))
}

export async function getAthleteSession(clientId: string, sessionId: string): Promise<AthleteSessionDetail | null> {
    const supabase = await createClient()
    const { data: session } = await supabase
        .from('studio_sessions')
        .select(SESSION_COLUMNS)
        .eq('id', sessionId)
        .eq('status', 'done')
        .maybeSingle()
    if (!session) return null

    const [{ data: sections }, { data: items }, { data: people }, { data: media }, { data: feedback }] = await Promise.all([
        supabase.from('studio_session_sections').select('id, title, parent_title, sort_order').eq('session_id', sessionId).order('sort_order'),
        supabase
            .from('studio_session_items')
            .select('id, catalog_exercise_id, section_id, sort_order, sets, reps, time_seconds, load_kg, rir, rpe, velocity_ms, next_load, circuit, exercise_catalog(name)')
            .eq('session_id', sessionId)
            .eq('is_done', true)
            .order('sort_order'),
        supabase.from('studio_item_people').select('item_id, client_id, load_kg, reps, time_seconds, rir, rpe, velocity_ms, next_load').eq('client_id', clientId),
        supabase
            .from('exercise_media')
            .select('id, catalog_exercise_id, client_id, kind, url, storage_key, title, video:media_assets(title, storage_key, thumb_key)')
            .or(`client_id.is.null,client_id.eq.${clientId}`)
            .order('created_at'),
        supabase.from('studio_session_feedback').select('rpe, comment').eq('session_id', sessionId).eq('client_id', clientId).maybeSingle(),
    ])

    const row = session as unknown as SessionRow
    return {
        ...toSummary(row, clientId),
        duration_min: row.duration_min,
        sections: sections ?? [],
        feedback: feedback ?? null,
        items: (items ?? []).map(({ exercise_catalog: embed, ...item }) => {
            const catalog = embed as unknown as { name: string } | null
            const person = (people ?? []).find(entry => entry.item_id === item.id)
            const own = mediaForExercise((media ?? []) as unknown as AthleteMedia[], item.catalog_exercise_id)
            return itemForPerson({ ...item, exercise_name: catalog?.name ?? '', tags: [], media: own }, person) as AthleteSessionItem
        }),
    }
}

/** Sus próximas citas. Sin agenda conectada, ninguna. */
export async function getAthleteAppointments(clientId: string): Promise<AthleteAppointment[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('agenda_appointments')
        .select('id, starts_at')
        .eq('client_id', clientId)
        .neq('status', 'canceled')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(5)
    return data ?? []
}
