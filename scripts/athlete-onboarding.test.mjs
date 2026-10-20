import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAthleteSteps, estimateFormSections, formatMinutes } from '../src/lib/onboarding/athlete-onboarding.js'

test('groups questions by section with an estimated time', () => {
    const sections = estimateFormSections([
        { type: 'date', section: 'Sobre ti' },
        { type: 'number' },
        { type: 'long_text', section: 'Objetivos' },
        { type: 'long_text' },
        { type: 'single_choice' },
        { type: 'photo_upload' },
    ])
    assert.deepEqual(sections, [
        { title: 'Sobre ti', questions: 2, minutes: 1 },
        { title: 'Objetivos', questions: 2 + 1, minutes: 2 },
        { title: 'Fotos', questions: 1, minutes: 1 },
    ])
})

test('forms without sections become a single block', () => {
    assert.deepEqual(estimateFormSections([{ type: 'short_text' }, { type: 'scale' }]), [{ title: 'Preguntas', questions: 2, minutes: 1 }])
    assert.deepEqual(estimateFormSections([]), [])
    assert.equal(formatMinutes(0), '1 min')
    assert.equal(formatMinutes(7), '7 min')
})

test('steps advance as each one is done or skipped', () => {
    const base = { state: {}, hasPushSubscription: false, stravaConnected: false, form: 'pending', formMinutes: 9 }
    assert.equal(buildAthleteSteps(base).currentIndex, 0)
    assert.equal(buildAthleteSteps({ ...base, state: { install: 'skipped' } }).currentIndex, 1)
    assert.equal(buildAthleteSteps({ ...base, state: { install: 'done' }, hasPushSubscription: true }).currentIndex, 2)
    const almost = buildAthleteSteps({ ...base, state: { install: 'done', push: 'done', watch: 'skipped' } })
    assert.equal(almost.steps[almost.currentIndex].id, 'form')
    assert.equal(almost.steps[3].duration, '9 min')
    assert.equal(buildAthleteSteps({ ...base, state: { install: 'done', push: 'done' }, stravaConnected: true, form: 'completed' }).complete, true)
})

test('without an onboarding form the last step is already resolved', () => {
    const steps = buildAthleteSteps({ state: { install: 'done', push: 'skipped', watch: 'skipped' }, hasPushSubscription: false, stravaConnected: false, form: 'none', formMinutes: 0 })
    assert.equal(steps.complete, true)
})
