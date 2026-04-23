import { createClient } from '@/lib/supabase/server'
import type { CalendarData, CalendarEvent, CalendarNote, CalendarTask } from '@/types/coach'
import { toLocalDateStr, parseLocalDate } from '@/lib/date-utils'

type ClientRecord = {
    id: string
    full_name: string
    next_checkin_date: string | null
    checkin_frequency_days: number | null
    start_date: string | null
    status: string | null
}

type CheckinRecord = {
    id: string
    client_id: string
    submitted_at: string | null
    created_at: string
    period_end: string | null
    status: string | null
    source: string | null
    raw_payload: Record<string, unknown> | null
    weight_kg: number | null
    weight_avg_kg: number | null
    training_adherence_pct: number | null
    nutrition_adherence_pct: number | null
    sleep_avg_h: number | null
}

type ReviewRecord = {
    id: string
    checkin_id: string
    status: 'draft' | 'approved' | 'rejected' | null
    ai_status: 'idle' | 'pending' | 'completed' | 'failed' | null
}

type CalendarNoteRecord = {
    id: string
    note_date: string
    kind: CalendarNote['kind']
    content: string
    client_id: string | null
    created_at: string
    updated_at: string
}

type CoachTaskRecord = {
    id: string
    task_date: string
    title: string
    description: string | null
    status: CalendarTask['status']
    priority: CalendarTask['priority']
    client_id: string | null
    created_at: string
    updated_at: string
    completed_at: string | null
}

interface CalendarRangeInput {
    startDate: string
    endDate: string
}

const IGNORED_CHECKIN_STATUSES = new Set(['cancelled'])

function countPrefixedValues(
    payload: Record<string, unknown> | null,
    prefix: string
): number {
    if (!payload) return 0

    return Object.entries(payload).filter(([key, value]) => {
        if (!key.startsWith(prefix)) return false
        return value !== null && value !== ''
    }).length
}

function compareEvents(left: CalendarEvent, right: CalendarEvent) {
    const statusWeight: Record<CalendarEvent['status'], number> = {
        missing: 0,
        pending_review: 1,
        scheduled: 2,
        completed: 3,
    }

    const statusDiff = statusWeight[left.status] - statusWeight[right.status]
    if (statusDiff !== 0) return statusDiff

    return left.clientName.localeCompare(right.clientName, 'es')
}

function buildSubmittedEvent(
    checkin: CheckinRecord,
    review: ReviewRecord | undefined,
    clientName: string
): CalendarEvent | null {
    if (!checkin.submitted_at) return null

    const date = checkin.submitted_at.split('T')[0]
    const status: CalendarEvent['status'] =
        review?.status === 'approved'
            ? 'completed'
            : 'pending_review'

    return {
        id: `submitted-${checkin.id}`,
        clientId: checkin.client_id,
        clientName,
        date,
        type: 'checkin',
        isUrgent: status === 'pending_review',
        projected: false,
        status,
        checkinId: checkin.id,
        reviewId: review?.id,
        reviewStatus: review?.status ?? null,
        checkinStatus: (checkin.status as CalendarEvent['checkinStatus']) ?? null,
        submittedAt: checkin.submitted_at,
        expectedDate: null,
        source: 'submitted',
        checkinSource: checkin.source,
        weightKg: checkin.weight_avg_kg ?? checkin.weight_kg ?? null,
        trainingAdherencePct: checkin.training_adherence_pct,
        nutritionAdherencePct: checkin.nutrition_adherence_pct,
        sleepAvgH: checkin.sleep_avg_h,
        aiStatus: review?.ai_status ?? null,
        rawMetricCount: countPrefixedValues(checkin.raw_payload, 'metric_'),
        rawResponseCount: countPrefixedValues(checkin.raw_payload, 'campo_'),
    }
}

function buildScheduledEvent(
    checkin: CheckinRecord,
    client: ClientRecord,
    today: string
): CalendarEvent {
    const dueDate = getCheckinDueDate(checkin, client)
    const status: CalendarEvent['status'] = dueDate < today ? 'missing' : 'scheduled'

    return {
        id: `scheduled-${checkin.id}`,
        clientId: client.id,
        clientName: client.full_name,
        date: dueDate,
        type: 'checkin',
        isUrgent: status === 'missing',
        projected: false,
        status,
        checkinId: checkin.id,
        reviewId: undefined,
        reviewStatus: null,
        checkinStatus: 'pending',
        submittedAt: null,
        expectedDate: dueDate,
        source: 'scheduled',
        checkinSource: checkin.source,
        weightKg: null,
        trainingAdherencePct: null,
        nutritionAdherencePct: null,
        sleepAvgH: null,
        aiStatus: null,
        rawMetricCount: 0,
        rawResponseCount: 0,
    }
}

