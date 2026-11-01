'use server'

import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { getAppUrl } from '@/lib/app-url'
import { getStripe, stripeTaxConfig } from '@/lib/subscription/stripe'
import { getAthleteUsage, getCoachSubscription, saveStripeCustomerId } from '@/lib/subscription/coach-subscription'
import { checkoutTrialEnd, PAID_TIERS, priceLookupKey } from '@/lib/subscription/access.js'
import { SALES_EMAIL, findTier, isCycle } from '@/components/auth/plans'

type ActionResult = { url: string; error?: never } | { url?: never; error: string }

/** Estados en los que el espacio ya tiene una suscripción viva en Stripe: se gestiona en el Portal */
const LIVE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'paused']

/** Solo el propietario del espacio paga; tiene que poder hacerlo también con la prueba terminada */
async function requireOwner() {
    const { user, coachId, role } = await requireActiveCoachId(undefined, { allowLocked: true })
    if (role !== 'owner') throw new Error('Solo el propietario del espacio puede gestionar la suscripción.')
    return { user, coachId }
}

export async function startCheckoutAction(tierId: string, cycle: string): Promise<ActionResult> {
    try {
        const tier = findTier(tierId)
        if (!tier || !(PAID_TIERS as readonly string[]).includes(tier.id) || !isCycle(cycle)) {
            return { error: 'Plan no válido.' }
        }
        const stripe = getStripe()
        if (!stripe) return { error: `El pago online aún no está disponible. Escríbenos a ${SALES_EMAIL} y lo activamos.` }

        const { user, coachId } = await requireOwner()
        const subscription = await getCoachSubscription(coachId)
        if (!subscription) return { error: 'Tu espacio no tiene suscripción. Escríbenos y lo revisamos.' }

        // Ya paga (o tiene el pago pendiente): cambiar de plan o tarjeta se hace en el Portal
        if (subscription.stripe_subscription_id && LIVE_STATUSES.includes(subscription.status)) {
            return openPortal(subscription.stripe_customer_id)
        }
        // Lo mismo si Stripe ya tiene una viva que el webhook aún no ha copiado (Checkout en otra pestaña)
        if (subscription.stripe_customer_id) {
            const { data: existing } = await stripe.subscriptions.list({ customer: subscription.stripe_customer_id, status: 'all', limit: 10 })
            if (existing.some(item => LIVE_STATUSES.includes(item.status))) {
                return openPortal(subscription.stripe_customer_id)
            }
        }

        const usage = await getAthleteUsage(coachId)
        if (usage.active > tier.athletes) {
            return { error: `Tienes ${usage.active} atletas activos y ${tier.name} permite ${tier.athletes}. Elige un plan mayor o da de baja atletas.` }
        }

        const { data: prices } = await stripe.prices.list({ lookup_keys: [priceLookupKey(tier.id, cycle)], active: true, limit: 1 })
        const price = prices[0]
        if (!price) {
            console.error(`[stripe] Falta el precio ${priceLookupKey(tier.id, cycle)} (ejecuta scripts/stripe-setup.mjs)`)
            return { error: 'Este plan no está disponible ahora mismo. Inténtalo más tarde.' }
        }

        let customerId = subscription.stripe_customer_id
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined,
                preferred_locales: ['es'],
                metadata: { coach_id: coachId, user_id: user.id },
            })
            customerId = customer.id
            await saveStripeCustomerId(coachId, customerId)
        }

        // Si le quedan días de prueba (aunque una suscripción anterior se cancelara), no se cobra hasta que acabe
        const trialEnd = checkoutTrialEnd(subscription.trial_ends_at)
        const tax = stripeTaxConfig()
        const appUrl = getAppUrl()

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            client_reference_id: coachId,
            line_items: [{ price: price.id, quantity: 1 }],
            subscription_data: {
                metadata: { coach_id: coachId },
                ...(trialEnd ? { trial_end: trialEnd } : {}),
                ...(tax.taxRateIds.length ? { default_tax_rates: tax.taxRateIds } : {}),
            },
            metadata: { coach_id: coachId },
            automatic_tax: { enabled: tax.automatic },
            tax_id_collection: { enabled: true },
            billing_address_collection: 'required',
            customer_update: { address: 'auto', name: 'auto' },
            allow_promotion_codes: true,
            locale: 'es',
            success_url: `${appUrl}/coach/subscription?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/coach/subscription`,
        })
        if (!session.url) return { error: 'No se pudo abrir el pago. Inténtalo de nuevo.' }
        return { url: session.url }
    } catch (error) {
        console.error('[subscription] startCheckoutAction:', error)
        return { error: error instanceof Error && !('type' in error) ? error.message : 'No se pudo abrir el pago. Inténtalo de nuevo.' }
    }
}

export async function openBillingPortalAction(): Promise<ActionResult> {
    try {
        const { coachId } = await requireOwner()
        const subscription = await getCoachSubscription(coachId)
        return openPortal(subscription?.stripe_customer_id ?? null)
    } catch (error) {
        console.error('[subscription] openBillingPortalAction:', error)
        return { error: error instanceof Error && !('type' in error) ? error.message : 'No se pudo abrir la gestión de la suscripción.' }
    }
}

async function openPortal(customerId: string | null): Promise<ActionResult> {
    const stripe = getStripe()
    if (!stripe) return { error: `La gestión online aún no está disponible. Escríbenos a ${SALES_EMAIL}.` }
    if (!customerId) return { error: 'Aún no tienes una suscripción de pago.' }
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        locale: 'es',
        return_url: `${getAppUrl()}/coach/subscription`,
    })
    return { url: session.url }
}
