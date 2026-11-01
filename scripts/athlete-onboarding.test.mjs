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

const ids = (result) => result.steps.map(step => step.id)
const currentId = (result) => result.steps[result.currentIndex]?.id ?? null

test('steps advance as each one is done or skipped', () => {
    const base = { state: {}, hasPushSubscription: false, hasAvatar: false, stravaConnected: false, form: 'pending', formMinutes: 9 }
    assert.deepEqual(ids(buildAthleteSteps(base)), ['tour', 'install', 'push', 'photo', 'watch', 'form'])
    assert.equal(currentId(buildAthleteSteps(base)), 'tour')
    assert.equal(currentId(buildAthleteSteps({ ...base, state: { tour: 'done' } })), 'install')
    assert.equal(currentId(buildAthleteSteps({ ...base, state: { tour: 'done', install: 'skipped' } })), 'push')
    assert.equal(currentId(buildAthleteSteps({ ...base, state: { tour: 'done', install: 'done' }, hasPushSubscription: true })), 'photo')
    assert.equal(currentId(buildAthleteSteps({ ...base, state: { tour: 'done', install: 'done', push: 'done', photo: 'skipped' } })), 'watch')
    const almost = buildAthleteSteps({ ...base, state: { tour: 'done', install: 'done', push: 'done', photo: 'done', watch: 'skipped' } })
    assert.equal(currentId(almost), 'form')
    assert.equal(almost.steps[almost.currentIndex].duration, '9 min')
    assert.equal(buildAthleteSteps({ ...base, state: { tour: 'done', install: 'done', push: 'done', photo: 'done' }, stravaConnected: true, form: 'completed' }).complete, true)
})

test('an existing photo resolves the photo step', () => {
    const steps = buildAthleteSteps({ state: { tour: 'done', install: 'done', push: 'done' }, hasPushSubscription: false, hasAvatar: true, stravaConnected: false, form: 'pending', formMinutes: 5 })
    assert.equal(currentId(steps), 'watch')
})

test('without an onboarding form the last step is already resolved', () => {
    const steps = buildAthleteSteps({ state: { tour: 'done', install: 'done', push: 'skipped', photo: 'skipped', watch: 'skipped' }, hasPushSubscription: false, hasAvatar: false, stravaConnected: false, form: 'none', formMinutes: 0 })
    assert.equal(steps.complete, true)
})

test('athletes who finished the welcome before the new steps are not sent back to it', () => {
    const before = { state: { guided: true, install: 'done', push: 'skipped', watch: 'skipped' }, hasPushSubscription: false, hasAvatar: false, stravaConnected: false, form: 'completed', formMinutes: 0 }
    assert.equal(buildAthleteSteps(before).complete, true)
    // A medias con los pasos de antes: sí ven los nuevos al seguir
    const halfway = buildAthleteSteps({ ...before, state: { guided: true, install: 'done' } })
    assert.equal(currentId(halfway), 'tour')
    assert.equal(halfway.steps.find(step => step.id === 'photo').resolved, false)
    // Con el formulario aún pendiente tampoco han terminado
    assert.equal(currentId(buildAthleteSteps({ ...before, form: 'pending' })), 'tour')
})
