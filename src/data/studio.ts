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
    duration_min: number | null
    wellness_sleep: number | null
    wellness_fatigue: number | null
    wellness_stress: number | null
    wellness_soreness: number | null
    wellness_score: number | null
    arrival_note: string | null
    rpe: number | null
}

export interface StudioSection {
    id: string
    session_id: string
    title: string
    parent_title: string | null
    sort_order: number
}

export interface StudioBlockPref {
    block_key: string
    collapsed: boolean | null
    sort_order: number | null
}

export interface StudioItem {
    id: string
    session_id: string
    section_id: string | null
    sort_order: number
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
    version: number
    updated_by: string | null
    updated_at: string
    tags: string[]
    routine_id: string | null
}

export interface StudioRoutineItem {
    catalog_exercise_id: string
    exercise_name: string
    sort_order: number
    sets: number | null
    reps: string | null
    time_seconds: number | null
    load_kg: number | null
    rir: number | null
    rpe: number | null
    note: string | null
}

export interface StudioRoutine {
    id: string
    client_id: string | null
    name: string
    kind: string
    items: StudioRoutineItem[]
}

export interface StudioRequest {
    id: string
    session_id: string
    from_user: string | null
    to_user: string | null
    title: string
    message: string | null
    status: 'pending' | 'done'
    done_by: string | null
}

export interface StudioProfessional {
    id: string
    name: string
}

export interface StudioGridData {
    coachId: string
    client: StudioClientHeader
    sessions: StudioSession[]
    sections: StudioSection[]
    items: StudioItem[]
    blocks: LibraryBlock[]
    entries: LibraryEntry[]
    /** Nombre de cualquiera que haya pasado por el espacio, para el historial. */
    professionals: Record<string, string>
    /** Quien puede dar una sesión hoy. */
    team: StudioProfessional[]
    /** Etiquetas de material o variante del espacio, las más usadas primero. */
    tags: string[]
    routines: StudioRoutine[]
    requests: StudioRequest[]
    blockPrefs: StudioBlockPref[]
    activeInjuries: number
    /** Bloques usados en el espacio en las últimas cuatro semanas. */
    recentBlocks: string[]
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

/** Equipo del espacio. profiles solo se lee para uno mismo, así que va con la clave de servicio. */
async function getStudioTeam(coachId: string) {
    const { data } = await createAdminClient()
        .from('coach_memberships')
        .select('user_id, role, status, profiles(full_name)')
        .eq('coach_id', coachId)
    const names: Record<string, string> = {}
    const team: StudioProfessional[] = []
    for (const row of data ?? []) {
        const embed = row.profiles as unknown as { full_name: string | null } | { full_name: string | null }[] | null
        const profile = Array.isArray(embed) ? embed[0] : embed
        if (!profile?.full_name) continue
        names[row.user_id] = profile.full_name
        if (row.status === 'active' && ['owner', 'admin', 'coach'].includes(row.role)) {
            team.push({ id: row.user_id, name: profile.full_name })
        }
    }
    return { names, team: team.sort((a, b) => a.name.localeCompare(b.name, 'es')) }
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

    const [{ data: sessions }, library, { names, team }, { data: tags }, { data: routines }, { data: requests }, { data: blockPrefs }, { data: recentBlocks }, { count: activeInjuries }] = await Promise.all([
        supabase
            .from('studio_sessions')
            .select('id, session_date, start_time, status, name, sort_order, professional_id, version, duration_min, wellness_sleep, wellness_fatigue, wellness_stress, wellness_soreness, wellness_score, arrival_note, rpe')
            .eq('client_id', clientId)
            .order('session_date', { ascending: true }),
        getLibraryAction(),
        getStudioTeam(coachId),
        supabase.from('studio_tags').select('name').eq('coach_id', coachId).order('uses', { ascending: false }).limit(200),
        supabase
            .from('studio_routines')
            .select('id, client_id, name, kind, studio_routine_items(catalog_exercise_id, sort_order, sets, reps, time_seconds, load_kg, rir, rpe, note, exercise_catalog(name))')
            .eq('coach_id', coachId)
            .order('name'),
        supabase
            .from('studio_requests')
            .select('id, session_id, from_user, to_user, title, message, status, done_by')
            .eq('client_id', clientId)
            .order('created_at'),
        supabase.from('client_block_prefs').select('block_key, collapsed, sort_order').eq('client_id', clientId),
        supabase.rpc('studio_recent_blocks', { p_coach_id: coachId }),
        supabase
            .from('client_injuries')
            .select('id', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .eq('status', 'active'),
    ])

    const sessionIds = (sessions ?? []).map(session => session.id)
    const [{ data: items }, { data: sections }] = sessionIds.length > 0
        ? await Promise.all([
            supabase
                .from('studio_session_items')
                .select('id, session_id, section_id, sort_order, catalog_exercise_id, routine_id, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, note, is_done, version, updated_by, updated_at, exercise_catalog(name, block_key), studio_item_tags(studio_tags(name))')
                .in('session_id', sessionIds)
                .order('sort_order', { ascending: true }),
            supabase
                .from('studio_session_sections')
                .select('id, session_id, title, parent_title, sort_order')
                .in('session_id', sessionIds)
                .order('sort_order', { ascending: true }),
        ])
        : [{ data: [] }, { data: [] }]

    return {
        coachId,
        client: {
            id: client.id,
            fullName: client.full_name,
            birthday: client.birthday,
            notes: client.notes,
        },
        sessions: (sessions ?? []) as StudioSession[],
        sections: (sections ?? []) as StudioSection[],
        items: (items ?? []).map(row => {
            const { exercise_catalog: embed, studio_item_tags: tagLinks, ...item } = row
            const raw = embed as unknown as { name: string; block_key: string | null } | { name: string; block_key: string | null }[] | null
            const catalog = Array.isArray(raw) ? raw[0] : raw
            const links = (tagLinks ?? []) as unknown as { studio_tags: { name: string } | { name: string }[] | null }[]
            return {
                ...item,
                exercise_name: catalog?.name ?? '',
                block_key: catalog?.block_key ?? null,
                tags: links.flatMap(link => link.studio_tags ?? []).map(tag => tag.name),
            } as StudioItem
        }),
        blocks: library.success ? library.data?.blocks ?? [] : [],
        entries: library.success ? library.data?.entries ?? [] : [],
        professionals: names,
        team,
        tags: (tags ?? []).map(tag => tag.name),
        routines: (routines ?? []).map(({ studio_routine_items: routineItems, ...routine }) => ({
            ...routine,
            items: ((routineItems ?? []) as unknown as (Omit<StudioRoutineItem, 'exercise_name'> & { exercise_catalog: { name: string } | { name: string }[] | null })[])
                .map(({ exercise_catalog: embed, ...item }) => ({
                    ...item,
                    exercise_name: (Array.isArray(embed) ? embed[0]?.name : embed?.name) ?? '',
                }))
                .sort((a, b) => a.sort_order - b.sort_order),
        })),
        requests: (requests ?? []) as StudioRequest[],
        blockPrefs: (blockPrefs ?? []) as StudioBlockPref[],
        activeInjuries: activeInjuries ?? 0,
        recentBlocks: (recentBlocks ?? []) as string[],
    }
}
