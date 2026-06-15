import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeCardioSessionExecution } from '../src/lib/cardio/analysis.js'

function buildOneMinuteStreams(minutes) {
  const data = Array.from({ length: minutes + 1 }, (_, index) => index)
  return {
    time: { data: data.map((minute) => minute * 60) },
    distance: { data: data.map((minute) => minute * 200) },
    heartrate: { data: data.map((minute) => 140 + minute) },
    velocity_smooth: { data: data.map(() => 3.33) },
  }
}

test('analyzeCardioSessionExecution slices structured intervals from streams', () => {
  const result = analyzeCardioSessionExecution({
    structure: {
      mode: 'structured',
      blocks: [
        { id: 'warmup', type: 'warmup', label: 'Calentamiento', duration: 10, targetPace: 'suave' },
        { id: 'main', type: 'intervals', sets: 2, workDistance: 1, workTargetPace: '4:15/km', restDuration: 2 },
        { id: 'cooldown', type: 'cooldown', label: 'Vuelta calma', duration: 5, targetPace: 'suave' },
      ],
    },
    streams: buildOneMinuteStreams(30),
    laps: [],
    session: { actualDistanceKm: 6, actualDurationMin: 30, actualAvgPace: '5:00/km' },
  })

  assert.equal(result.source, 'streams')
  assert.equal(result.chartAxis, 'distance')
  assert.deepEqual(result.segments.map((segment) => segment.label), [
    'Calentamiento',
    'Serie 1',
    'Rec 1',
    'Serie 2',
    'Rec 2',
    'Vuelta calma',
  ])
  assert.deepEqual(result.segments.map((segment) => segment.kind), [
    'warmup',
    'work',
    'recovery',
    'work',
    'recovery',
    'cooldown',
  ])
  assert.equal(result.segments[0].actualDurationSec, 600)
  assert.equal(result.segments[1].actualDistanceMeters, 1000)
  assert.equal(result.segments[2].actualDurationSec, 120)
  assert.equal(result.segments[1].avgPaceSecondsPerKm, 300)
  assert.equal(result.segments[1].avgHeartRate, 153)
  assert.equal(result.segments[1].maxHeartRate, 155)
  assert.ok(result.chartPoints.length > 0)
  assert.deepEqual(Object.keys(result.chartPoints[0]), ['x', 'distanceKm', 'timeMin', 'paceSecondsPerKm', 'heartRate'])
})

test('analyzeCardioSessionExecution uses time axis for duration-only plans', () => {
  const result = analyzeCardioSessionExecution({
    structure: {
      mode: 'structured',
      blocks: [{ id: 'steady', type: 'continuous', duration: 20, targetPace: 'Z2' }],
    },
    streams: buildOneMinuteStreams(20),
    laps: [],
    session: { actualDistanceKm: 4, actualDurationMin: 20 },
  })

  assert.equal(result.chartAxis, 'time')
  assert.equal(result.segments[0].kind, 'steady')
  assert.equal(result.segments[0].label, 'Continuo')
  assert.equal(result.segments[0].actualDurationSec, 1200)
})

test('analyzeCardioSessionExecution falls back to Strava laps when streams are missing', () => {
  const result = analyzeCardioSessionExecution({
    structure: {
      mode: 'structured',
      blocks: [{ id: 'steady', type: 'continuous', distance: 1 }],
    },
    streams: null,
    laps: [
      {
        lap_index: 1,
        name: 'Lap 1',
        distance_meters: 1000,
        moving_time_seconds: 270,
        avg_pace_seconds_per_km: 270,
        avg_heartrate: 150,
        max_heartrate: 165,
      },
    ],
    session: { actualDistanceKm: 1, actualDurationMin: 4.5 },
  })

  assert.equal(result.source, 'laps')
  assert.equal(result.segments[0].label, 'Lap 1')
  assert.equal(result.segments[0].avgPaceSecondsPerKm, 270)
})

test('analyzeCardioSessionExecution falls back to whole activity without streams or laps', () => {
  const result = analyzeCardioSessionExecution({
    structure: null,
    streams: null,
    laps: [],
    session: {
      actualDistanceKm: 10,
      actualDurationMin: 50,
      actualAvgPace: '5:00/km',
      avgHeartRate: 145,
      maxHeartRate: 172,
    },
  })

  assert.equal(result.source, 'summary')
  assert.equal(result.segments.length, 1)
  assert.equal(result.segments[0].label, 'Actividad completa')
  assert.equal(result.segments[0].actualDistanceMeters, 10000)
  assert.equal(result.segments[0].avgHeartRate, 145)
})
