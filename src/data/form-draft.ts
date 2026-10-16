'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_DRAFT_BYTES = 50_000

/**
 * Autoguardado de un formulario a medias. Solo mientras está pendiente y en
 * raw_payload._draft, para que nadie lo confunda con respuestas enviadas
 * (al enviarlo, submitFormAction sustituye raw_payload entero).
 */
export async function saveFormDraftAction(
    checkinId: string,
    values: Record<string, unknown>
): Promise<{ success: boolean; savedAt?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const draft: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values ?? {})) {
        if (!/^(campo_|metric_)?[\w-]{1,80}$/.test(key)) continue
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) draft[key] = value
        else if (Array.isArray(value) && value.every(item => typeof item === 'string')) draft[key] = value
    }
    if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) return { success: false }

    const admin = createAdminClient()
    const { data: checkin } = await admin
        .from('checkins')
        .select('id, client_id, status')
        .eq('id', checkinId)
        .maybeSingle()
    if (!checkin || checkin.status !== 'pending') return { success: false }

    const { data: client } = await admin
        .from('clients')
        .select('auth_user_id, user_id')
        .eq('id', checkin.client_id)
        .maybeSingle()
    if (!client || (client.auth_user_id !== user.id && client.user_id !== user.id)) return { success: false }

    const savedAt = new Date().toISOString()
    const { error } = await admin
        .from('checkins')
        .update({ raw_payload: { _draft: draft, _draft_saved_at: savedAt } })
        .eq('id', checkinId)
        .eq('status', 'pending')
    if (error) {
        console.error('[saveFormDraftAction]', error)
        return { success: false }
    }
    return { success: true, savedAt }
}
