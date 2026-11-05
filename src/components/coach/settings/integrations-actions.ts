'use server'

import { getStudioTeamList } from '@/data/studio'
import { getActiveCoachId } from '@/lib/auth/active-coach'
import { createClient } from '@/lib/supabase/server'

type Result<T = undefined> = { success: true; data: T } | { success: false; error: string }

export interface IntegrationsData {
    coachId: string
    connection: { status: string; last_sync_at: string | null; last_error: string | null } | null
    services: { id: string; name: string; kind: string; group_mode: string; creates_session: boolean }[]
    staff: { external_id: string; external_name: string; user_id: string | null }[]
    team: { id: string; name: string }[]
}

const FISIOTRACK_CHECK = 'https://app.fisiotrack.com/api/v1/services?per_page=1'

function failure(error: { code?: string; message?: string } | null, fallback: string): { success: false; error: string } {
    return { success: false, error: error?.code === '42501' || error?.code === '22023' ? error.message ?? fallback : fallback }
}

export async function getIntegrationsAction(): Promise<Result<IntegrationsData>> {
    const coachId = await getActiveCoachId()
    if (!coachId) return { success: false, error: 'No hay un espacio activo.' }
    const supabase = await createClient()
    const [{ data: connection }, { data: services }, { data: staff }, team] = await Promise.all([
        supabase.from('external_connections').select('status, last_sync_at, last_error').eq('coach_id', coachId).eq('provider', 'fisiotrack').maybeSingle(),
        supabase.from('agenda_services').select('id, name, kind, group_mode, creates_session').eq('coach_id', coachId).order('name'),
        supabase.from('external_staff_map').select('external_id, external_name, user_id').eq('coach_id', coachId).order('external_name'),
        getStudioTeamList(coachId),
    ])
    return {
        success: true,
        data: {
            coachId,
            connection,
            services: services ?? [],
            staff: staff ?? [],
            team,
        },
    }
}

/** Comprueba el token con una lectura antes de guardarlo. Nunca vuelve al navegador. */
export async function connectAgendaAction(coachId: string, token: string): Promise<Result> {
    const check = await fetch(FISIOTRACK_CHECK, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' } }).catch(() => null)
    if (!check?.ok) return { success: false, error: 'FisioTrack no acepta ese token. Revísalo y vuelve a pegarlo.' }
    const supabase = await createClient()
    const { error } = await supabase.rpc('agenda_connect', { p_coach_id: coachId, p_token: token })
    return error ? failure(error, 'No se ha podido guardar la conexión.') : { success: true, data: undefined }
}

export async function disconnectAgendaAction(coachId: string): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('agenda_disconnect', { p_coach_id: coachId })
    return error ? failure(error, 'No se ha podido desconectar.') : { success: true, data: undefined }
}

export async function updateServiceAction(serviceId: string, kind: string, groupMode: string, createsSession: boolean): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('agenda_update_service', {
        p_service_id: serviceId,
        p_kind: kind,
        p_group_mode: groupMode,
        p_creates_session: createsSession,
    })
    return error ? failure(error, 'No se ha podido guardar el servicio.') : { success: true, data: undefined }
}

export async function mapStaffAction(coachId: string, externalId: string, userId: string | null): Promise<Result> {
    const supabase = await createClient()
    const { error } = await supabase.rpc('agenda_map_staff', { p_coach_id: coachId, p_external_id: externalId, p_user_id: userId })
    return error ? failure(error, 'No se ha podido asociar el profesional.') : { success: true, data: undefined }
}
