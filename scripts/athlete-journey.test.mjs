import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAthleteJourney, onboardingStateFromCheckins } from '../src/lib/onboarding/athlete-journey.js'

const base = { invitedAt: null, signedUpAt: null, acceptedAt: null, hasPushSubscription: false, onboarding: 'pending' }

test('just invited: one of four steps and the invite can be resent', () => {
    const journey = buildAthleteJourney({ ...base, invitedAt: '2026-10-16T10:00:00Z' })
    assert.equal(journey.done, 1)
    assert.equal(journey.total, 4)
    assert.equal(journey.canResend, true)
    assert.equal(journey.complete, false)
})

test('once the account exists the invite counts as sent and cannot be resent', () => {
    const journey = buildAthleteJourney({ ...base, signedUpAt: '2026-10-16T10:00:00Z' })
    assert.deepEqual(journey.steps.map(step => step.done), [true, true, false, false])
    assert.equal(journey.canResend, false)
})

test('without onboarding that step is skipped', () => {
    const journey = buildAthleteJourney({ ...base, invitedAt: 'x', acceptedAt: 'y', hasPushSubscription: true, onboarding: 'none' })
    assert.equal(journey.total, 3)
    assert.equal(journey.complete, true)
    assert.equal(journey.steps.at(-1).label, 'Sin onboarding')
})

test('onboarding state from checkins', () => {
    assert.equal(onboardingStateFromCheckins([]), 'none')
    assert.equal(onboardingStateFromCheckins([{ status: 'pending' }]), 'pending')
    assert.equal(onboardingStateFromCheckins([{ status: 'archived' }, { status: 'reviewed' }]), 'completed')
    assert.equal(onboardingStateFromCheckins([{ status: 'archived' }, { status: 'pending' }]), 'pending')
})