function buildScheduledEventFromClient(
    client: ClientRecord,
    today: string
): CalendarEvent | null {
    const dueDate = client.next_checkin_date
    if (!dueDate) return null

    const status: CalendarEvent['status'] = dueDate < today ? 'missing' : 'scheduled'

    return {
        id: `scheduled-client-${client.id}-${dueDate}`,
        clientId: client.id,
        clientName: client.full_name,
        date: dueDate,
        type: 'checkin',
        isUrgent: status === 'missing',
        projected: false,
        status,
        checkinId: undefined,
        reviewId: undefined,
        reviewStatus: null,
        checkinStatus: null,
        submittedAt: null,
        expectedDate: dueDate,
        source: 'scheduled',
        checkinSource: null,
        weightKg: null,
        trainingAdherencePct: null,
        nutritionAdherencePct: null,
        sleepAvgH: null,
        aiStatus: null,
        rawMetricCount: 0,
        rawResponseCount: 0,
    }
}

function getCheckinDueDate(checkin: CheckinRecord, client: ClientRecord): string {
    return checkin.period_end || client.next_checkin_date || checkin.created_at.split('T')[0]
}

function mapCalendarNote(
    note: CalendarNoteRecord,
    clientName: string | null
): CalendarNote {
    return {
        id: note.id,
        date: note.note_date,
        kind: note.kind,
        content: note.content,
        clientId: note.client_id,
        clientName,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
    }
}

function mapCoachTask(
    task: CoachTaskRecord,
    clientName: string | null
): CalendarTask {
    return {
        id: task.id,
        date: task.task_date,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        clientId: task.client_id,
        clientName,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
    }
}

