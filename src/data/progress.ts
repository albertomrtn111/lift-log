
import { createClient } from '@/lib/supabase/client'
import { startOfDay, endOfDay, format } from 'date-fns'

export interface ClientMetric {
    id: string
    client_id: string
    coach_id: string
    metric_date: string
    weight_kg?: number
    steps?: number
    sleep_h?: number
    notes?: string
    created_at: string
}

export type ClientMetricInput = {
    metric_date: string
    weight_kg?: number
    steps?: number
    sleep_h?: number
    notes?: string
}

// Helper to get current client and coach ID
async function getClientContext() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('user_id', user.id)
        .single()

    return client
}

export async function getClientMetrics(date: Date) {
    const supabase = await createClient()
    const client = await getClientContext()

    if (!client) return null

    const dateStr = format(date, 'yyyy-MM-dd')

    const { data, error } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', client.id)
        .eq('metric_date', dateStr)
        .single()

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching metrics:', error)
        return null
    }

    return data as ClientMetric | null
}

export async function saveClientMetrics(input: ClientMetricInput) {
    const supabase = await createClient()
    const client = await getClientContext()

    if (!client) return { success: false, error: 'Client not found' }

    const payload = {
        client_id: client.id,
        coach_id: client.coach_id,
        metric_date: input.metric_date,
        weight_kg: input.weight_kg,
        steps: input.steps,
        sleep_h: input.sleep_h,
        notes: input.notes,
        created_by: (await supabase.auth.getUser()).data.user?.id
    }

    const { error } = await supabase
        .from('client_metrics')
        .upsert(payload, {
            onConflict: 'client_id, metric_date'
        })

    if (error) {
        console.error('Error saving metrics:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}

export async function saveClientMetricsBulk(inputs: ClientMetricInput[]) {
    const supabase = await createClient()
    const client = await getClientContext()

    if (!client) return { success: false, error: 'Client not found' }

    // Use only valid days that have at least one field filled
    const validInputs = inputs.filter(i =>
        i.weight_kg !== undefined ||
        i.steps !== undefined ||
        i.sleep_h !== undefined ||
        i.notes !== undefined
    )

    if (validInputs.length === 0) return { success: true, count: 0 }

    const rowsToUpsert = validInputs.map(input => ({
        client_id: client.id,
        coach_id: client.coach_id,
        metric_date: input.metric_date,
        weight_kg: input.weight_kg,
        steps: input.steps,
        sleep_h: input.sleep_h,
        notes: input.notes
    }))

    const { error } = await supabase
        .from('client_metrics')
        .upsert(rowsToUpsert, {
            onConflict: 'client_id, metric_date'
        })

    if (error) {
        console.error('Error in bulk metrics upsert:', error)
        return { success: false, error: error.message }
    }

    return { success: true, count: rowsToUpsert.length }
}

export async function getRecentClientMetrics(limit = 10) {
    const supabase = await createClient()
    const client = await getClientContext()

    if (!client) return []

    const { data, error } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', client.id)
        .order('metric_date', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Error fetching recent metrics:', error)
        return []
    }

    return data as ClientMetric[]
}

export async function getClientMetricsRange(startDate: Date, endDate: Date) {
    const supabase = await createClient()
    const client = await getClientContext()

    if (!client) return []

    const startStr = format(startDate, 'yyyy-MM-dd')
    const endStr = format(endDate, 'yyyy-MM-dd')

    const { data, error } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', client.id)
        .gte('metric_date', startStr)
        .lte('metric_date', endStr)
        .order('metric_date', { ascending: true })

    if (error) {
        console.error('Error fetching metrics range:', error)
        return []
    }

    return data as ClientMetric[]
}
