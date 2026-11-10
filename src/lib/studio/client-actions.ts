'use server'

import { createClient } from '@/lib/supabase/server'
import { cleanObjectives } from '@/lib/studio/client-rules'
import type { StudioResult } from '@/lib/studio/session-actions'

export interface StudioPersonMatch {
    id: string
    full_name: string
    active: boolean
    /** Si está en tu lista; si no, al usarlo queda compartido contigo. */
    visible: boolean
    mine?: boolean
    reason?: 'name' | 'email' | 'phone'
    professionals: string[]
}

export interface StudioPatientMatch {
    id: string
    full_name: string
    birth_date: string | null
}

export type CreateClientResult =
    | { status: 'created' | 'linked'; client_id: string }
    | { status: 'duplicates'; matches: StudioPersonMatch[] }

type RpcError = { code?: string; message?: string }

function failure(error: RpcError | null): { success: false; error: string } {
    if (error?.code === '42501') return { success: false, error: 'No tienes permiso para hacer esto.' }
    if (error?.code === '22023') return { success: false, error: error.message ?? 'Revisa los datos.' }
    return { success: false, error: 'No se ha podido guardar. Inténtalo de nuevo.' }
}

/** Clientes del espacio y pacientes de FisioTrack sin vincular que se parecen a lo buscado. */
export async function findPeopleAction(coachId: string, query: string): Promise<StudioResult<{
    clients: StudioPersonMatch[]
    patients: StudioPatientMatch[]
}>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_find_people', { p_coach_id: coachId, p_query: query.slice(0, 80) })
    if (error) return failure(error)
    return { success: true, data: data as { clients: StudioPersonMatch[]; patients: StudioPatientMatch[] } }
}

/** Alta desde la sala. Sin `force`, si se parece a alguien devuelve a quién en lugar de crear. */
export async function createStudioClientAction(input: {
    coachId: string
    fullName: string
    email?: string | null
    phone?: string | null
    birthday?: string | null
    patientId?: string | null
    force?: boolean
}): Promise<StudioResult<CreateClientResult>> {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('studio_create_client', {
        p_coach_id: input.coachId,
        p_full_name: input.fullName,
        p_email: input.email || null,
        p_phone: input.phone || null,
        p_birthday: input.birthday || null,
        p_patient_id: input.patientId || null,
        p_force: input.force ?? false,
    })
    if (error) return failure(error)
    return { success: true, data: data as CreateClientResult }
}

/** Usar un perfil que ya existe: se reactiva si estaba de baja y queda compartido contigo. */
export async function adoptClientAction(clientId: string): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_use_client', { p_client_id: clientId })
    return error ? failure(error) : { success: true, data: undefined }
}

/** Objetivos por puntos y cumpleaños de la ficha. */
export async function saveClientProfileAction(clientId: string, objectives: string[], birthday: string | null): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_save_client_profile', {
        p_client_id: clientId,
        p_objectives: cleanObjectives(objectives),
        p_birthday: birthday || null,
    })
    return error ? failure(error) : { success: true, data: undefined }
}

/** El paciente de FisioTrack vinculado con este cliente, si lo hay. */
export async function getLinkedPatientAction(clientId: string): Promise<StudioResult<StudioPatientMatch | null>> {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('external_patients')
        .select('id, full_name, birth_date')
        .eq('client_id', clientId)
        .maybeSingle()
    if (error) return failure(error)
    return { success: true, data: (data as StudioPatientMatch | null) ?? null }
}

/** Vincular, cambiar o desvincular (null) su paciente de FisioTrack. */
export async function linkPatientAction(clientId: string, patientId: string | null): Promise<StudioResult> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('studio_link_patient', { p_client_id: clientId, p_patient_id: patientId })
    return error ? failure(error) : { success: true, data: undefined }
}