export async function getCalendarData(
    coachId: string,
    range: CalendarRangeInput
): Promise<CalendarData> {
    const supabase = await createClient()
    const today = toLocalDateStr(new Date())

    const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date, checkin_frequency_days, start_date, status')
        .eq('coach_id', coachId)

    if (clientsError || !clients) {
        return {
            events: [],
            notes: [],
            notesEnabled: false,
            tasks: [],
            tasksEnabled: false,
            clientOptions: [],
        }
    }

    const allClients = clients as ClientRecord[]
    const activeClients = allClients.filter((client) => client.status === 'active')
    const clientNameById = new Map(allClients.map((client) => [client.id, client.full_name]))
    const activeClientById = new Map(activeClients.map((client) => [client.id, client]))
    const clientOptions = activeClients
        .map((client) => ({ id: client.id, name: client.full_name }))
        .sort((left, right) => left.name.localeCompare(right.name, 'es'))

    const { data: submittedCheckins } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            submitted_at,
            created_at,
            period_end,
            status,
            source,
            raw_payload,
            weight_kg,
            weight_avg_kg,
            training_adherence_pct,
            nutrition_adherence_pct,
            sleep_avg_h
        `)
        .eq('coach_id', coachId)
        .eq('type', 'checkin')
        .not('submitted_at', 'is', null)
        .gte('submitted_at', `${range.startDate}T00:00:00`)
        .lte('submitted_at', `${range.endDate}T23:59:59`)

    const { data: pendingCheckins } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            submitted_at,
            created_at,
            period_end,
            status,
            source,
            raw_payload,
            weight_kg,
            weight_avg_kg,
            training_adherence_pct,
            nutrition_adherence_pct,
            sleep_avg_h
        `)
        .eq('coach_id', coachId)
        .eq('type', 'checkin')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    const filteredSubmittedCheckins = ((submittedCheckins ?? []) as CheckinRecord[])
        .filter((checkin) => !IGNORED_CHECKIN_STATUSES.has(checkin.status ?? ''))
        .filter((checkin) => activeClientById.has(checkin.client_id))
        .filter((checkin) => checkin.status !== 'pending')

    const latestSubmittedAtByClient = new Map<string, string>()
    for (const checkin of filteredSubmittedCheckins) {
        if (!checkin.submitted_at) continue
        const current = latestSubmittedAtByClient.get(checkin.client_id)
        if (!current || checkin.submitted_at > current) {
            latestSubmittedAtByClient.set(checkin.client_id, checkin.submitted_at)
        }
    }

    const filteredPendingCheckins = ((pendingCheckins ?? []) as CheckinRecord[])
        .filter((checkin) => activeClientById.has(checkin.client_id))
        .filter((checkin) => {
            const latestSubmittedAt = latestSubmittedAtByClient.get(checkin.client_id)
            if (!latestSubmittedAt) return true
            return latestSubmittedAt < checkin.created_at
        })

    const reviewIds = filteredSubmittedCheckins.map((checkin) => checkin.id)
    let reviewsByCheckinId = new Map<string, ReviewRecord>()
    if (reviewIds.length > 0) {
        const { data: reviews } = await supabase
            .from('reviews')
            .select('id, checkin_id, status, ai_status')
            .in('checkin_id', reviewIds)

        reviewsByCheckinId = new Map(
            ((reviews ?? []) as ReviewRecord[]).map((review) => [review.checkin_id, review])
        )
    }

    const events: CalendarEvent[] = []

    for (const checkin of filteredSubmittedCheckins) {
        const submittedEvent = buildSubmittedEvent(
            checkin,
            reviewsByCheckinId.get(checkin.id),
            clientNameById.get(checkin.client_id) || 'Cliente'
        )

        if (submittedEvent) {
            events.push(submittedEvent)
        }
    }

    const latestPendingByClient = new Map<string, CheckinRecord>()
    for (const checkin of filteredPendingCheckins) {
        const client = activeClientById.get(checkin.client_id)
        if (!client) continue
        const dueDate = getCheckinDueDate(checkin, client)
        if (dueDate !== client.next_checkin_date) continue
        if (!latestPendingByClient.has(checkin.client_id)) {
            latestPendingByClient.set(checkin.client_id, checkin)
        }
    }

    const currentSubmittedDatesByClient = new Map<string, string>()
    for (const checkin of filteredSubmittedCheckins) {
        const client = activeClientById.get(checkin.client_id)
        if (!client || !client.next_checkin_date) continue
        if (!checkin.period_end) continue
        if (checkin.period_end === client.next_checkin_date) {
            currentSubmittedDatesByClient.set(checkin.client_id, checkin.period_end)
        }
    }

    for (const client of activeClients) {
        const dueDate = client.next_checkin_date
        if (!dueDate) continue
        if (dueDate < range.startDate || dueDate > range.endDate) continue
        if (client.start_date && dueDate < client.start_date) continue

        const pendingCheckin = latestPendingByClient.get(client.id)
        if (pendingCheckin) {
            events.push(buildScheduledEvent(pendingCheckin, client, today))
            continue
        }

        if (currentSubmittedDatesByClient.has(client.id)) {
            continue
        }

        const fallbackScheduledEvent = buildScheduledEventFromClient(client, today)
        if (fallbackScheduledEvent) {
            events.push(fallbackScheduledEvent)
        }
    }

    let notesEnabled = true
    let notes: CalendarNote[] = []

    const { data: noteRows, error: notesError } = await supabase
        .from('calendar_notes')
        .select('id, note_date, kind, content, client_id, created_at, updated_at')
        .eq('coach_id', coachId)
        .gte('note_date', range.startDate)
        .lte('note_date', range.endDate)
        .order('note_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (notesError) {
        notesEnabled = false
    } else {
        notes = ((noteRows ?? []) as CalendarNoteRecord[]).map((note) =>
            mapCalendarNote(note, note.client_id ? clientNameById.get(note.client_id) || 'Cliente' : null)
        )
    }

    let tasksEnabled = true
    let tasks: CalendarTask[] = []

    const { data: taskRows, error: tasksError } = await supabase
        .from('coach_tasks')
        .select('id, task_date, title, description, status, priority, client_id, created_at, updated_at, completed_at')
        .eq('coach_id', coachId)
        .gte('task_date', range.startDate)
        .lte('task_date', range.endDate)
        .order('task_date', { ascending: true })
        .order('created_at', { ascending: true })

    if (tasksError) {
        tasksEnabled = false
    } else {
        tasks = ((taskRows ?? []) as CoachTaskRecord[]).map((task) =>
            mapCoachTask(task, task.client_id ? clientNameById.get(task.client_id) || 'Cliente' : null)
        )
    }

    return {
        events: events.sort((left, right) => {
            const dateDiff = left.date.localeCompare(right.date)
            if (dateDiff !== 0) return dateDiff
            return compareEvents(left, right)
        }),
        notes,
        tasks,
        notesEnabled,
        tasksEnabled,
        clientOptions,
    }
}

export async function getCalendarDataForMonth(
    coachId: string,
    year: number,
    month: number
): Promise<CalendarData> {
    const monthStart = toLocalDateStr(new Date(year, month, 1))
    const monthEnd = toLocalDateStr(new Date(year, month + 1, 0))

    return getCalendarData(coachId, {
        startDate: monthStart,
        endDate: monthEnd,
    })
}

export async function getUpcomingCheckins(
    coachId: string,
    days: number = 30
): Promise<CalendarEvent[]> {
    const supabase = await createClient()

    const today = toLocalDateStr(new Date())
    const endDate = toLocalDateStr(new Date(Date.now() + days * 24 * 60 * 60 * 1000))

    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date, status')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .gte('next_checkin_date', today)
        .lte('next_checkin_date', endDate)
        .order('next_checkin_date', { ascending: true })

    if (error || !data) return []

    const todayDate = new Date()

    return data.map((client) => ({
        id: `scheduled-client-${client.id}`,
        clientId: client.id,
        clientName: client.full_name,
        date: client.next_checkin_date,
        type: 'checkin' as const,
        isUrgent: Math.ceil((parseLocalDate(client.next_checkin_date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) <= 2,
        status: 'scheduled' as const,
        projected: false,
        expectedDate: client.next_checkin_date,
        source: 'scheduled' as const,
    }))
}
