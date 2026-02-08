import { createClient } from '@/lib/supabase/server'
import type { Client, ClientWithMeta } from '@/types/coach'

export type StatusFilter = 'all' | 'active' | 'inactive'

export interface ListClientsOptions {
    coachId: string
    statusFilter?: StatusFilter
    search?: string
}

/**
 * Get clients for a coach with optional filters
 */
export async function getClients(options: ListClientsOptions): Promise<ClientWithMeta[]> {
    const { coachId, statusFilter = 'all', search } = options
    const supabase = await createClient()

    let query = supabase
        .from('clients')
        .select('*')
        .eq('coach_id', coachId)

    // Apply status filter
    if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
    }

    // Apply search filter
    if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`
        query = query.or(`full_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
    }

    query = query.order('status', { ascending: true }) // active first
        .order('full_name', { ascending: true })

    const { data, error } = await query

    if (error) {
        console.error('Error fetching clients:', error)
        return []
    }
    if (!data) return []

    // DEV LOG: Confirm that status comes directly from DB
    if (process.env.NODE_ENV === 'development') {
        console.log('--- [getClients] DB PAYLOAD ---')
        console.log(`Filter: ${statusFilter}, Search: ${search || '(none)'}`)
        console.log(`Results: ${data.length}`)
        data.forEach((c: Client) => console.log(`  - ${c.full_name}: status="${c.status}"`))
        console.log('-------------------------------')
    }

    const today = new Date()

    return data.map((client: Client) => {
        const nextCheckin = new Date(client.next_checkin_date)
        const daysUntilCheckin = Math.ceil((nextCheckin.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        return {
            ...client,
            daysUntilCheckin,
        } as ClientWithMeta
    })
}

/**
 * Get single client by ID
 */
export async function getClientById(clientId: string): Promise<Client | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

    if (error || !data) return null
    return data as Client
}

/**
 * Get active clients for a coach (for dropdown selectors)
 */
export async function getActiveClients(coachId: string): Promise<Pick<Client, 'id' | 'full_name'>[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .order('full_name', { ascending: true })

    if (error || !data) return []
    return data
}

export interface CreateClientInput {
    coach_id: string
    full_name: string
    email: string
    phone?: string
    start_date: string
    checkin_frequency_days: number
}

export interface CreateClientResult {
    success: boolean
    client?: Client
    error?: string
    details?: string
}

/**
 * Create a new client (or reactivate existing inactive) via RPC
 * Uses SECURITY DEFINER RPC for atomic UPSERT
 */
export async function createNewClient(input: CreateClientInput): Promise<CreateClientResult> {
    const supabase = await createClient()

    if (!input.coach_id) {
        return {
            success: false,
            error: 'No autorizado',
            details: 'coach_id is required'
        }
    }

    // Call RPC for atomic UPSERT
    const { data, error } = await supabase.rpc('activate_client_for_coach', {
        p_coach_id: input.coach_id,
        p_full_name: input.full_name,
        p_email: input.email,
        p_phone: input.phone || null,
        p_start_date: input.start_date,
        p_checkin_frequency_days: input.checkin_frequency_days
    })

    // DEV LOG: Confirm RPC result
    if (process.env.NODE_ENV === 'development') {
        console.log('--- [createNewClient] RPC RESULT ---')
        console.log(`coach_id: ${input.coach_id}`)
        console.log(`email: ${input.email}`)
        console.log(`RPC data:`, data)
        if (error) console.error(`RPC error:`, error)
        console.log('------------------------------------')
    }

    if (error) {
        console.error('Supabase error creating client:', error)
        return {
            success: false,
            error: error.message,
            details: error.details || error.hint || error.code,
        }
    }

    // Parse the JSONB result
    const clientData = data as Client | null
    if (!clientData) {
        return {
            success: false,
            error: 'No se pudo crear el cliente',
            details: 'RPC returned null'
        }
    }

    return { success: true, client: clientData }
}

export interface UpdateClientInput {
    full_name?: string
    email?: string
    phone?: string
    start_date?: string
    checkin_frequency_days?: number
    next_checkin_date?: string
}

export interface UpdateClientResult {
    success: boolean
    client?: Client
    error?: string
}

/**
 * Update client details
 */
export async function updateClientDetails(
    clientId: string,
    updates: UpdateClientInput
): Promise<UpdateClientResult> {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('clients')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', clientId)
        .select()
        .single()

    if (error) {
        console.error('Error updating client:', error)
        return { success: false, error: error.message }
    }

    return { success: true, client: data as Client }
}

/**
 * Set client status (activate/deactivate)
 */
export async function setClientStatus(
    clientId: string,
    status: 'active' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('clients')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', clientId)

    if (error) {
        console.error('Error updating client status:', error)
        return { success: false, error: error.message }
    }

    return { success: true }
}

// Legacy function - kept for backward compatibility
export async function updateClientStatus(
    clientId: string,
    status: 'active' | 'inactive'
): Promise<boolean> {
    const result = await setClientStatus(clientId, status)
    return result.success
}
