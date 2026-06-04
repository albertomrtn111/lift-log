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
    review_schedule_id: string | null
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

type ScheduleRecord = {
    id: string
    client_id: string
    next_due_date: string | null
    is_active: boolean
    review_template: { name: string } | null
}

interface CalendarRangeInput {
    startDate: string
    endDate: string
}

const IGNORED_CHECKIN_STATUSES = new Set(['cancelled'])

function getSubmittedResolutionKeys(checkin: CheckinRecord): string[] {
    if (!checkin.period_end) return []

    const keys = [`client:${checkin.client_id}:${checkin.period_end}`]
    if (checkin.review_schedule_id) {
        keys.push(`schedule:${checkin.review_schedule_id}:${checkin.period_end}`)
    }

    return keys
}

function getScheduleResolutionKey(scheduleId: string, dueDate: string) {
    return `schedule:${scheduleId}:${dueDate}`
}

function getClientResolutionKey(clientId: string, dueDate: string) {
    return `client:${clientId}:${dueDate}`
}

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

function buildScheduledEventFromSchedule(
    client: ClientRecord,
    schedule: ScheduleRecord,
    today: string
): CalendarEvent | null {
    const dueDate = schedule.next_due_date
    if (!dueDate) return null

    const status: CalendarEvent['status'] = dueDate < today ? 'missing' : 'scheduled'

    return {
        id: `scheduled-schedule-${schedule.id}-${dueDate}`,
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
        reviewTemplateName: schedule.review_template?.name ?? null,
        reviewScheduleId: schedule.id,
    }
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

    // Fetch active schedules — un evento por schedule, no por cliente
    const { data: schedulesData } = await supabase
        .from('client_review_schedules')
        .select('id, client_id, next_due_date, is_active, review_template:review_templates(name)')
        .eq('coach_id', coachId)
        .eq('is_active', true)

    const schedulesByClient = new Map<string, ScheduleRecord[]>()
    for (const s of (schedulesData ?? []) as unknown as ScheduleRecord[]) {
        const list = schedulesByClient.get(s.client_id) ?? []
        list.push(s)
        schedulesByClient.set(s.client_id, list)
    }

    const { data: submittedCheckins } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            review_schedule_id,
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

    const { data: submittedCheckinsForDueDates } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            review_schedule_id,
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
        .gte('period_end', range.startDate)
        .lte('period_end', range.endDate)

    const { data: pendingCheckins } = await supabase
        .from('checkins')
        .select(`
            id,
            client_id,
            review_schedule_id,
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

    const submittedCheckinsById = new Map<string, CheckinRecord>()
    for (const checkin of [
        ...filteredSubmittedCheckins,
        ...((submittedCheckinsForDueDates ?? []) as CheckinRecord[])
            .filter((checkin) => !IGNORED_CHECKIN_STATUSES.has(checkin.status ?? ''))
            .filter((checkin) => activeClientById.has(checkin.client_id))
            .filter((checkin) => checkin.status !== 'pending'),
    ]) {
        submittedCheckinsById.set(checkin.id, checkin)
    }

    const submittedCheckinsForResolution = [...submittedCheckinsById.values()]
    const resolvedSubmittedKeys = new Set<string>()
    for (const checkin of submittedCheckinsForResolution) {
        for (const key of getSubmittedResolutionKeys(checkin)) {
            resolvedSubmittedKeys.add(key)
        }
    }

    const latestSubmittedAtByClient = new Map<string, string>()
    for (const checkin of submittedCheckinsForResolution) {
        if (!checkin.submitted_at) continue
        const current = latestSubmittedAtByClient.get(checkin.client_id)
        if (!current || checkin.submitted_at > current) {
            latestSubmittedAtByClient.set(checkin.client_id, checkin.submitted_at)
        }
    }

    const filteredPendingCheckins = ((pendingCheckins ?? []) as CheckinRecord[])
        .filter((checkin) => activeClientById.has(checkin.client_id))
        .filter((checkin) => {
            const client = activeClientById.get(checkin.client_id)
            if (client) {
                const dueDate = getCheckinDueDate(checkin, client)
                if (checkin.review_schedule_id && resolvedSubmittedKeys.has(getScheduleResolutionKey(checkin.review_schedule_id, dueDate))) {
                    return false
                }
                if (resolvedSubmittedKeys.has(getClientResolutionKey(checkin.client_id, dueDate))) {
                    return false
                }
            }

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
    const latestPendingBySchedule = new Map<string, CheckinRecord>()
    for (const checkin of filteredPendingCheckins) {
        const client = activeClientById.get(checkin.client_id)
        if (!client) continue

        if (checkin.review_schedule_id) {
            if (!latestPendingBySchedule.has(checkin.review_schedule_id)) {
                latestPendingBySchedule.set(checkin.review_schedule_id, checkin)
            }
            continue
        }

        const dueDate = getCheckinDueDate(checkin, client)
        if (dueDate !== client.next_checkin_date) continue
        if (!latestPendingByClient.has(checkin.client_id)) {
            latestPendingByClient.set(checkin.client_id, checkin)
        }
    }

    for (const client of activeClients) {
        const clientSchedules = schedulesByClient.get(client.id) ?? []

        if (clientSchedules.length > 0) {
            // Modelo nuevo: un evento por schedule activo del cliente
            for (const schedule of clientSchedules) {
                const pendingCheckin = latestPendingBySchedule.get(schedule.id)
                if (pendingCheckin) {
                    const pendingDueDate = getCheckinDueDate(pendingCheckin, client)
                    if (pendingDueDate >= range.startDate && pendingDueDate <= range.endDate) {
                        if (
                            resolvedSubmittedKeys.has(getScheduleResolutionKey(schedule.id, pendingDueDate)) ||
                            resolvedSubmittedKeys.has(getClientResolutionKey(client.id, pendingDueDate))
                        ) {
                            continue
                        }
                        const event = buildScheduledEvent(pendingCheckin, client, today)
                        event.reviewTemplateName = schedule.review_template?.name ?? null
                        event.reviewScheduleId = schedule.id
                        events.push(event)
                    }
                    continue
                }

                const dueDate = schedule.next_due_date
                if (!dueDate) continue
                if (dueDate < range.startDate || dueDate > range.endDate) continue
                if (client.start_date && dueDate < client.start_date) continue
                if (
                    resolvedSubmittedKeys.has(getScheduleResolutionKey(schedule.id, dueDate)) ||
                    resolvedSubmittedKeys.has(getClientResolutionKey(client.id, dueDate))
                ) {
                    continue
                }

                const event = buildScheduledEventFromSchedule(client, schedule, today)
                if (event) events.push(event)
            }

            // Si además hay un pending checkin "huérfano" para este cliente
            // (sin review_schedule_id), también lo emitimos para no perder visibilidad
            const pendingCheckin = latestPendingByClient.get(client.id)
            if (pendingCheckin && client.next_checkin_date) {
                const dueDate = pendingCheckin.period_end || client.next_checkin_date
                if (dueDate >= range.startDate && dueDate <= range.endDate) {
                    if (resolvedSubmittedKeys.has(getClientResolutionKey(client.id, dueDate))) {
                        continue
                    }
                    events.push(buildScheduledEvent(pendingCheckin, client, today))
                }
            }
            continue
        }

        // Fallback legacy: cliente sin schedules → next_checkin_date del cliente
        const dueDate = client.next_checkin_date
        if (!dueDate) continue
        if (dueDate < range.startDate || dueDate > range.endDate) continue
        if (client.start_date && dueDate < client.start_date) continue

        const pendingCheckin = latestPendingByClient.get(client.id)
        if (pendingCheckin) {
            events.push(buildScheduledEvent(pendingCheckin, client, today))
            continue
        }

        if (resolvedSubmittedKeys.has(getClientResolutionKey(client.id, dueDate))) {
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

    // 1) Schedules activos en rango (modelo nuevo)
    const { data: schedules } = await supabase
        .from('client_review_schedules')
        .select(`
            id,
            next_due_date,
            client:clients!inner ( id, full_name, status ),
            review_template:review_templates ( name )
        `)
        .eq('coach_id', coachId)
        .eq('is_active', true)
        .gte('next_due_date', today)
        .lte('next_due_date', endDate)
        .order('next_due_date', { ascending: true })

    type Row = {
        id: string
        next_due_date: string
        client: { id: string; full_name: string; status: string } | null
        review_template: { name: string } | null
    }

    const todayDate = new Date()
    const events: CalendarEvent[] = []
    const clientsWithSchedules = new Set<string>()

    for (const row of (schedules ?? []) as unknown as Row[]) {
        if (!row.client || row.client.status !== 'active') continue
        clientsWithSchedules.add(row.client.id)
        events.push({
            id: `scheduled-schedule-${row.id}`,
            clientId: row.client.id,
            clientName: row.client.full_name,
            date: row.next_due_date,
            type: 'checkin' as const,
            isUrgent: Math.ceil((parseLocalDate(row.next_due_date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) <= 2,
            status: 'scheduled' as const,
            projected: false,
            expectedDate: row.next_due_date,
            source: 'scheduled' as const,
            reviewTemplateName: row.review_template?.name ?? null,
            reviewScheduleId: row.id,
        })
    }

    // 2) Fallback legacy: clientes sin schedules → leer next_checkin_date
    const { data: legacyClients } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date, status')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .gte('next_checkin_date', today)
        .lte('next_checkin_date', endDate)
        .order('next_checkin_date', { ascending: true })

    for (const client of legacyClients ?? []) {
        if (clientsWithSchedules.has(client.id)) continue
        if (!client.next_checkin_date) continue

        events.push({
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
        })
    }

    return events.sort((a, b) => a.date.localeCompare(b.date))
}
