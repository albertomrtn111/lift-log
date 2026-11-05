import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getLibraryAction, type LibraryBlock, type LibraryEntry } from '@/lib/training/workspace-library-actions'

export interface StudioClientSummary {
    id: string
    fullName: string
    sessionToday: string | null
}

export interface StudioClientHeader {
    id: string
    fullName: string
    birthday: string | null
    notes: string | null
}

export interface StudioSession {
    id: string
    session_date: string
    start_time: string | null
    status: string
    name: string | null
    sort_order: number | null
    professional_id: string | null
    version: number
}

export interface StudioItem {
    id: string
    session_id: string
    catalog_exercise_id: string
    exercise_name: string
    block_key: string | null
    sets: number | null
    reps: string | null
    time_seconds: number | null
    load_kg: number | null
    rir: number | null
    rpe: number | null
    next_load: string | null
    circuit: string[]
    note: string | null
    is_done: boolean
}

export interface StudioGridData {
    client: StudioClientHeader
    sessions: StudioSession[]
    items: StudioItem[]
    blocks: LibraryBlock[]
    entries: LibraryEntry[]
    professionals: Record<string, string>
}

/** Clientes activos del espacio, con quién tiene sesión hoy. */
export async function getStudioClients(coachId: string, today: string): Promise<StudioClientSummary[]> {
    const supabase = await createClient()
    const [{ data: clients }, { data: sessions }] = await Promise.all([
        supabase.from('clients').select('id, full_name').eq('coach_id', coachId).eq('status', 'active').order('full_name'),
        supabase
            .from('studio_sessions')
            .select('id, client_id, start_time')
            .eq('coach_id', coachId)
            .eq('session_date', today)
            .neq('status', 'cancelled'),
    ])
    const todayByClient = new Map((sessions ?? []).map(session => [session.client_id, session.start_time as string | null]))
    return (clients ?? []).map(client => ({
        id: client.id,
        fullName: client.full_name,
        sessionToday: todayByClient.has(client.id) ? (todayByClient.get(client.id) ?? '') : null,
    }))
}

/** Nombres del equipo. profiles solo se lee para uno mismo, así que va con la clave de servicio. */
async function getProfessionalNames(coachId: string) {
    const { data } = await createAdminClient()
        .from('coach_memberships')
        .select('user_id, profiles(full_name)')
        .eq('coach_id', coachId)
    const names: Record<string, string> = {}
    for (const row of data ?? []) {
        const embed = row.profiles as unknown as { full_name: string | null } | { full_name: string | null }[] | null
        const profile = Array.isArray(embed) ? embed[0] : embed
        if (profile?.full_name) names[row.user_id] = profile.full_name
    }
    return names
}

export async function getStudioGrid(coachId: string, clientId: string): Promise<StudioGridData | null> {
    const supabase = await createClient()
    const { data: client } = await supabase
        .from('clients')
        .select('id, full_name, birthday, notes')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (!client) return null

    const [{ data: sessions }, library, professionals] = await Promise.all([
        supabase
            .from('studio_sessions')
            .select('id, session_date, start_time, status, name, sort_order, professional_id, version')
            .eq('client_id', clientId)
            .order('session_date', { ascending: true }),
        getLibraryAction(),
        getProfessionalNames(coachId),
    ])

    const sessionIds = (sessions ?? []).map(session => session.id)
    const { data: items } = sessionIds.length > 0
        ? await supabase
            .from('studio_session_items')
            .select('id, session_id, catalog_exercise_id, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, note, is_done, exercise_catalog(name, block_key)')
            .in('session_id', sessionIds)
            .order('sort_order', { ascending: true })
        : { data: [] }

    return {
        client: {
            id: client.id,
            fullName: client.full_name,
            birthday: client.birthday,
            notes: client.notes,
        },
        sessions: (sessions ?? []) as StudioSession[],
        items: (items ?? []).map(row => {
            const { exercise_catalog: embed, ...item } = row
            const raw = embed as unknown as { name: string; block_key: string | null } | { name: string; block_key: string | null }[] | null
            const catalog = Array.isArray(raw) ? raw[0] : raw
            return { ...item, exercise_name: catalog?.name ?? '', block_key: catalog?.block_key ?? null } as StudioItem
        }),
        blocks: library.success ? library.data?.blocks ?? [] : [],
        entries: library.success ? library.data?.entries ?? [] : [],
        professionals,
    }
}
