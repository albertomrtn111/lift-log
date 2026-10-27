import 'server-only'

import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function normalizeEmail(email: string | null | undefined) {
    return email?.trim().toLowerCase() || null
}

/**
 * Enlaza la ficha que un coach creó para alguien que ya tenía cuenta.
 *
 * Los triggers (handle_new_auth_user y link_client_on_profile_insert) solo
 * enlazan por email al crear la cuenta; si el atleta ya existía en Auth, su
 * ficha nueva se quedaba con auth_user_id vacío ("Registro pendiente") para
 * siempre. Aquí lo hacemos cuando el propio atleta entra con su email
 * verificado (enlace de la invitación o del formulario).
 *
 * No enlaza si ya tiene otra ficha activa, ni si hay varias candidatas: dos
 * fichas activas rompen get-user-context (maybeSingle).
 */
export async function linkPendingClientForUser(user: User): Promise<void> {
    const email = normalizeEmail(user.email)
    if (!email || !user.email_confirmed_at) return

    const admin = createAdminClient()
    const { data: linked, error: linkedError } = await admin
        .from('clients')
        .select('id')
        .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
        .eq('status', 'active')
        .limit(1)
    if (linkedError || (linked && linked.length > 0)) return

    // ilike con comodines escapados y filtro exacto después (puede haber espacios guardados)
    const pattern = `%${email.replace(/[\\%_]/g, char => `\\${char}`)}%`
    const { data: candidates, error } = await admin
        .from('clients')
        .select('id, email, signed_up_at, invite_status, onboarding_status')
        .is('auth_user_id', null)
        .eq('status', 'active')
        .eq('is_sample', false)
        .ilike('email', pattern)
    if (error) {
        console.error('[linkPendingClientForUser]', error)
        return
    }

    const matches = (candidates ?? []).filter(client => normalizeEmail(client.email) === email)
    if (matches.length !== 1) return

    const client = matches[0]
    const now = new Date().toISOString()
    const { error: updateError } = await admin
        .from('clients')
        .update({
            auth_user_id: user.id,
            user_id: user.id,
            signed_up_at: client.signed_up_at ?? now,
            invite_status: client.invite_status === 'pending' || client.invite_status === 'sent'
                ? 'accepted'
                : client.invite_status,
            onboarding_status: client.onboarding_status === 'pending' ? 'accepted' : client.onboarding_status,
            onboarding_updated_at: now,
            updated_at: now,
        })
        .eq('id', client.id)
        .is('auth_user_id', null)
    if (updateError) console.error('[linkPendingClientForUser] update:', updateError)
}
