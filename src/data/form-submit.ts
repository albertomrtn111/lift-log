'use server'

import { createClient } from '@/lib/supabase/server'

interface SubmitFormResult {
    success: boolean
    error?: string
}

export async function submitFormAction(
    checkinId: string,
    payload: Record<string, unknown>
): Promise<SubmitFormResult> {
    const supabase = await createClient()

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // 2. Verify the checkin belongs to this user's client record
    const { data: checkin, error: checkinErr } = await supabase
        .from('checkins')
        .select('id, client_id, status')
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return { success: false, error: 'Formulario no encontrado' }
    }

    // Verify ownership: the client's auth_user_id must match the current user
    const { data: client } = await supabase
        .from('clients')
        .select('auth_user_id')
        .eq('id', checkin.client_id)
        .single()

    if (!client || client.auth_user_id !== user.id) {
        return { success: false, error: 'No tienes permiso para enviar este formulario' }
    }

    if (checkin.status !== 'pending') {
        return { success: false, error: 'Este formulario ya fue enviado' }
    }

    // 3. Update checkin with submitted data
    const { error: updateErr } = await supabase
        .from('checkins')
        .update({
            raw_payload: payload,
            submitted_at: new Date().toISOString(),
            status: 'reviewed',
        })
        .eq('id', checkinId)

    if (updateErr) {
        console.error('[submitFormAction] Update error:', updateErr)
        return { success: false, error: updateErr.message }
    }

    return { success: true }
}
