
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
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user || authError) return null

    const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

    if (clientError || !client) return null
    return { ...client, userId: user.id }
}

export async function getClientMetrics(date: Date) {
    const supabase = createClient()
    const context = await getClientContext()

    if (!context) return null

    const dateStr = format(date, 'yyyy-MM-dd')

    const { data, error } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', context.id)
        .eq('metric_date', dateStr)
        .maybeSingle()

    if (error) {
        console.error('Error fetching metrics:', error)
        return null
    }

    return data as ClientMetric | null
}

export async function saveClientMetrics(input: ClientMetricInput) {
    const supabase = createClient()
    const context = await getClientContext()

    if (!context) return { success: false, error: 'Sesión no encontrada. Por favor recarga la página.' }

    const payload = {
        client_id: context.id,
        coach_id: context.coach_id,
        metric_date: input.metric_date,
        weight_kg: input.weight_kg ?? null,
        steps: input.steps ?? null,
        sleep_h: input.sleep_h ?? null,
        notes: input.notes ?? null,
    }

    const { error } = await supabase
        .from('client_metrics')
        .upsert(payload, { onConflict: 'client_id,metric_date' })

    if (error) {
        console.error('[saveClientMetrics] Error upsert:', error.code, error.message, error.details, error.hint)
        if (error.code === '42501' || error.message?.includes('row-level security')) {
            return { success: false, error: 'Sin permiso para guardar esta fecha. Recarga la página e intenta de nuevo.' }
        }
        return { success: false, error: `Error al guardar: ${error.message}` }
    }

    return { success: true }
}

export async function saveClientMetricsBulk(inputs: ClientMetricInput[]) {
    const supabase = createClient()
    const context = await getClientContext()

    if (!context) return { success: false, error: 'Sesión no encontrada. Por favor recarga la página.' }

    // Use only valid days that have at least one field filled
    const validInputs = inputs.filter(i =>
        i.weight_kg !== undefined ||
        i.steps !== undefined ||
        i.sleep_h !== undefined ||
        i.notes !== undefined
    )

    if (validInputs.length === 0) return { success: true, count: 0 }

    const rowsToUpsert = validInputs.map(input => ({
        client_id: context.id,
        coach_id: context.coach_id,
        metric_date: input.metric_date,
        weight_kg: input.weight_kg ?? null,
        steps: input.steps ?? null,
        sleep_h: input.sleep_h ?? null,
        notes: input.notes ?? null,
    }))

    const { error } = await supabase
        .from('client_metrics')
        .upsert(rowsToUpsert, { onConflict: 'client_id,metric_date' })

    if (error) {
        console.error('[saveClientMetricsBulk] Error upsert:', error.code, error.message, error.details, error.hint)
        if (error.code === '42501' || error.message?.includes('row-level security')) {
            return { success: false, error: 'Sin permiso para guardar estas fechas. Recarga la página e intenta de nuevo.' }
        }
        return { success: false, error: `Error al guardar métricas: ${error.message}` }
    }

    return { success: true, count: rowsToUpsert.length }
}

export async function getRecentClientMetrics(limit = 10) {
    const supabase = createClient()
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
    const supabase = createClient()
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
