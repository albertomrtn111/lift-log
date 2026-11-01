import { redirect } from 'next/navigation'
import { CoachPageHeader } from '@/components/coach/CoachPageHeader'
import { SubscriptionPanel } from '@/components/coach/subscription/SubscriptionPanel'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { getStripe, isStripeConfigured } from '@/lib/subscription/stripe'
import { getAthleteUsage, getCoachAccess, syncStripeSubscription } from '@/lib/subscription/coach-subscription'
import { PAID_TIERS } from '@/lib/subscription/access.js'

export const dynamic = 'force-dynamic'

/**
 * Suscripción del coach a NexTrain. Es la única pantalla de coach que se abre
 * con la prueba terminada (el middleware manda aquí todo lo demás).
 */
export default async function SubscriptionPage({ searchParams }: { searchParams: { session_id?: string } }) {
    const auth = await requireActiveCoachId(undefined, { allowLocked: true }).catch(() => null)
    if (!auth) redirect('/no-access')
    const { coachId, role } = auth

    // Vuelta de Stripe Checkout: no esperamos al webhook para mostrar el plan
    const stripe = getStripe()
    let justSubscribed = false
    if (stripe && searchParams.session_id) {
        try {
            const session = await stripe.checkout.sessions.retrieve(searchParams.session_id)
            const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
            if (session.metadata?.coach_id === coachId && subscriptionId) {
                await syncStripeSubscription(stripe, subscriptionId)
                justSubscribed = true
            }
        } catch (error) {
            console.warn('[subscription] No se pudo leer la sesión de Checkout:', error)
        }
    }

    const [{ subscription, access }, usage] = await Promise.all([getCoachAccess(coachId), getAthleteUsage(coachId)])
    const plan = subscription && (PAID_TIERS as readonly string[]).includes(subscription.plan) ? subscription.plan as 'starter' | 'pro' | 'studio' : 'pro'

    return (
        <div className="min-h-screen">
            <CoachPageHeader
                eyebrow="Cuenta"
                title="Suscripción"
                description="Tu plan de NexTrain, la prueba gratis y los pagos."
            />
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
                <SubscriptionPanel
                    state={access.state}
                    trialDaysLeft={access.trialDaysLeft}
                    status={subscription?.status ?? null}
                    plan={plan}
                    cycle={subscription?.billing_cycle ?? 'monthly'}
                    trialEndsAt={subscription?.trial_ends_at ?? null}
                    currentPeriodEnd={subscription?.current_period_end ?? null}
                    cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
                    hasStripeSubscription={Boolean(subscription?.stripe_subscription_id)}
                    hasStripeCustomer={Boolean(subscription?.stripe_customer_id)}
                    isOwner={role === 'owner'}
                    paymentsEnabled={isStripeConfigured()}
                    justSubscribed={justSubscribed}
                    athletes={usage}
                />
            </div>
        </div>
    )
}
