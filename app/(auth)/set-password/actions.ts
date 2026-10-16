'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * El atleta ha creado su contraseña: queda como "Cuenta creada" en el
 * seguimiento del coach.
 *
 * No basta con signed_up_at: el trigger link_client_on_profile_insert lo
 * rellena en cuanto el enlace de invitación crea la cuenta, antes de que el
 * atleta haga nada. Por eso se guarda preferences.onboarding.password_set_at.
 */
export async function markAthleteSignedUpAction(): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return

    const admin = createAdminClient()
    const email = user.email.toLowerCase()
    const { data: rows, error } = await admin
        .from('clients')
        .select('id, user_id, auth_user_id, email, signed_up_at, accepted_at, preferences')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id},email.eq.${email}`)
        .eq('status', 'active')

    if (error) {
        console.warn('[markAthleteSignedUpAction]', error.message)
        return
    }

    const now = new Date().toISOString()
    for (const row of rows ?? []) {
        // Solo filas de este usuario o con su email (verificado por el enlace)
        const sameEmail = (row.email as string | null)?.trim().toLowerCase() === email
        if (row.auth_user_id && row.auth_user_id !== user.id) continue
        if (!row.auth_user_id && !sameEmail && row.user_id !== user.id) continue

        const preferences = (row.preferences ?? {}) as { onboarding?: Record<string, unknown> }
        const onboarding = { ...(preferences.onboarding ?? {}) }
        if (!onboarding.password_set_at) onboarding.password_set_at = now

        await admin
            .from('clients')
            .update({
                preferences: { ...preferences, onboarding },
                signed_up_at: row.signed_up_at ?? now,
                accepted_at: row.accepted_at ?? now,
                invite_status: 'accepted',
                auth_user_id: row.auth_user_id ?? user.id,
                user_id: row.user_id ?? user.id,
                onboarding_updated_at: now,
            })
            .eq('id', row.id)
    }
}
