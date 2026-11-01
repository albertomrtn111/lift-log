'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient, type User } from '@supabase/supabase-js'
import { subscriptionAccess } from '@/lib/subscription/access.js'

/**
 * Result from requireActiveCoachId.
 * Contains a validated coachId and the authenticated supabase client.
 */
export interface CoachAuthResult {
    supabase: SupabaseClient
    coachId: string
    userId: string
    user: User
    /** Rol en el espacio (owner, coach…) */
    role: string
}

export interface RequireCoachOptions {
    /** Deja pasar aunque la prueba haya terminado (solo la pantalla de Suscripción y su pago) */
    allowLocked?: boolean
}

/**
 * Unified guard for all Coach Portal server actions.
 *
 * 1. Authenticates the user via supabase.auth.getUser()
 * 2. If `coachIdFromClient` is provided, validates the user has an active
 *    membership for that specific coach.
 * 3. If not provided, falls back to the user's first active membership
 *    (single-coach convenience).
 * 4. Throws if no valid membership exists — never creates coaches or
 *    deduces from role='owner'.
 * 5. Throws if the workspace has no active subscription or trial
 *    (the coach can only open /coach/subscription to pay), unless
 *    `options.allowLocked` is set.
 *
 * Usage:
 * ```ts
 * const { supabase, coachId } = await requireActiveCoachId(data.coach_id)
 * ```
 */
export async function requireActiveCoachId(
    coachIdFromClient?: string | null,
    options: RequireCoachOptions = {}
): Promise<CoachAuthResult> {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        throw new Error('No autenticado')
    }

    let coachId: string
    let role: string

    if (coachIdFromClient) {
        // Validate that the user has an active membership for this specific coach
        const { data: membership, error: membershipError } = await supabase
            .from('coach_memberships')
            .select('coach_id, role')
            .eq('user_id', user.id)
            .eq('coach_id', coachIdFromClient)
            .eq('status', 'active')
            .single()

        if (membershipError || !membership) {
            throw new Error(
                'No tienes una membresía activa para este coach. Acceso denegado.'
            )
        }

        coachId = membership.coach_id
        role = membership.role
    } else {
        // Fallback: grab the first active membership (single-coach scenario)
        const { data: memberships, error: fetchError } = await supabase
            .from('coach_memberships')
            .select('coach_id, role')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: true })
            .limit(1)

        if (fetchError || !memberships?.length) {
            throw new Error(
                'No tienes ninguna membresía de coach activa.'
            )
        }

        coachId = memberships[0].coach_id
        role = memberships[0].role
    }

    if (options.allowLocked) return { supabase, coachId, userId: user.id, user, role }

    // Prueba terminada o suscripción cancelada: nada de acciones de coach.
    // Si no se puede leer la suscripción (fallo de red, tabla aún sin crear) no se bloquea.
    const { data: subscription, error: subscriptionError } = await supabase
        .from('coach_subscriptions')
        .select('status, trial_ends_at, stripe_subscription_id')
        .eq('coach_id', coachId)
        .maybeSingle()
    if (subscriptionError) {
        console.warn(`[requireActiveCoachId] No se pudo leer la suscripción de ${coachId}: ${subscriptionError.message}`)
    } else if (!subscriptionAccess(subscription).allowed) {
        throw new Error('Tu prueba gratis ha terminado. Elige un plan en Suscripción para seguir usando NexTrain.')
    }

    return { supabase, coachId, userId: user.id, user, role }
}
