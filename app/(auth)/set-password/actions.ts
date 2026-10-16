'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * El atleta ha creado su contraseña desde la invitación: queda como
 * "Cuenta creada" en el seguimiento del coach.
 */
export async function markAthleteSignedUpAction(): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const admin = createAdminClient()
    const { data: rows, error } = await admin
        .from('clients')
        .select('id, user_id, auth_user_id, email')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
        .eq('status', 'active')
        .is('signed_up_at', null)

    if (error) {
        console.warn('[markAthleteSignedUpAction]', error.message)
        return
    }

    const now = new Date().toISOString()
    for (const row of rows ?? []) {
        // Solo filas de este usuario o con su email (verificado por el enlace)
        const sameEmail = (row.email as string | null)?.toLowerCase() === user.email.toLowerCase()
        if (row.auth_user_id && row.auth_user_id !== user.id) continue
        if (!row.auth_user_id && !sameEmail && row.user_id !== user.id) continue
        await admin
            .from('clients')
            .update({
                signed_up_at: now,
                accepted_at: now,
                invite_status: 'accepted',
                auth_user_id: row.auth_user_id ?? user.id,
                user_id: row.user_id ?? user.id,
                onboarding_updated_at: now,
            })
            .eq('id', row.id)
    }
}
