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

/**
 * @typedef {'trial_week' | 'trial_day' | 'trial_ended'} TrialNoticeKind
 */

/**
 * Aviso por email que toca mandar hoy sobre la prueba gratis (el cron diario lo
 * comprueba una vez al día). Solo para la prueba sin plan elegido: si ya tiene
 * suscripción en Stripe, el aviso lo manda Stripe.
 *  - trial_week: quedan 7 días o menos
 *  - trial_day: quedan 48 h o menos (así llega con un día de margen aunque el cron sea a las 9:00)
 *  - trial_ended: terminó hace menos de 3 días
 * @param {SubscriptionRow | null | undefined} sub
 * @param {Date} now
 * @returns {TrialNoticeKind | null}
 */
export function trialNoticeKind(sub, now = new Date()) {
    if (!sub || sub.status !== 'trialing' || sub.stripe_subscription_id || !sub.trial_ends_at) return null
    const ms = new Date(sub.trial_ends_at).getTime() - now.getTime()
    if (!Number.isFinite(ms)) return null
    if (ms <= 0) return ms > -3 * DAY_MS ? 'trial_ended' : null
    if (ms <= 2 * DAY_MS) return 'trial_day'
    if (ms <= 7 * DAY_MS) return 'trial_week'
    return null
}

/**
 * Texto del email de aviso de la prueba. Sin HTML: lo maqueta el mailer.
 * @param {{ kind: TrialNoticeKind, trialEndsAt: string, firstName?: string | null, timeZone?: string, now?: Date }} params
 * @returns {{ subject: string, title: string, paragraphs: string[], cta: string }}
 */
export function trialNoticeCopy({ kind, trialEndsAt, firstName, timeZone = 'Europe/Madrid', now = new Date() }) {
    // «domingo 8 de noviembre» (Intl pone una coma tras el día de la semana)
    const end = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date(trialEndsAt)).replace(',', '')
    const hello = firstName ? `Hola, ${firstName}:` : 'Hola:'
    const plans = 'Los planes empiezan en 29 €/mes + IVA (Starter, hasta 20 atletas) y puedes cambiar o cancelar cuando quieras.'

    if (kind === 'trial_ended') {
        return {
            subject: 'Tu prueba gratis de NexTrain ha terminado',
            title: 'Tu prueba gratis ha terminado',
            paragraphs: [
                hello,
                'Tu prueba de 30 días de NexTrain ha terminado. Tus datos y los de tus atletas siguen guardados, y ellos pueden seguir usando su app.',
                `Elige un plan para volver a tu panel justo donde lo dejaste. ${plans}`,
            ],
            cta: 'Elegir plan',
        }
    }
    if (kind === 'trial_day') {
        return {
            subject: `Tu prueba gratis de NexTrain termina el ${end}`,
            title: `Tu prueba termina el ${end}`,
            paragraphs: [
                hello,
                `Tu prueba gratis de NexTrain con todo Pro termina el ${end}. Si eliges plan antes, no pierdes ni un día: el primer cobro es cuando acaba la prueba.`,
                `Si no eliges plan, tu panel quedará en pausa (no se borra nada). ${plans}`,
            ],
            cta: 'Elegir plan',
        }
    }
    const left = daysLeft(trialEndsAt, now) ?? 7
    return {
        subject: `Te quedan ${left} días de prueba gratis en NexTrain`,
        title: `Te quedan ${left} días de prueba gratis`,
        paragraphs: [
            hello,
            `Tu prueba de NexTrain con todo Pro termina el ${end}. Puedes elegir plan ya: guardas la tarjeta y no se te cobra nada hasta que acabe la prueba.`,
            plans,
        ],
        cta: 'Elegir plan',
    }
}
