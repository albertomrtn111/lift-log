import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_MODULES, athleteHome, athleteModules, athleteTabs } from '../src/lib/athlete/module-rules.js'

test('without data nothing is limited', () => {
  assert.deepEqual(athleteModules(null), ALL_MODULES)
  assert.deepEqual(athleteModules(undefined), ALL_MODULES)
})

test('an online athlete keeps the same tabs', () => {
  assert.deepEqual(athleteTabs(ALL_MODULES), ['routine', 'diet', 'planning', 'summary', 'chat'])
  assert.equal(athleteHome(ALL_MODULES), '/routine')
})

test('a room client without online training gets the light app', () => {
  const modules = athleteModules({ sessions: true, routine: false, diet: false, chat: false })
  assert.deepEqual(athleteTabs(modules), ['sessions', 'planning', 'summary'])
  assert.equal(athleteHome(modules), '/sesiones')
})

test('a hybrid client sees both', () => {
  const modules = athleteModules({ sessions: true, chat: false })
  assert.deepEqual(athleteTabs(modules), ['routine', 'sessions', 'diet', 'planning', 'summary'])
  assert.equal(athleteHome(modules), '/routine')
})
