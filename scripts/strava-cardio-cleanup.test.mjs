import assert from 'node:assert/strict'
import test from 'node:test'

import { buildStravaCardioPrivacyReset } from '../src/lib/strava/cardio-cleanup.js'

test('buildStravaCardioPrivacyReset clears imported activity data from a planned session', () => {
  assert.deepEqual(buildStravaCardioPrivacyReset(), {
    actual_distance_km: null,
    actual_duration_min: null,
    actual_avg_pace: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    rpe: null,
    feedback_notes: null,
    is_completed: false,
    performed_date: null,
    source_provider: null,
    provider_activity_id: null,
    strava_activity_id: null,
    source_payload: null,
  })
})
