import { createAdminClient } from '@/lib/supabase/admin'
import { itemForPerson } from '@/lib/studio/group-rules'
import { attachmentImageVisible } from '@/lib/studio/media-rules'
import { pendingReports } from '@/lib/studio/report-rules'
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
    group_id: string | null
    group_name: string | null
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
    /** Imagen y enlace de esta celda. */
    attachment: { image_key: string | null; link_url: string | null } | null
}

export interface StudioExerciseMedia {
    id: string
    catalog_exercise_id: string
    client_id: string | null
    kind: 'youtube' | 'link' | 'image'
    url: string | null
    storage_key: string | null
    title: string | null
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

export interface StudioAttendance {
    session_id: string
    client_id: string
    status: 'unmarked' | 'attended' | 'absent'
    origin: string
}

export interface StudioItemPerson {
    item_id: string
    client_id: string
    load_kg: number | null
    reps: string | null
    time_seconds: number | null
    rir: number | null
    rpe: number | null
    next_load: string | null
}

export interface StudioGroupSummary {
    id: string
    name: string
    kind: string
    schedule: { weekday: number; time: string }[]
    professional_ids: string[]
    is_active: boolean
    members: number
    nextSession: string | null
}

export interface StudioGroupDetail extends Omit<StudioGroupSummary, 'members' | 'nextSession'> {
    members: { id: string; name: string; active: boolean }[]
}

export interface StudioGridData {
    coachId: string
    /** En la cuadrícula de un grupo, lleva su id y su nombre. */
    client: StudioClientHeader
    group: StudioGroupDetail | null
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
    attendance: StudioAttendance[]
    people: StudioItemPerson[]
    /** Bloques usados en el espacio en las últimas cuatro semanas. */
    recentBlocks: string[]
    /** Medios de la sala y, en la cuadrícula de un cliente, los suyos. */
    media: StudioExerciseMedia[]
    imageConsent: boolean
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

const SESSION_COLUMNS = 'id, group_id, session_date, start_time, status, name, sort_order, professional_id, version, duration_min, wellness_sleep, wellness_fatigue, wellness_stress, wellness_soreness, wellness_score, arrival_note, rpe, training_groups(name)'

function withGroupName(rows: any[] | null): StudioSession[] {
    return (rows ?? []).map(({ training_groups: embed, ...session }) => {
        const group = Array.isArray(embed) ? embed[0] : embed
        return { ...session, group_name: group?.name ?? null } as StudioSession
    })
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

    // Sus sesiones y las de los grupos en los que está, salvo aquellas a las que no vino.
    const { data: attended } = await supabase
        .from('studio_session_attendance')
        .select('session_id')
        .eq('client_id', clientId)
        .neq('status', 'absent')
    const groupSessionIds = (attended ?? []).map(row => row.session_id as string)
    const { data: sessions } = await supabase
        .from('studio_sessions')
        .select(SESSION_COLUMNS)
        .or(groupSessionIds.length > 0 ? `client_id.eq.${clientId},id.in.(${groupSessionIds.join(',')})` : `client_id.eq.${clientId}`)
        .order('session_date', { ascending: true })

    return buildGrid(
        coachId,
        { id: client.id, fullName: client.full_name, birthday: client.birthday, notes: client.notes },
        withGroupName(sessions),
        { clientId }
    )
}

export async function getStudioGroupGrid(coachId: string, groupId: string): Promise<StudioGridData | null> {
    const supabase = await createClient()
    const { data: group } = await supabase
        .from('training_groups')
        .select('id, name, kind, schedule, professional_ids, is_active')
        .eq('id', groupId)
        .eq('coach_id', coachId)
        .maybeSingle()
    if (!group) return null

    const [{ data: sessions }, { data: members }] = await Promise.all([
        supabase.from('studio_sessions').select(SESSION_COLUMNS).eq('group_id', groupId).order('session_date', { ascending: true }),
        supabase
            .from('training_group_members')
            .select('client_id, left_on, clients(full_name)')
            .eq('group_id', groupId),
    ])

    const people = (members ?? []).map(row => {
        const embed = row.clients as unknown as { full_name: string } | { full_name: string }[] | null
        const client = Array.isArray(embed) ? embed[0] : embed
        return { id: row.client_id as string, name: client?.full_name ?? 'Cliente', active: row.left_on === null }
    }).sort((a, b) => a.name.localeCompare(b.name, 'es'))

    return buildGrid(
        coachId,
        { id: group.id, fullName: group.name, birthday: null, notes: null },
        withGroupName(sessions),
        { group: { ...group, members: people } as StudioGroupDetail }
    )
}

export async function getStudioGroups(coachId: string, today: string): Promise<StudioGroupSummary[]> {
    const supabase = await createClient()
    const [{ data: groups }, { data: members }, { data: upcoming }] = await Promise.all([
        supabase
            .from('training_groups')
            .select('id, name, kind, schedule, professional_ids, is_active')
            .eq('coach_id', coachId)
            .eq('is_active', true)
            .order('name'),
        supabase.from('training_group_members').select('group_id').is('left_on', null),
        supabase
            .from('studio_sessions')
            .select('group_id, session_date')
            .eq('coach_id', coachId)
            .not('group_id', 'is', null)
            .gte('session_date', today)
            .order('session_date'),
    ])
    return (groups ?? []).map(group => ({
        ...group,
        members: (members ?? []).filter(member => member.group_id === group.id).length,
        nextSession: (upcoming ?? []).find(session => session.group_id === group.id)?.session_date ?? null,
    })) as StudioGroupSummary[]
}

export interface StudioPendingReport {
    sessionId: string
    clientId: string
    groupId: string | null
    name: string
}

/** Sesiones de hoy ya hechas cuyo informe sigue sin enviarse, dentro de la ventana del aviso. */
export async function getStudioPendingReports(coachId: string, today: string): Promise<StudioPendingReport[]> {
    const supabase = await createClient()
    const [{ data: sessions }, { data: settings }] = await Promise.all([
        supabase
            .from('studio_sessions')
            .select('id, client_id, group_id, session_date, start_time, duration_min, clients!studio_sessions_client_id_fkey(full_name), studio_session_attendance(client_id, status, clients(full_name)), session_reports(client_id, dismissed_at, report_deliveries(id))')
            .eq('coach_id', coachId)
            .eq('session_date', today)
            .eq('status', 'done'),
        supabase.from('report_settings').select('notice_hours').eq('coach_id', coachId).maybeSingle(),
    ])

    const rows = (sessions ?? []).flatMap(session => {
        const reports = (session.session_reports ?? []) as unknown as { client_id: string; dismissed_at: string | null; report_deliveries: unknown[] }[]
        const people = session.group_id
            ? ((session.studio_session_attendance ?? []) as unknown as { client_id: string; status: string; clients: { full_name: string } | null }[])
                .filter(entry => entry.status === 'attended')
                .map(entry => ({ clientId: entry.client_id, name: entry.clients?.full_name ?? 'Cliente' }))
            : [{ clientId: session.client_id as string, name: (session.clients as unknown as { full_name: string } | null)?.full_name ?? 'Cliente' }]
        return people.map(person => {
            const report = reports.find(entry => entry.client_id === person.clientId)
            return {
                ...person,
                sessionId: session.id,
                groupId: session.group_id,
                session_date: session.session_date,
                start_time: session.start_time,
                duration_min: session.duration_min,
                delivered: (report?.report_deliveries.length ?? 0) > 0,
                dismissed: Boolean(report?.dismissed_at),
            }
        })
    })

    // Las horas de la sesión son de Madrid: «ahora» se compara en la misma hora de pared.
    const wall = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' }).format(new Date())
    return (pendingReports(rows, new Date(`${wall.replace(' ', 'T')}Z`), settings?.notice_hours ?? 3) as typeof rows)
        .map(({ sessionId, clientId, groupId, name }) => ({ sessionId, clientId, groupId, name }))
}

export async function getStudioTeamList(coachId: string) {
    return (await getStudioTeam(coachId)).team
}

async function buildGrid(
    coachId: string,
    header: StudioClientHeader,
    sessions: StudioSession[],
    { clientId, group = null }: { clientId?: string; group?: StudioGroupDetail | null }
): Promise<StudioGridData> {
    const supabase = await createClient()
    const sessionIds = sessions.map(session => session.id)

    const mediaQuery = supabase
        .from('exercise_media')
        .select('id, catalog_exercise_id, client_id, kind, url, storage_key, title')
        .eq('coach_id', coachId)
        .order('created_at')

    const [{ data: media }, { data: consent }, library, { names, team }, { data: tags }, { data: routines }, { data: requests }, { data: blockPrefs }, { data: recentBlocks }, { count: activeInjuries }] = await Promise.all([
        clientId ? mediaQuery.or(`client_id.is.null,client_id.eq.${clientId}`) : mediaQuery.is('client_id', null),
        clientId
            ? supabase.from('client_consents').select('accepted').eq('client_id', clientId).eq('kind', 'image').maybeSingle()
            : Promise.resolve({ data: null }),
        getLibraryAction(),
        getStudioTeam(coachId),
        supabase.from('studio_tags').select('name').eq('coach_id', coachId).order('uses', { ascending: false }).limit(200),
        supabase
            .from('studio_routines')
            .select('id, client_id, name, kind, studio_routine_items(catalog_exercise_id, sort_order, sets, reps, time_seconds, load_kg, rir, rpe, note, exercise_catalog(name))')
            .eq('coach_id', coachId)
            .order('name'),
        sessionIds.length > 0
            ? supabase
                .from('studio_requests')
                .select('id, session_id, from_user, to_user, title, message, status, done_by')
                .in('session_id', sessionIds)
                .order('created_at')
            : Promise.resolve({ data: [] }),
        clientId
            ? supabase.from('client_block_prefs').select('block_key, collapsed, sort_order').eq('client_id', clientId)
            : Promise.resolve({ data: [] }),
        supabase.rpc('studio_recent_blocks', { p_coach_id: coachId }),
        clientId
            ? supabase
                .from('client_injuries')
                .select('id', { count: 'exact', head: true })
                .eq('client_id', clientId)
                .eq('status', 'active')
            : Promise.resolve({ count: 0 }),
    ])

    const [{ data: items }, { data: sections }] = sessionIds.length > 0
        ? await Promise.all([
            supabase
                .from('studio_session_items')
                .select('id, session_id, section_id, sort_order, catalog_exercise_id, routine_id, sets, reps, time_seconds, load_kg, rir, rpe, next_load, circuit, note, is_done, version, updated_by, updated_at, exercise_catalog(name, block_key), studio_item_tags(studio_tags(name)), studio_item_attachments(image_key, link_url)')
                .in('session_id', sessionIds)
                .order('sort_order', { ascending: true }),
            supabase
                .from('studio_session_sections')
                .select('id, session_id, title, parent_title, sort_order')
                .in('session_id', sessionIds)
                .order('sort_order', { ascending: true }),
        ])
        : [{ data: [] }, { data: [] }]

    const groupSessionIds = sessions.filter(session => session.group_id).map(session => session.id)
    const groupItemIds = (items ?? []).filter(item => groupSessionIds.includes(item.session_id)).map(item => item.id)
    const [{ data: attendance }, { data: people }] = await Promise.all([
        groupSessionIds.length > 0
            ? supabase.from('studio_session_attendance').select('session_id, client_id, status, origin').in('session_id', groupSessionIds)
            : Promise.resolve({ data: [] }),
        groupItemIds.length > 0
            ? supabase.from('studio_item_people').select('item_id, client_id, load_kg, reps, time_seconds, rir, rpe, next_load').in('item_id', groupItemIds)
            : Promise.resolve({ data: [] }),
    ])

    const imageConsent = consent?.accepted === true

    return {
        coachId,
        media: (media ?? []) as StudioExerciseMedia[],
        imageConsent,
        client: header,
        group,
        sessions,
        sections: (sections ?? []) as StudioSection[],
        items: (items ?? []).map(row => {
            const { exercise_catalog: embed, studio_item_tags: tagLinks, studio_item_attachments: attachmentEmbed, ...item } = row
            const raw = embed as unknown as { name: string; block_key: string | null } | { name: string; block_key: string | null }[] | null
            const catalog = Array.isArray(raw) ? raw[0] : raw
            const links = (tagLinks ?? []) as unknown as { studio_tags: { name: string } | { name: string }[] | null }[]
            const rawAttachment = attachmentEmbed as unknown as StudioItem['attachment'] | NonNullable<StudioItem['attachment']>[]
            const attachment = (Array.isArray(rawAttachment) ? rawAttachment[0] : rawAttachment) ?? null
            const full = {
                ...item,
                // Sin consentimiento, su imagen no llega a la pantalla.
                attachment: attachment && {
                    link_url: attachment.link_url,
                    image_key: attachmentImageVisible(attachment.image_key, coachId, imageConsent) ? attachment.image_key : null,
                },
                exercise_name: catalog?.name ?? '',
                block_key: catalog?.block_key ?? null,
                tags: links.flatMap(link => link.studio_tags ?? []).map(tag => tag.name),
            }
            // En la cuadrícula de un integrante manda lo suyo.
            const person = clientId
                ? (people ?? []).find(entry => entry.item_id === item.id && entry.client_id === clientId)
                : undefined
            return itemForPerson(full, person) as StudioItem
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
        attendance: (attendance ?? []) as StudioAttendance[],
        people: (people ?? []) as StudioItemPerson[],
        recentBlocks: (recentBlocks ?? []) as string[],
    }
}
