'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { subscriptionAccess } from '@/lib/subscription/access.js'

/**
 * Result from requireActiveCoachId.
 * Contains a validated coachId and the authenticated supabase client.
 */
export interface CoachAuthResult {
    supabase: SupabaseClient
    coachId: string
    userId: string
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
 *    (the coach can only open /coach/subscription to pay).
 *
 * Usage:
 * ```ts
 * const { supabase, coachId } = await requireActiveCoachId(data.coach_id)
 * ```
 */
export async function requireActiveCoachId(
    coachIdFromClient?: string | null
): Promise<CoachAuthResult> {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        throw new Error('No autenticado')
    }

    let coachId: string

    if (coachIdFromClient) {
        // Validate that the user has an active membership for this specific coach
        const { data: membership, error: membershipError } = await supabase
            .from('coach_memberships')
            .select('coach_id')
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
    } else {
        // Fallback: grab the first active membership (single-coach scenario)
        const { data: memberships, error: fetchError } = await supabase
            .from('coach_memberships')
            .select('coach_id')
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
    }

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

    return { supabase, coachId, userId: user.id }
}
