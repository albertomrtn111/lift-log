import assert from 'node:assert/strict'
import test from 'node:test'

import { environmentForPath, spaceEnvironment } from '../src/lib/coach/environment-rules.js'

test('Sala pages are the Sala environment', () => {
  assert.equal(environmentForPath('/coach/sala', 'online'), 'sala')
  assert.equal(environmentForPath('/coach/sala/videos', 'online'), 'sala')
  assert.equal(environmentForPath('/coach/sala-inicio', 'online'), 'sala')
})

test('online pages are the Online environment', () => {
  assert.equal(environmentForPath('/coach/dashboard', 'sala'), 'online')
  assert.equal(environmentForPath('/coach/templates', 'sala'), 'online')
  assert.equal(environmentForPath('/coach/salary', 'online'), 'online')
})

test('shared pages keep the environment you came from', () => {
  assert.equal(environmentForPath('/coach/messages', 'sala'), 'sala')
  assert.equal(environmentForPath('/coach/settings', 'online'), 'online')
  assert.equal(environmentForPath('/coach/members/abc', 'sala'), 'sala')
})

test('a space only sees the switch when it has both', () => {
  assert.deepEqual(spaceEnvironment({ studio: false, online: true, saved: 'sala' }), { environment: 'online', canSwitch: false })
  assert.deepEqual(spaceEnvironment({ studio: true, online: false, saved: 'online' }), { environment: 'sala', canSwitch: false })
  assert.deepEqual(spaceEnvironment({ studio: true, online: true, saved: 'sala' }), { environment: 'sala', canSwitch: true })
  assert.deepEqual(spaceEnvironment({ studio: true, online: true, saved: null }), { environment: 'online', canSwitch: true })
})
