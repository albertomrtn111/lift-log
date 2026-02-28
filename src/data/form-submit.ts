'use server'

import { createClient } from '@/lib/supabase/server'

interface SubmitFormResult {
    success: boolean
    error?: string
    isOnboarding?: boolean
}

export async function submitFormAction(
    checkinId: string,
    payload: Record<string, unknown>
): Promise<SubmitFormResult> {
    const supabase = await createClient()

    // 1. Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    // 2. Verify the checkin exists and load its type
    const { data: checkin, error: checkinErr } = await supabase
        .from('checkins')
        .select('id, client_id, type, status')
        .eq('id', checkinId)
        .single()

    if (checkinErr || !checkin) {
        return { success: false, error: 'Formulario no encontrado' }
    }

    // 3. Verify ownership: the client's auth_user_id must match the current user
    const { data: client } = await supabase
        .from('clients')
        .select('id, auth_user_id')
        .eq('id', checkin.client_id)
        .single()

    if (!client || client.auth_user_id !== user.id) {
        return { success: false, error: 'No tienes permiso para enviar este formulario' }
    }

    // 4. Prevent re-submission
    if (checkin.status !== 'pending') {
        return { success: false, error: 'Este formulario ya fue enviado' }
    }

    // 5. Validate type for onboarding-specific forms
    const isOnboarding = checkin.type === 'onboarding'

    // 6. Update checkin with submitted data
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
        .from('checkins')
        .update({
            raw_payload: payload,
            submitted_at: now,
            status: 'reviewed',
        })
        .eq('id', checkinId)

    if (updateErr) {
        console.error('[submitFormAction] Checkin update error:', updateErr)
        return { success: false, error: updateErr.message }
    }

    // 7. If this is an onboarding form, update the client's onboarding status
    if (isOnboarding) {
        const { error: clientErr } = await supabase
            .from('clients')
            .update({
                onboarding_status: 'accepted',
                onboarding_updated_at: now,
            })
            .eq('id', client.id)

        if (clientErr) {
            // Non-blocking: checkin was already saved, log the error
            console.error('[submitFormAction] Client onboarding update error:', clientErr)
        }
    }

    return { success: true, isOnboarding }
}
