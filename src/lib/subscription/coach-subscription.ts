import 'server-only'

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    effectiveTier,
    normalizeStripeStatus,
    parsePriceLookupKey,
    subscriptionAccess,
    type SubscriptionAccess,
} from './access.js'

export interface CoachSubscription {
    coach_id: string
    status: string
    plan: 'starter' | 'pro' | 'studio' | 'concierge'
    billing_cycle: 'monthly' | 'yearly'
    trial_ends_at: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    stripe_price_id: string | null
}

const COLUMNS = 'coach_id, status, plan, billing_cycle, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, stripe_price_id'

export async function getCoachSubscription(coachId: string): Promise<CoachSubscription | null> {
    const admin = createAdminClient()
    const { data, error } = await admin.from('coach_subscriptions').select(COLUMNS).eq('coach_id', coachId).maybeSingle()
    if (error) throw new Error(error.message)
    return data as CoachSubscription | null
}

export async function getCoachAccess(coachId: string): Promise<{ subscription: CoachSubscription | null; access: SubscriptionAccess }> {
    const subscription = await getCoachSubscription(coachId)
    return { subscription, access: subscriptionAccess(subscription) }
}

/** ¿Puede el espacio usar la app? Si no se puede leer la suscripción, sí (no se corta el servicio por un fallo). */
export async function isCoachAllowed(coachId: string): Promise<boolean> {
    try {
        return (await getCoachAccess(coachId)).access.allowed
    } catch (error) {
        console.warn(`[subscription] No se pudo leer la suscripción de ${coachId}; se permite:`, error instanceof Error ? error.message : error)
        return true
    }
}

export async function saveStripeCustomerId(coachId: string, customerId: string) {
    const admin = createAdminClient()
    const { error } = await admin
        .from('coach_subscriptions')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('coach_id', coachId)
    if (error) throw new Error(error.message)
}

const toIso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null)

/**
 * Copia a coach_subscriptions el estado de una suscripción de Stripe y ajusta
 * el plan del espacio (Pro mientras dure la prueba, después el plan pagado).
 * Siempre relee la suscripción de Stripe, así el orden de los webhooks da igual.
 */
export async function syncStripeSubscription(stripe: Stripe, subscriptionId: string): Promise<string | null> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const admin = createAdminClient()

    let coachId = subscription.metadata?.coach_id || null
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    if (!coachId) {
        const { data } = await admin.from('coach_subscriptions').select('coach_id').eq('stripe_customer_id', customerId).maybeSingle()
        coachId = data?.coach_id ?? null
    }
    if (!coachId) {
        console.warn(`[stripe] Suscripción ${subscription.id} sin coach asociado`)
        return null
    }

    const { data: current, error: currentError } = await admin
        .from('coach_subscriptions')
        .select('stripe_subscription_id, status')
        .eq('coach_id', coachId)
        .maybeSingle()
    if (currentError) throw new Error(currentError.message)

    // Si el espacio ya tiene otra suscripción viva, una antigua cancelada no la pisa
    if (
        current?.stripe_subscription_id
        && current.stripe_subscription_id !== subscription.id
        && !['canceled', 'incomplete_expired'].includes(current.status)
        && ['canceled', 'incomplete_expired'].includes(subscription.status)
    ) {
        return coachId
    }

    // Dos suscripciones vivas para el mismo espacio (dos Checkout a la vez): se cobra doble
    const live = ['trialing', 'active', 'past_due', 'unpaid', 'paused']
    if (
        current?.stripe_subscription_id
        && current.stripe_subscription_id !== subscription.id
        && live.includes(current.status)
        && live.includes(subscription.status)
    ) {
        console.error(`[stripe] El coach ${coachId} tiene dos suscripciones vivas (${current.stripe_subscription_id} y ${subscription.id}): cancela una en Stripe`)
    }

    const item = subscription.items.data[0]
    const parsed = parsePriceLookupKey(item?.price.lookup_key)
    const status = normalizeStripeStatus(subscription.status)

    const row = {
        coach_id: coachId,
        status,
        ...(parsed ? { plan: parsed.tier, billing_cycle: parsed.cycle } : {}),
        trial_ends_at: toIso(subscription.trial_end),
        current_period_end: toIso(item?.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: item?.price.id ?? null,
        updated_at: new Date().toISOString(),
    }
    const { error } = current
        ? await admin.from('coach_subscriptions').update(row).eq('coach_id', coachId)
        : await admin.from('coach_subscriptions').insert({ plan: 'pro', ...row })
    if (error) throw new Error(error.message)

    const tier = parsed ? effectiveTier(status, parsed.tier) : null
    if (tier) {
        const { error: coachError } = await admin
            .from('coaches')
            .update({ subscription_tier: tier, billing_cycle: parsed!.cycle, updated_at: new Date().toISOString() })
            .eq('id', coachId)
        if (coachError) throw new Error(coachError.message)
    }
    return coachId
}

/** Atletas activos (sin la de ejemplo) frente al límite del plan; limit null = sin límite */
export async function getAthleteUsage(coachId: string): Promise<{ active: number; limit: number | null }> {
    const admin = createAdminClient()
    const [{ count, error }, { data: coach, error: coachError }] = await Promise.all([
        admin.from('clients').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).eq('status', 'active').eq('is_sample', false),
        admin.from('coaches').select('max_active_clients').eq('id', coachId).single(),
    ])
    if (error) throw new Error(error.message)
    if (coachError) throw new Error(coachError.message)
    return { active: count ?? 0, limit: coach?.max_active_clients ?? null }
}

/**
 * Espacios (de la lista) sin suscripción activa ni prueba en curso. Para que los
 * envíos automáticos (revisiones, recordatorios) se pausen mientras están bloqueados.
 * Si no se puede leer la tabla, no bloquea a nadie: mejor enviar que cortar el servicio.
 */
export async function getBlockedCoachIds(coachIds: string[]): Promise<Set<string>> {
    const blocked = new Set<string>()
    const ids = [...new Set(coachIds)]
    if (!ids.length) return blocked
    const admin = createAdminClient()
    const { data, error } = await admin
        .from('coach_subscriptions')
        .select('coach_id, status, trial_ends_at, stripe_subscription_id')
        .in('coach_id', ids)
    if (error) {
        console.warn('[subscription] No se pudo leer coach_subscriptions; no se pausa ningún envío:', error.message)
        return blocked
    }
    const byCoach = new Map((data ?? []).map(row => [row.coach_id as string, row]))
    for (const id of ids) {
        if (!subscriptionAccess(byCoach.get(id) ?? null).allowed) blocked.add(id)
    }
    return blocked
}
