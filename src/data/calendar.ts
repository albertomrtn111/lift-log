import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent } from '@/types/coach'
import { toLocalDateStr, parseLocalDate } from '@/lib/date-utils'
import { addDays } from 'date-fns'

// ============================================================================
// Get all calendar events for a month (projected + actual)
// ============================================================================

export async function getCalendarEvents(
    coachId: string,
    year: number,
    month: number
): Promise<CalendarEvent[]> {
    const supabase = await createClient()

    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    const startDate = toLocalDateStr(monthStart)
    const endDate = toLocalDateStr(monthEnd)
    const today = toLocalDateStr(new Date())

    // 1. Get all active clients with frequency
    const { data: clients, error: clientsErr } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date, checkin_frequency_days, start_date')
        .eq('coach_id', coachId)
        .eq('status', 'active')

    if (clientsErr || !clients) return []

    // 2. Get actual checkins in the month range
    const { data: checkins } = await supabase
        .from('checkins')
        .select('id, client_id, submitted_at, status')
        .eq('coach_id', coachId)
        .eq('type', 'checkin')
        .gte('submitted_at', `${startDate}T00:00:00`)
        .lte('submitted_at', `${endDate}T23:59:59`)

    // 3. Get reviews for those checkins
    const checkinIds = (checkins || []).map(c => c.id)
    let reviewMap = new Map<string, { id: string; status: string }>()
    if (checkinIds.length > 0) {
        const { data: reviews } = await supabase
            .from('reviews')
            .select('id, checkin_id, status')
            .in('checkin_id', checkinIds)

        for (const r of (reviews || [])) {
            reviewMap.set(r.checkin_id, { id: r.id, status: r.status })
        }
    }

    // Build a map of actual checkins by client + date
    const actualCheckinMap = new Map<string, { checkinId: string; checkinStatus: string; reviewStatus: string | null }>()
    for (const c of (checkins || [])) {
        const dateStr = c.submitted_at?.split('T')[0]
        if (!dateStr) continue
        const review = reviewMap.get(c.id)
        const key = `${c.client_id}_${dateStr}`
        actualCheckinMap.set(key, {
            checkinId: c.id,
            checkinStatus: c.status,
            reviewStatus: review?.status || null,
        })
    }

    // Build client name map
    const clientNameMap = new Map(clients.map(c => [c.id, c.full_name]))

    const events: CalendarEvent[] = []

    // 4. For each client, project all checkin dates in the month
    for (const client of clients) {
        const freq = client.checkin_frequency_days || 7
        const nextDate = parseLocalDate(client.next_checkin_date)

        // Find all projected dates in [monthStart, monthEnd]
        // Start from next_checkin_date and go backwards/forwards by frequency
        const projectedDates: Date[] = []

        // Go backwards from next_checkin_date to find first date before or at monthStart
        let cursor = new Date(nextDate)
        while (cursor > monthEnd) {
            cursor = addDays(cursor, -freq)
        }
        // Now go backwards until before monthStart to find starting point
        while (cursor >= monthStart) {
            cursor = addDays(cursor, -freq)
        }
        // Now go forwards through the month
        cursor = addDays(cursor, freq)
        while (cursor <= monthEnd) {
            if (cursor >= monthStart) {
                projectedDates.push(new Date(cursor))
            }
            cursor = addDays(cursor, freq)
        }

        for (const date of projectedDates) {
            const dateStr = toLocalDateStr(date)
            // No mostrar revisiones proyectadas anteriores a la fecha de alta
            if (client.start_date && dateStr < client.start_date) continue

            const key = `${client.id}_${dateStr}`
            const actual = actualCheckinMap.get(key)

            let status: CalendarEvent['status']
            let checkinId: string | undefined
            let reviewStatus: CalendarEvent['reviewStatus'] = null

            if (actual) {
                checkinId = actual.checkinId
                reviewStatus = actual.reviewStatus as CalendarEvent['reviewStatus']
                status = actual.checkinStatus === 'reviewed' ? 'completed' : 'pending_review'
            } else if (dateStr < today) {
                status = 'overdue'
            } else {
                status = 'upcoming'
            }

            events.push({
                id: actual ? `actual-${actual.checkinId}` : `projected-${client.id}-${dateStr}`,
                clientId: client.id,
                clientName: client.full_name,
                date: dateStr,
                type: 'checkin',
                isUrgent: status === 'overdue',
                projected: !actual,
                status,
                checkinId,
                reviewStatus,
            })
        }
    }

    // 5. Also add actual checkins that don't match any projected date
    // (e.g., extra check-ins submitted outside the schedule)
    for (const c of (checkins || [])) {
        const dateStr = c.submitted_at?.split('T')[0]
        if (!dateStr) continue
        if (dateStr < startDate || dateStr > endDate) continue

        const key = `${c.client_id}_${dateStr}`
        // Check if already covered by projection
        const alreadyExists = events.some(e => e.clientId === c.client_id && e.date === dateStr)
        if (alreadyExists) continue

        const review = reviewMap.get(c.id)
        const clientName = clientNameMap.get(c.client_id) || 'Cliente'

        events.push({
            id: `actual-${c.id}`,
            clientId: c.client_id,
            clientName: clientName,
            date: dateStr,
            type: 'checkin',
            isUrgent: false,
            projected: false,
            status: c.status === 'reviewed' ? 'completed' : 'pending_review',
            checkinId: c.id,
            reviewStatus: (review?.status as CalendarEvent['reviewStatus']) || null,
        })
    }

    return events.sort((a, b) => a.date.localeCompare(b.date))
}

// ============================================================================
// Upcoming checkins (used by other parts of the app)
// ============================================================================

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
        id: `checkin-${client.id}`,
        clientId: client.id,
        clientName: client.full_name,
        date: client.next_checkin_date,
        type: 'checkin' as const,
        isUrgent: Math.ceil((parseLocalDate(client.next_checkin_date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) <= 2,
        status: 'upcoming' as const,
    }))
}
