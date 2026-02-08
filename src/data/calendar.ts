import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent, Checkin } from '@/types/coach'

/**
 * Get upcoming check-ins for next N days
 */
export async function getUpcomingCheckins(
    coachId: string,
    days: number = 30
): Promise<CalendarEvent[]> {
    const supabase = await createClient()

    const today = new Date().toISOString().split('T')[0]
    const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

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
        // Mark as urgent if within 2 days
        isUrgent: Math.ceil((new Date(client.next_checkin_date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) <= 2,
    }))
}

/**
 * Get check-in history for a specific client
 */
export async function getClientCheckinHistory(
    clientId: string,
    limit: number = 10
): Promise<Checkin[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('checkins')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(limit)

    if (error || !data) return []
    return data as Checkin[]
}

/**
 * Get all check-in events grouped by date for calendar view
 */
export async function getCalendarEvents(
    coachId: string,
    year: number,
    month: number
): Promise<CalendarEvent[]> {
    const supabase = await createClient()

    // Get first and last day of month
    const startDate = new Date(year, month, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, next_checkin_date')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .gte('next_checkin_date', startDate)
        .lte('next_checkin_date', endDate)

    if (error || !data) return []

    const todayDate = new Date()

    return data.map((client) => ({
        id: `checkin-${client.id}`,
        clientId: client.id,
        clientName: client.full_name,
        date: client.next_checkin_date,
        type: 'checkin' as const,
        isUrgent: Math.ceil((new Date(client.next_checkin_date).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)) <= 2,
    }))
}
