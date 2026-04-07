
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
// Returns null if no session or no matching client
async function getClientContext() {
    try {
        const supabase = createClient()
        const {
            data: { user: initialUser },
            error: authError,
        } = await supabase.auth.getUser()
        let user = initialUser

        // If no user, attempt a silent token refresh before giving up.
        // This handles PWA / long-idle sessions where the access token has
        // expired but the refresh token is still valid.
        if (!user || authError) {
            console.warn('[getClientContext] No user or auth error, attempting session refresh...', authError ?? null)
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
            if (refreshError || !refreshData.user) {
                console.error('[getClientContext] Refresh failed:', refreshError?.message ?? 'no user after refresh')
                return null
            }
            user = refreshData.user
        }
        if (!user) {
            console.warn('[getClientContext] No user in session — session may be expired')
            return null
        }

        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, coach_id')
            .eq('auth_user_id', user.id)
            .eq('status', 'active')
            .maybeSingle()

        if (clientError) {
            console.error('[getClientContext] Error fetching client:', clientError.message, clientError.code)
            return null
        }
        if (!client) {
            console.warn('[getClientContext] No active client found for user:', user.id)
            return null
        }

        return { ...client, userId: user.id }
    } catch (err) {
        console.error('[getClientContext] Unexpected error:', err)
        return null
    }
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

export async function saveClientMetrics(input: ClientMetricInput): Promise<{ success: boolean; error?: string; sessionExpired?: boolean }> {
    try {
        const supabase = createClient()
        const context = await getClientContext()

        if (!context) {
            return {
                success: false,
                error: 'Sesión no encontrada. Por favor cierra la app, vuelve a abrirla e inicia sesión de nuevo.',
                sessionExpired: true
            }
        }

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
            console.error('[saveClientMetrics] Upsert error:', error.code, error.message, error.details, error.hint)
            if (error.code === '42501' || error.message?.includes('row-level security')) {
                return { success: false, error: 'Sin permiso para guardar esta fecha. Recarga la página e intenta de nuevo.', sessionExpired: false }
            }
            return { success: false, error: `Error al guardar: ${error.message}`, sessionExpired: false }
        }

        return { success: true, sessionExpired: false }
    } catch (err) {
        console.error('[saveClientMetrics] Unexpected throw:', err)
        return {
            success: false,
            error: 'Error inesperado al guardar. Por favor recarga la página.',
            sessionExpired: false
        }
    }
}

export async function saveClientMetricsBulk(inputs: ClientMetricInput[]): Promise<{ success: boolean; error?: string; count?: number; sessionExpired?: boolean }> {
    try {
        const supabase = createClient()
        const context = await getClientContext()

        if (!context) {
            return {
                success: false,
                error: 'Sesión no encontrada. Por favor cierra la app, vuelve a abrirla e inicia sesión de nuevo.',
                sessionExpired: true
            }
        }

        // Use only valid days that have at least one field filled
        const validInputs = inputs.filter(i =>
            i.weight_kg !== undefined ||
            i.steps !== undefined ||
            i.sleep_h !== undefined ||
            i.notes !== undefined
        )

        if (validInputs.length === 0) return { success: true, count: 0, sessionExpired: false }

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
                return { success: false, error: 'Sin permiso para guardar estas fechas. Recarga la página e intenta de nuevo.', sessionExpired: false }
            }
            return { success: false, error: `Error al guardar métricas: ${error.message}`, sessionExpired: false }
        }

        return { success: true, count: rowsToUpsert.length, sessionExpired: false }
    } catch (err) {
        console.error('[saveClientMetricsBulk] Unexpected throw:', err)
        return {
            success: false,
            error: 'Error inesperado al guardar. Por favor recarga la página.',
            sessionExpired: false
        }
    }
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
