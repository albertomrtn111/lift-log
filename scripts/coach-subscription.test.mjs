import assert from 'node:assert/strict'
import test from 'node:test'

import {
    anySubscriptionAllows,
    checkoutTrialEnd,
    daysLeft,
    effectiveTier,
    isAthleteLimitError,
    normalizeStripeStatus,
    parsePriceLookupKey,
    priceLookupKey,
    subscriptionAccess,
} from '../src/lib/subscription/access.js'

const NOW = new Date('2026-11-01T10:00:00Z')
const inDays = days => new Date(NOW.getTime() + days * 86400000).toISOString()

test('la prueba gratis da acceso hasta su fecha de fin', () => {
    const sub = { status: 'trialing', trial_ends_at: inDays(30), stripe_subscription_id: null }
    assert.deepEqual(subscriptionAccess(sub, NOW), { allowed: true, state: 'trial', trialDaysLeft: 30 })
    assert.equal(subscriptionAccess({ ...sub, trial_ends_at: inDays(0.2) }, NOW).trialDaysLeft, 1)
})

test('la prueba gratis sin pagar bloquea al terminar', () => {
    const sub = { status: 'trialing', trial_ends_at: inDays(-0.01), stripe_subscription_id: null }
    assert.deepEqual(subscriptionAccess(sub, NOW), { allowed: false, state: 'trial_ended', trialDaysLeft: 0 })
})

test('con suscripción en Stripe, el trialing lo decide Stripe', () => {
    const sub = { status: 'trialing', trial_ends_at: inDays(-1), stripe_subscription_id: 'sub_1' }
    assert.equal(subscriptionAccess(sub, NOW).allowed, true)
})

test('comped, active y past_due dan acceso; el resto no', () => {
    for (const status of ['comped', 'active', 'past_due']) {
        assert.equal(subscriptionAccess({ status, trial_ends_at: null }, NOW).allowed, true, status)
    }
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
        assert.deepEqual(subscriptionAccess({ status, trial_ends_at: null }, NOW), { allowed: false, state: 'inactive', trialDaysLeft: null })
    }
    assert.equal(subscriptionAccess(null, NOW).state, 'missing')
})

test('basta con que un espacio del usuario tenga acceso', () => {
    assert.equal(anySubscriptionAllows([{ status: 'canceled', trial_ends_at: null }, { status: 'active', trial_ends_at: null }], NOW), true)
    assert.equal(anySubscriptionAllows([], NOW), false)
    assert.equal(anySubscriptionAllows(null, NOW), false)
})

test('Checkout respeta los días de prueba que quedan si son 48 h o más', () => {
    assert.equal(checkoutTrialEnd(inDays(10), NOW), Math.floor(new Date(inDays(10)).getTime() / 1000))
    assert.equal(checkoutTrialEnd(inDays(1.9), NOW), null)
    assert.equal(checkoutTrialEnd(inDays(-3), NOW), null)
    assert.equal(checkoutTrialEnd(null, NOW), null)
})

test('lookup_key de los precios', () => {
    assert.equal(priceLookupKey('pro', 'yearly'), 'nextrain_pro_yearly')
    assert.deepEqual(parsePriceLookupKey('nextrain_starter_monthly'), { tier: 'starter', cycle: 'monthly' })
    assert.equal(parsePriceLookupKey('nextrain_concierge_monthly'), null)
    assert.equal(parsePriceLookupKey(null), null)
})

test('durante la prueba se trabaja con Pro; al pagar, con el plan pagado', () => {
    assert.equal(effectiveTier('trialing', 'starter'), 'pro')
    assert.equal(effectiveTier('active', 'starter'), 'starter')
    assert.equal(effectiveTier('past_due', 'studio'), 'studio')
    assert.equal(effectiveTier('canceled', 'studio'), null)
})

test('estados de Stripe y error del límite', () => {
    assert.equal(normalizeStripeStatus('past_due'), 'past_due')
    assert.equal(normalizeStripeStatus('algo_nuevo'), 'incomplete')
    assert.equal(isAthleteLimitError({ hint: 'athlete_limit' }), true)
    assert.equal(isAthleteLimitError({ hint: null }), false)
    assert.equal(daysLeft(null, NOW), null)
})
