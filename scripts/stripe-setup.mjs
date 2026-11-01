#!/usr/bin/env node
/**
 * Crea en Stripe lo que necesita la suscripción de los coaches (docs/suscripcion-coach.md):
 * productos y precios con lookup_key, el IVA del 21 % (precios sin IVA) y la
 * configuración del Customer Portal. Idempotente: lo que ya existe no se duplica.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs --live
 */
import Stripe from 'stripe'

const PLANS = [
    { tier: 'starter', name: 'NexTrain Starter', monthly: 29, yearly: 290, athletes: 20 },
    { tier: 'pro', name: 'NexTrain Pro', monthly: 79, yearly: 790, athletes: 75 },
    { tier: 'studio', name: 'NexTrain Studio', monthly: 199, yearly: 1990, athletes: 250 },
]

const key = process.env.STRIPE_SECRET_KEY?.trim()
if (!key) {
    console.error('Falta STRIPE_SECRET_KEY')
    process.exit(1)
}
const live = key.startsWith('sk_live_') || key.startsWith('rk_live_')
if (live && !process.argv.includes('--live')) {
    console.error('Es una clave live: repite con --live si de verdad quieres configurar el modo real.')
    process.exit(1)
}
const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://nexttrain.ascenttech.cloud').replace(/\/$/, '')
const stripe = new Stripe(key)

console.log(`Stripe en modo ${live ? 'LIVE' : 'test'}\n`)

// 1. Productos y precios (EUR, IVA aparte)
const priceIds = []
for (const plan of PLANS) {
    const lookupKeys = [`nextrain_${plan.tier}_monthly`, `nextrain_${plan.tier}_yearly`]
    const { data: existing } = await stripe.prices.list({ lookup_keys: lookupKeys, active: true, expand: ['data.product'] })

    let productId = existing[0] && (typeof existing[0].product === 'string' ? existing[0].product : existing[0].product.id)
    if (!productId) {
        const { data: products } = await stripe.products.search({ query: `metadata['nextrain_tier']:'${plan.tier}'` })
        productId = products[0]?.id
    }
    if (!productId) {
        const product = await stripe.products.create({
            name: plan.name,
            description: `Hasta ${plan.athletes} atletas activos`,
            metadata: { nextrain_tier: plan.tier },
        })
        productId = product.id
        console.log(`+ producto ${plan.name} (${productId})`)
    }

    for (const [cycle, amount, interval] of [['monthly', plan.monthly, 'month'], ['yearly', plan.yearly, 'year']]) {
        const lookupKey = `nextrain_${plan.tier}_${cycle}`
        let price = existing.find(item => item.lookup_key === lookupKey)
        if (!price) {
            price = await stripe.prices.create({
                product: productId,
                currency: 'eur',
                unit_amount: amount * 100,
                recurring: { interval },
                tax_behavior: 'exclusive',
                lookup_key: lookupKey,
                nickname: `${plan.name} ${cycle === 'monthly' ? 'mensual' : 'anual'}`,
            })
            console.log(`+ precio ${lookupKey}: ${amount} €/${interval} + IVA (${price.id})`)
        } else {
            console.log(`= precio ${lookupKey} (${price.id})`)
        }
        priceIds.push({ productId, priceId: price.id })
    }
}

// 2. IVA 21 % (solo si no se usa Stripe Tax)
const { data: taxRates } = await stripe.taxRates.list({ active: true, limit: 100 })
let taxRate = taxRates.find(rate => rate.metadata?.nextrain === 'iva21')
if (!taxRate) {
    taxRate = await stripe.taxRates.create({
        display_name: 'IVA',
        description: 'IVA 21 % España',
        jurisdiction: 'ES',
        country: 'ES',
        percentage: 21,
        inclusive: false,
        tax_type: 'vat',
        metadata: { nextrain: 'iva21' },
    })
    console.log(`+ IVA 21 % (${taxRate.id})`)
} else {
    console.log(`= IVA 21 % (${taxRate.id})`)
}

// 3. Customer Portal: tarjeta, facturas, datos fiscales, cambio de plan y cancelación al final del periodo
const products = Object.values(priceIds.reduce((acc, { productId, priceId }) => {
    acc[productId] ??= { product: productId, prices: [] }
    acc[productId].prices.push(priceId)
    return acc
}, {}))
const portalConfig = {
    business_profile: { headline: 'NexTrain · gestiona tu suscripción' },
    default_return_url: `${appUrl}/coach/subscription`,
    features: {
        customer_update: { enabled: true, allowed_updates: ['address', 'name', 'tax_id', 'email'] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
        subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products },
    },
    metadata: { nextrain: 'portal' },
}
const { data: configurations } = await stripe.billingPortal.configurations.list({ limit: 100 })
const existingPortal = configurations.find(config => config.metadata?.nextrain === 'portal')
    ?? configurations.find(config => config.is_default)
if (existingPortal) {
    await stripe.billingPortal.configurations.update(existingPortal.id, portalConfig)
    console.log(`= Customer Portal actualizado (${existingPortal.id})`)
} else {
    const created = await stripe.billingPortal.configurations.create(portalConfig)
    console.log(`+ Customer Portal (${created.id})`)
}

console.log(`
Listo. Variables para el .env (local y servidor):
  STRIPE_SECRET_KEY=${live ? 'sk_live_…' : 'sk_test_…'}
  STRIPE_TAX_RATE_ID=${taxRate.id}
  STRIPE_AUTOMATIC_TAX=false
  STRIPE_WEBHOOK_SECRET=whsec_…  (del endpoint ${appUrl}/api/stripe/webhook, o de \`stripe listen\` en local)
`)
