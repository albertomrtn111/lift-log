'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/get-user-context'
import { getClientDeliverySettings, updateClientDeliverySettings } from '@/lib/notifications/delivery-settings'

/** Guarda la zona horaria del móvil del atleta si ha cambiado (recordatorios a su hora local). */
export async function syncTimezoneAction(timezone: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const context = await getUserContext(user.id)
    if (!context.isClient || !context.clientId) return

    const current = await getClientDeliverySettings(context.clientId)
    if (current.timezone === timezone) return
    await updateClientDeliverySettings(context.clientId, { timezone })
}
