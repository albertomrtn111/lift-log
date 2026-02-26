
import { createClient } from '@/lib/supabase/client'
import { format, subDays, eachDayOfInterval, isSameDay } from 'date-fns'

export interface DietAdherenceLog {
    id: string
    client_id: string
    log_date: string
    adherence_pct: number
    notes: string | null
    created_at: string
}

export async function getDietAdherenceLog(date: Date): Promise<DietAdherenceLog | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // We assume the user is the client.
    // Ideally we should get the client_id first, but typically RLS allows users to see their own client rows
    // or we query by user_id if column exists. 
    // Looking at previous tasks, we usually query `clients` table to get `id` from `user_id`.

    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!client) return null

    const dateStr = format(date, 'yyyy-MM-dd')

    const { data, error } = await supabase
        .from('diet_adherence_logs')
        .select('*')
        .eq('client_id', client.id)
        .eq('log_date', dateStr)
        .maybeSingle()

    if (error) {
        console.error('Error fetching diet adherence:', error)
        return null
    }

    return data
}

export async function saveDietAdherenceLog(payload: {
    date: Date,
    adherence_pct: number,
    notes: string
}): Promise<{ success: boolean, error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', user.id)
        .single()

    if (!client) return { success: false, error: 'Client not found' }

    const dateStr = format(payload.date, 'yyyy-MM-dd')

    const { error } = await supabase
        .from('diet_adherence_logs')
        .upsert({
            client_id: client.id,
            coach_id: client.coach_id,
            log_date: dateStr,
            adherence_pct: payload.adherence_pct,
            notes: payload.notes,
            // updated_at is handled by trigger usually, but if not we let supabase handle it
        }, {
            onConflict: 'client_id,log_date'
        })

    if (error) {
        console.error('Error saving diet adherence:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}

export async function backfillDietAdherenceLogs(): Promise<{ success: boolean, count: number }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, count: 0 }

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', user.id)
        .single()

    if (!client) return { success: false, count: 0 }

    const today = new Date()
    const weekAgo = subDays(today, 6) // Today + 6 days ago = 7 days total

    // 1. Get existing logs for the range
    const { data: existingLogs } = await supabase
        .from('diet_adherence_logs')
        .select('log_date')
        .eq('client_id', client.id)
        .gte('log_date', format(weekAgo, 'yyyy-MM-dd'))
        .lte('log_date', format(today, 'yyyy-MM-dd'))

    const existingDates = new Set(existingLogs?.map(l => l.log_date) || [])
    const logsToInsert: any[] = []

    const range = eachDayOfInterval({ start: weekAgo, end: today })

    for (const day of range) {
        const dateStr = format(day, 'yyyy-MM-dd')
        if (!existingDates.has(dateStr)) {
            logsToInsert.push({
                client_id: client.id,
                coach_id: client.coach_id,
                log_date: dateStr,
                adherence_pct: null, // Empty log
                notes: null
            })
        }
    }

    if (logsToInsert.length === 0) {
        return { success: true, count: 0 }
    }

    const { error } = await supabase
        .from('diet_adherence_logs')
        .insert(logsToInsert)

    if (error) {
        console.error('Error backfilling diet logs:', error)
        return { success: false, count: 0 }
    }

    return { success: true, count: logsToInsert.length }
}

export async function getDietAdherenceLogs(startDate: Date, endDate: Date): Promise<DietAdherenceLog[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()

    if (!client) return []

    const { data } = await supabase
        .from('diet_adherence_logs')
        .select('*')
        .eq('client_id', client.id)
        .gte('log_date', format(startDate, 'yyyy-MM-dd'))
        .lte('log_date', format(endDate, 'yyyy-MM-dd'))
        .order('log_date', { ascending: true })

    return data || []
}

export async function saveDietAdherenceLogs(logs: {
    date: Date,
    adherence_pct: number | null,
    notes: string | null
}[]): Promise<{ success: boolean, error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', user.id)
        .single()

    if (!client) return { success: false, error: 'Client not found' }

    const rows = logs.map(l => ({
        client_id: client.id,
        coach_id: client.coach_id,
        log_date: format(l.date, 'yyyy-MM-dd'),
        adherence_pct: l.adherence_pct,
        notes: l.notes
    }))

    const { error } = await supabase
        .from('diet_adherence_logs')
        .upsert(rows, {
            onConflict: 'client_id,log_date'
        })

    if (error) {
        console.error('Error batch saving diet logs:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}
