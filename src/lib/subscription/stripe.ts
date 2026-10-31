import 'server-only'

import Stripe from 'stripe'

let client: Stripe | null = null

/** Cliente de Stripe, o null si STRIPE_SECRET_KEY no está configurada */
export function getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY?.trim()
    if (!key) return null
    if (!client) client = new Stripe(key, { appInfo: { name: 'NexTrain' } })
    return client
}

export function isStripeConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

/**
 * IVA aparte: Stripe Tax si STRIPE_AUTOMATIC_TAX=true; si no, el Tax Rate fijo
 * de STRIPE_TAX_RATE_ID (IVA 21 %, lo crea scripts/stripe-setup.mjs).
 */
export function stripeTaxConfig() {
    const automatic = process.env.STRIPE_AUTOMATIC_TAX?.trim() === 'true'
    const taxRateId = process.env.STRIPE_TAX_RATE_ID?.trim() || null
    return { automatic, taxRateIds: automatic || !taxRateId ? [] : [taxRateId] }
}
