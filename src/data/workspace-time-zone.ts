import 'server-only'

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_TIME_ZONE, resolveTimeZone } from '@/lib/time-zone'

// Zona horaria del espacio (coaches.timezone) para calcular «hoy» en las
// pantallas del atleta. Va con el cliente de servicio porque el atleta no puede
// leer la fila de coaches; solo se devuelve la zona. Quien llama ya ha
// comprobado que el atleta o el espacio son del usuario.

/** Zona del espacio, o Europe/Madrid si no tiene o no es válida. */
export const getCoachTimeZone = cache(async (coachId: string | null | undefined): Promise<string> => {
    if (!coachId) return DEFAULT_TIME_ZONE
    const { data, error } = await createAdminClient()
        .from('coaches')
        .select('timezone')
        .eq('id', coachId)
        .maybeSingle()
    if (error) console.error('[getCoachTimeZone]', error.message)
    return resolveTimeZone(data?.timezone)
})

/** Zona del espacio al que pertenece un atleta (clients.id). */
export const getClientTimeZone = cache(async (clientId: string): Promise<string> => {
    const { data, error } = await createAdminClient()
        .from('clients')
        .select('coach_id')
        .eq('id', clientId)
        .maybeSingle()
    if (error) console.error('[getClientTimeZone]', error.message)
    return getCoachTimeZone(data?.coach_id as string | null | undefined)
})
