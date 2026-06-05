import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStravaActivityImportedNotification } from '../src/lib/notifications/strava-activity.js'

test('builds the in-app and push payload for an imported Strava activity', () => {
  const payload = buildStravaActivityImportedNotification(' Evening Ride ', '18774786691')

  assert.deepEqual(payload, {
    title: 'Actividad importada',
    body: 'Ya puedes ver tu actividad Evening Ride y completar RPE/notas.',
    url: '/progress',
    tag: 'strava-activity-18774786691',
    type: 'general',
  })
})

test('uses a fallback name when Strava does not send one', () => {
  const payload = buildStravaActivityImportedNotification('', 42)

  assert.equal(payload.body, 'Ya puedes ver tu actividad y completar RPE/notas.')
  assert.equal(payload.tag, 'strava-activity-42')
})
