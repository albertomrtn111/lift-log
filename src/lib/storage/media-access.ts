import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Permisos de las fotos privadas guardadas en R2. Repiten las políticas de
 * storage.objects de Supabase para los buckets equivalentes, consultando con la
 * sesión del usuario (RLS incluida):
 *
 * - checkin-media_storage_*: coach activo del espacio (is_coach_member) o el
 *   propio atleta (clients.id = carpeta 2 y auth_user_id = usuario).
 * - chat_media_coach_all / chat_media_client_*: coach activo del espacio, o el
 *   atleta de esa conversación (clients.id = carpeta 2, coach_id = carpeta 1 y
 *   auth_user_id o user_id = usuario).
 */

async function isCoachMember(supabase: SupabaseClient, coachId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_coach_member', { p_coach_id: coachId })
    if (error) {
        console.error('[media-access] is_coach_member:', error.message)
        return false
    }
    return data === true
}

export async function canAccessCheckinMedia(
    supabase: SupabaseClient,
    userId: string,
    coachId: string,
    clientId: string,
): Promise<boolean> {
    if (await isCoachMember(supabase, coachId)) return true
    const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('auth_user_id', userId)
        .maybeSingle()
    return !!data
}

export async function canAccessChatMedia(
    supabase: SupabaseClient,
    userId: string,
    coachId: string,
    clientId: string,
): Promise<boolean> {
    if (await isCoachMember(supabase, coachId)) return true
    const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
        .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle()
    return !!data
}

/**
 * Archivos de la sala. La carpeta del espacio es de todo el equipo que entrena; la de un
 * cliente, de quien lo lleva y mientras siga su consentimiento de imagen.
 */
export async function canAccessStudioMedia(
    supabase: SupabaseClient,
    coachId: string,
    folderId: string,
): Promise<boolean> {
    const { data, error } = await supabase.rpc('studio_can_use_media', { p_coach_id: coachId, p_folder_id: folderId })
    if (error) {
        console.error('[media-access] studio_can_use_media:', error.message)
        return false
    }
    return data === true
}

export async function canAccessPrivateMedia(
    supabase: SupabaseClient,
    userId: string,
    area: 'checkin-media' | 'chat-media' | 'studio-media',
    coachId: string,
    clientId: string,
): Promise<boolean> {
    if (area === 'studio-media') return canAccessStudioMedia(supabase, coachId, clientId)
    return area === 'checkin-media'
        ? canAccessCheckinMedia(supabase, userId, coachId, clientId)
        : canAccessChatMedia(supabase, userId, coachId, clientId)
}
