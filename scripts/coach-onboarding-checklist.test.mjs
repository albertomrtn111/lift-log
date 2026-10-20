import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCoachChecklist } from '../src/lib/onboarding/checklist.js'

const base = {
    state: { guided: true },
    sampleClientId: 'lucia',
    firstRealClientId: null,
    realClientCount: 0,
    hasFirstPlan: false,
    aiProfileApproved: false,
}

test('new coach starts with the workspace step done and five steps', () => {
    const checklist = buildCoachChecklist(base)
    assert.equal(checklist.visible, true)
    assert.deepEqual(checklist.steps.map(step => step.id), ['workspace', 'sample', 'invite', 'plan', 'ai'])
    assert.equal(checklist.requiredDone, 1)
    assert.equal(checklist.requiredTotal, 4)
    assert.equal(checklist.steps.find(step => step.id === 'ai').optional, true)
})

test('plan step is blocked until there is a real athlete', () => {
    const blocked = buildCoachChecklist(base).steps.find(step => step.id === 'plan')
    assert.equal(blocked.href, null)
    assert.ok(blocked.blockedReason)

    const ready = buildCoachChecklist({ ...base, firstRealClientId: 'marta', realClientCount: 1 })
        .steps.find(step => step.id === 'plan')
    assert.match(ready.href, /client=marta&tab=plan/)
    assert.equal(ready.blockedReason, null)
})

test('checklist disappears once required steps are done, even without the optional AI step', () => {
    const checklist = buildCoachChecklist({
        ...base,
        state: { guided: true, sample_explored_at: '2026-10-16T10:00:00Z' },
        firstRealClientId: 'marta',
        realClientCount: 1,
        hasFirstPlan: true,
    })
    assert.equal(checklist.requiredDone, 4)
    assert.equal(checklist.progress, 1)
    assert.equal(checklist.visible, false)
})

test('deleting the sample athlete completes its step', () => {
    const step = buildCoachChecklist({ ...base, sampleClientId: null }).steps.find(s => s.id === 'sample')
    assert.equal(step.done, true)
})

test('dismissed checklist stays hidden', () => {
    const checklist = buildCoachChecklist({ ...base, state: { guided: true, checklist_dismissed_at: '2026-10-16' } })
    assert.equal(checklist.visible, false)
})

test('existing coaches only see it while they have no real athletes, without the sample step', () => {
    const empty = buildCoachChecklist({ ...base, state: {}, sampleClientId: null })
    assert.equal(empty.visible, true)
    assert.deepEqual(empty.steps.map(step => step.id), ['workspace', 'invite', 'plan', 'ai'])

    const withAthletes = buildCoachChecklist({ ...base, state: {}, sampleClientId: null, realClientCount: 3, firstRealClientId: 'a' })
    assert.equal(withAthletes.visible, false)
})
