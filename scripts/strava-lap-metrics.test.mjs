import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateStravaLapMetrics } from '../src/lib/strava/lap-metrics.js'

test('calculateStravaLapMetrics computes heart rate and pace metrics per lap', () => {
  const laps = [
    {
      id: 101,
      name: 'Lap 1',
      lap_index: 1,
      start_index: 0,
      end_index: 2,
      distance: 1000,
      moving_time: 240,
      elapsed_time: 245,
      average_speed: 4.16,
      max_speed: 4.8,
      total_elevation_gain: 4,
    },
    {
      id: 102,
      name: 'Lap 2',
      lap_index: 2,
      start_index: 3,
      end_index: 5,
      distance: 500,
      moving_time: 110,
      elapsed_time: 112,
      average_speed: 4.54,
      max_speed: 5.2,
      total_elevation_gain: 1,
    },
  ]

  const streams = {
    time: { data: [0, 120, 240, 250, 300, 360] },
    distance: { data: [0, 500, 1000, 1050, 1250, 1500] },
    heartrate: { data: [140, 150, 160, 155, 165, 175] },
    velocity_smooth: { data: [4, 4.2, 4.4, 4.5, 4.6, 4.7] },
    cadence: { data: [82, 84, 86, 88, 90, 92] },
    watts: { data: [240, 250, 260, 270, 280, 290] },
  }

  const result = calculateStravaLapMetrics(laps, streams)

  assert.deepEqual(result.map((lap) => ({
    provider_lap_id: lap.provider_lap_id,
    lap_index: lap.lap_index,
    start_index: lap.start_index,
    end_index: lap.end_index,
    distance_meters: lap.distance_meters,
    moving_time_seconds: lap.moving_time_seconds,
    avg_pace_seconds_per_km: lap.avg_pace_seconds_per_km,
    avg_heartrate: lap.avg_heartrate,
    start_heartrate: lap.start_heartrate,
    end_heartrate: lap.end_heartrate,
    max_heartrate: lap.max_heartrate,
    avg_cadence: lap.avg_cadence,
    avg_watts: lap.avg_watts,
  })), [
    {
      provider_lap_id: '101',
      lap_index: 1,
      start_index: 0,
      end_index: 2,
      distance_meters: 1000,
      moving_time_seconds: 240,
      avg_pace_seconds_per_km: 240,
      avg_heartrate: 150,
      start_heartrate: 140,
      end_heartrate: 160,
      max_heartrate: 160,
      avg_cadence: 84,
      avg_watts: 250,
    },
    {
      provider_lap_id: '102',
      lap_index: 2,
      start_index: 3,
      end_index: 5,
      distance_meters: 500,
      moving_time_seconds: 110,
      avg_pace_seconds_per_km: 220,
      avg_heartrate: 165,
      start_heartrate: 155,
      end_heartrate: 175,
      max_heartrate: 175,
      avg_cadence: 90,
      avg_watts: 280,
    },
  ])
})
