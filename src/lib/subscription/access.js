/**
 * Suscripción del coach a NexTrain: prueba gratis, acceso y planes de Stripe.
 * Lógica pura (testeada en scripts/), compartida por el middleware y el servidor.
 *
 * @typedef {'starter' | 'pro' | 'studio' | 'concierge'} SubscriptionTier
 * @typedef {'monthly' | 'yearly'} SubscriptionCycle
 *
 * @typedef {{
 *   status: string
 *   trial_ends_at: string | null
 *   stripe_subscription_id?: string | null
 *   current_period_end?: string | null
 *   cancel_at_period_end?: boolean | null
 * }} SubscriptionRow
 *
 * @typedef {'comped' | 'trial' | 'active' | 'past_due' | 'trial_ended' | 'inactive' | 'missing'} AccessState
 *
 * @typedef {{ allowed: boolean, state: AccessState, trialDaysLeft: number | null }} SubscriptionAccess
 */

/** Días de prueba gratis desde el alta */
export const TRIAL_DAYS = 30

/** Plan con el que se prueba la app, sea cual sea el elegido al registrarse */
export const TRIAL_TIER = 'pro'

/** Plan que se puede pagar con Stripe (Concierge se contrata hablando con ventas) */
export const PAID_TIERS = /** @type {const} */ (['starter', 'pro', 'studio'])

/** Stripe exige que el trial_end de Checkout esté al menos 48 h en el futuro */
const MIN_CHECKOUT_TRIAL_MS = 49 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Días de prueba que quedan, redondeando hacia arriba (queda "1 día" hasta el final).
 * @param {string | null} trialEndsAt
 * @param {Date} now
 */
export function daysLeft(trialEndsAt, now = new Date()) {
    if (!trialEndsAt) return null
    const ms = new Date(trialEndsAt).getTime() - now.getTime()
    return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS)
}

/**
 * ¿Puede el coach usar su espacio? Sin fila de suscripción no hay acceso:
 * los espacios anteriores a la prueba están dados de alta como `comped`.
 * @param {SubscriptionRow | null | undefined} sub
 * @param {Date} now
 * @returns {SubscriptionAccess}
 */
export function subscriptionAccess(sub, now = new Date()) {
    if (!sub) return { allowed: false, state: 'missing', trialDaysLeft: null }

    switch (sub.status) {
        case 'comped':
            return { allowed: true, state: 'comped', trialDaysLeft: null }
        case 'trialing': {
            const left = daysLeft(sub.trial_ends_at, now)
            // Con suscripción en Stripe, Stripe decide cuándo acaba la prueba
            if (sub.stripe_subscription_id) return { allowed: true, state: 'trial', trialDaysLeft: left }
            if (left !== null && left > 0) return { allowed: true, state: 'trial', trialDaysLeft: left }
            return { allowed: false, state: 'trial_ended', trialDaysLeft: 0 }
        }
        case 'active':
            return { allowed: true, state: 'active', trialDaysLeft: null }
        case 'past_due':
            // Stripe reintenta el cobro unos días: no cortamos el acceso mientras tanto
            return { allowed: true, state: 'past_due', trialDaysLeft: null }
        default:
            return { allowed: false, state: 'inactive', trialDaysLeft: null }
    }
}

/**
 * ¿Alguna de las suscripciones (una por espacio del usuario) da acceso?
 * @param {SubscriptionRow[] | null | undefined} rows
 * @param {Date} now
 */
export function anySubscriptionAllows(rows, now = new Date()) {
    return (rows ?? []).some(row => subscriptionAccess(row, now).allowed)
}

/**
 * Fin de la prueba que se pasa a Stripe Checkout para no cobrar antes de que acabe
 * la prueba gratis. Si quedan menos de 48 h (mínimo de Stripe) o ya acabó, se cobra al momento.
 * @param {string | null} trialEndsAt
 * @param {Date} now
 * @returns {number | null} segundos Unix
 */
export function checkoutTrialEnd(trialEndsAt, now = new Date()) {
    if (!trialEndsAt) return null
    const end = new Date(trialEndsAt).getTime()
    if (!Number.isFinite(end) || end - now.getTime() < MIN_CHECKOUT_TRIAL_MS) return null
    return Math.floor(end / 1000)
}

/**
 * Clave del precio en Stripe (lookup_key) para un plan y periodicidad.
 * @param {SubscriptionTier} tier
 * @param {SubscriptionCycle} cycle
 */
export function priceLookupKey(tier, cycle) {
    return `nextrain_${tier}_${cycle}`
}

/**
 * Plan y periodicidad a partir del lookup_key de un precio de Stripe.
 * @param {string | null | undefined} lookupKey
 * @returns {{ tier: 'starter' | 'pro' | 'studio', cycle: SubscriptionCycle } | null}
 */
export function parsePriceLookupKey(lookupKey) {
    const match = /^nextrain_(starter|pro|studio)_(monthly|yearly)$/.exec(lookupKey ?? '')
    if (!match) return null
    return { tier: /** @type {'starter' | 'pro' | 'studio'} */ (match[1]), cycle: /** @type {SubscriptionCycle} */ (match[2]) }
}

/**
 * Plan con el que trabaja el espacio (y que fija su límite de atletas).
 * Mientras dura la prueba, aunque ya haya elegido plan en Stripe, sigue con Pro.
 * @param {string} status estado en Stripe
 * @param {SubscriptionTier} paidTier
 * @returns {SubscriptionTier | null} null = no cambiar
 */
export function effectiveTier(status, paidTier) {
    if (status === 'trialing') return TRIAL_TIER
    if (status === 'active' || status === 'past_due') return paidTier
    return null
}

/**
 * Estados de Stripe que se guardan tal cual en coach_subscriptions.status
 * @param {string} status
 */
export function normalizeStripeStatus(status) {
    const known = ['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']
    return known.includes(status) ? status : 'incomplete'
}

/**
 * ¿El error de Supabase es el del límite de atletas del plan?
 * @param {{ hint?: string | null } | null | undefined} error
 */
export function isAthleteLimitError(error) {
    return error?.hint === 'athlete_limit'
}
