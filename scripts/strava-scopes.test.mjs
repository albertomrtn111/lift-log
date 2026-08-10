import assert from 'node:assert/strict'
import {
  hasRequiredStravaActivityScope,
  parseStravaScopes,
} from '../src/lib/strava/scopes.js'

assert.deepEqual(parseStravaScopes('read,activity:read_all'), ['read', 'activity:read_all'])
assert.deepEqual(parseStravaScopes('read activity:read_all activity:read_all'), ['read', 'activity:read_all'])
assert.equal(hasRequiredStravaActivityScope('read'), false)
assert.equal(hasRequiredStravaActivityScope(null), false)
assert.equal(hasRequiredStravaActivityScope('read,activity:read_all'), true)

console.log('strava scope tests passed')
