import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mapStravaSportToDiscipline,
  shouldImportStravaActivity,
} from '../src/lib/strava/sport-mapping.js'

test('mapStravaSportToDiscipline maps endurance sports to app disciplines', () => {
  assert.equal(mapStravaSportToDiscipline({ sport_type: 'Ride', type: 'Ride' }), 'Bicicleta')
  assert.equal(mapStravaSportToDiscipline({ sport_type: 'MountainBikeRide', type: 'Ride' }), 'Bicicleta')
  assert.equal(mapStravaSportToDiscipline({ sport_type: 'Swim', type: 'Swim' }), 'Natación')
  assert.equal(mapStravaSportToDiscipline({ sport_type: 'Run', type: 'Run' }), 'Running')
})

test('shouldImportStravaActivity excludes strength and gym-style activities', () => {
  assert.equal(shouldImportStravaActivity({ sport_type: 'WeightTraining', type: 'WeightTraining' }), false)
  assert.equal(shouldImportStravaActivity({ sport_type: 'Workout', type: 'Workout' }), false)
  assert.equal(shouldImportStravaActivity({ sport_type: 'Crossfit', type: 'Crossfit' }), false)
  assert.equal(shouldImportStravaActivity({ sport_type: 'Ride', type: 'Ride' }), true)
})

test('shouldImportStravaActivity excludes walk and hike activities', () => {
  assert.equal(shouldImportStravaActivity({ sport_type: 'Walk', type: 'Walk' }), false)
  assert.equal(shouldImportStravaActivity({ sport_type: 'Hike', type: 'Hike' }), false)
})
