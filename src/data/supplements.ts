import { createClient } from '@/lib/supabase/client'

export interface ClientSupplement {
    id: string
    coach_id: string
    client_id: string
    supplement_name: string
    dose_amount: number
    dose_unit: string
    daily_doses: number
    dose_schedule: string[]   // ["08:00", "14:00"]
    notes?: string
    is_active: boolean
    start_date?: string
    end_date?: string
    created_at: string
    updated_at: string
}

export interface SupplementInput {
    supplement_name: string
    dose_amount: number
    dose_unit: string
    daily_doses: number
    dose_schedule: string[]
    notes?: string
    start_date?: string
    end_date?: string
}

export async function getActiveSupplements(coachId: string, clientId: string): Promise<ClientSupplement[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('client_supplements')
        .select('*')
        .eq('coach_id', coachId)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
    if (error) throw error
    return data as ClientSupplement[]
}

export async function createSupplement(
    coachId: string,
    clientId: string,
    input: SupplementInput
): Promise<ClientSupplement> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('client_supplements')
        .insert({
            coach_id: coachId,
            client_id: clientId,
            ...input,
            notes: input.notes || null,
            start_date: input.start_date || null,
            end_date: input.end_date || null,
        })
        .select()
        .single()
    if (error) throw error
    return data as ClientSupplement
}

export async function updateSupplement(
    id: string,
    input: Partial<SupplementInput>
): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('client_supplements')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
    if (error) throw error
}

export async function deleteSupplement(id: string): Promise<void> {
    // Soft delete: marcar como inactivo
    const supabase = createClient()
    const { error } = await supabase
        .from('client_supplements')
        .update({ is_active: false })
        .eq('id', id)
    if (error) throw error
}
