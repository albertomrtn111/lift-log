import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { athleteProfileIds, avatarUrlsByClient, type AthleteAvatarSource, type ProfileAvatarRow } from './athlete-avatars.js'

/**
 * Fotos de perfil de una lista de atletas del coach, en una sola consulta.
 * La RLS de `profiles` solo deja leer el propio perfil, así que se lee con el
 * cliente admin: pásale solo atletas que ya has leído como el coach.
 * Devuelve la URL por id de atleta (`clients.id`); sin foto, no hay entrada.
 * Nunca falla: sin fotos se ven las iniciales y la lista sigue cargando.
 */
export async function getAthleteAvatarUrls(clients: AthleteAvatarSource[]): Promise<Map<string, string>> {
    const profileIds = athleteProfileIds(clients)
    if (profileIds.length === 0) return new Map()

    try {
        const { data, error } = await createAdminClient()
            .from('profiles')
            .select('id, avatar_url')
            .in('id', profileIds)
            .not('avatar_url', 'is', null)
        if (error) throw error
        return avatarUrlsByClient(clients, (data ?? []) as ProfileAvatarRow[], process.env.NEXT_PUBLIC_SUPABASE_URL)
    } catch (error) {
        console.error('[getAthleteAvatarUrls]', error)
        return new Map()
    }
}
