import assert from 'node:assert/strict'
import { registerHistoryTools } from './history.ts'
import { outputSchemas } from './output-schemas.ts'

const client = '11111111-1111-4111-8111-111111111111'
const coach = '22222222-2222-4222-8222-222222222222'

function cardioFixture() {
  const tables: Record<string, any[]> = {
    cardio_sessions: [
      // Bici importada de Strava y enlazada por strava_activity_id: 42,5 km en 109 min
      { id: 'ride-session', coach_id: coach, client_id: client, scheduled_date: '2026-10-02', performed_date: '2026-10-02T16:00:00Z',
        name: 'Afternoon Ride', activity_type: 'Bicicleta', training_type: 'Ride', is_completed: true,
        actual_distance_km: 42.5, actual_duration_min: 109, actual_avg_pace: '23,4 km/h', avg_heart_rate: 140, max_heart_rate: 170,
        rpe: 6, feedback_notes: null, source_provider: 'strava', provider_activity_id: '9001', strava_activity_id: 'strava-ride',
        planned_structure: null, source_laps: null, source_elevation: 300 },
      // Dato antiguo: una bici que se guardó con ritmo por km
      { id: 'old-ride', coach_id: coach, client_id: client, scheduled_date: '2026-06-07', performed_date: null,
        name: 'Afternoon Ride', activity_type: 'Bicicleta', training_type: 'Ride', is_completed: true,
        actual_distance_km: 30, actual_duration_min: 75, actual_avg_pace: '2:30/km', avg_heart_rate: null, max_heart_rate: null,
        rpe: null, feedback_notes: null, source_provider: 'strava', provider_activity_id: null, strava_activity_id: null,
        planned_structure: null, source_laps: null, source_elevation: null },
      // Carrera enlazada solo por provider_activity_id
      { id: 'run-session', coach_id: coach, client_id: client, scheduled_date: '2026-10-05', performed_date: '2026-10-05T08:00:00Z',
        name: 'Rodaje', activity_type: 'Running', training_type: 'rodaje', is_completed: true,
        actual_distance_km: 10, actual_duration_min: 50, actual_avg_pace: '5:00/km', avg_heart_rate: 150, max_heart_rate: 165,
        rpe: 5, feedback_notes: 'Bien', source_provider: 'strava', provider_activity_id: '9002', strava_activity_id: null,
        planned_structure: null, source_laps: null, source_elevation: null },
    ],
    strava_activities: [
      { id: 'strava-run', coach_id: coach, client_id: client, is_deleted: false, provider_activity_id: '9002', name: 'Morning Run',
        sport_type: 'Run', start_date: '2026-10-05T08:00:00Z', distance_meters: 10000, moving_time_seconds: 3000, elapsed_time_seconds: 3100,
        average_pace_seconds_per_km: 300, average_heartrate: 150, max_heartrate: 165, total_elevation_gain: 40, rpe: 5, athlete_notes: null,
        matched_planned_session_id: null, cardio_session_id: null,
        laps: [{ lap_index: 1, distance: 5000, moving_time: 1500 }, { lap_index: 2, distance: 5000, moving_time: 1500 }], splits_metric: null },
      { id: 'strava-ride', coach_id: coach, client_id: client, is_deleted: false, provider_activity_id: '9001', name: 'Afternoon Ride',
        sport_type: 'Ride', start_date: '2026-10-02T16:00:00Z', distance_meters: 42500, moving_time_seconds: 6540, elapsed_time_seconds: 7000,
        average_pace_seconds_per_km: 154.04, average_heartrate: 140, max_heartrate: 170, total_elevation_gain: 300, rpe: 6, athlete_notes: null,
        matched_planned_session_id: null, cardio_session_id: 'ride-session', laps: null, splits_metric: null },
      // Bici de montaña sin sesión vinculada: 27,6 km en 98 min
      { id: 'strava-mtb', coach_id: coach, client_id: client, is_deleted: false, provider_activity_id: '9003', name: 'MTB',
        sport_type: 'MountainBikeRide', start_date: '2026-10-01T17:00:00Z', distance_meters: 27600, moving_time_seconds: 5880, elapsed_time_seconds: 6000,
        average_pace_seconds_per_km: 213.3, average_heartrate: null, max_heartrate: null, total_elevation_gain: 500, rpe: null, athlete_notes: null,
        matched_planned_session_id: null, cardio_session_id: null, laps: null, splits_metric: null },
    ],
  }
  const db = {
    from(table: string) {
      let filtered = [...tables[table] ?? []]
      const query: any = {
        select() { return query }, order() { return query }, or() { return query },
        gte() { return query }, lte() { return query }, lt() { return query },
        eq(key: string, value: unknown) { filtered = filtered.filter((row) => !(key in row) || row[key] === value); return query },
        in(key: string, values: unknown[]) { filtered = filtered.filter((row) => values.includes(row[key])); return query },
        limit(limit: number) { filtered = filtered.slice(0, limit); return query },
        range(start: number, end: number) { filtered = filtered.slice(start, end + 1); return query },
        then(resolve: any) { return Promise.resolve({ data: filtered, error: null }).then(resolve) },
      }
      return query
    },
  }
  const tools = new Map<string, any>()
  registerHistoryTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
    requireClient: async (_db: any, space: string, id: string) => { if (space !== coach || id !== client) throw new Error('Cliente no autorizado') },
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => new Date('2026-10-16T08:00:00Z'),
  })
  return async (input: any) => {
    const tool = tools.get('get_cardio_results')
    const result = await tool.run(tool.config.inputSchema.parse({ client_id: client, ...input }))
    if (result.error) throw new Error(result.error)
    outputSchemas.get_cardio_results.parse(JSON.parse(JSON.stringify(result.data)))
    return result.data
  }
}

Deno.test('get_cardio_results: las bicis traen disciplina y velocidad, no ritmo por km', async () => {
  const run = cardioFixture()
  const { activities } = await run({})
  const byId = Object.fromEntries(activities.map((activity: any) => [activity.id, activity]))

  const ride = byId['ride-session']
  assert.equal(ride.discipline, 'bicicleta')
  assert.equal(ride.speed_kmh, 23.4)
  assert.equal(ride.pace, null)
  assert.equal(ride.pace_seconds_per_km, null)
  assert.equal(ride.strava_activity_id, 'strava-ride')

  // El ritmo antiguo guardado («2:30/km») no se devuelve: se calcula la velocidad
  const oldRide = byId['old-ride']
  assert.equal(oldRide.discipline, 'bicicleta')
  assert.equal(oldRide.speed_kmh, 24)
  assert.equal(oldRide.pace, null)

  const mtb = byId['strava-mtb']
  assert.equal(mtb.source, 'strava_unmatched')
  assert.equal(mtb.discipline, 'bicicleta')
  assert.equal(mtb.speed_kmh, 16.9)
  assert.equal(mtb.pace_seconds_per_km, null)
})

Deno.test('get_cardio_results: la carrera conserva su ritmo y se enlaza por id de Strava', async () => {
  const run = cardioFixture()
  const { activities } = await run({})
  const runSession = activities.find((activity: any) => activity.id === 'run-session')
  assert.equal(runSession.discipline, 'running')
  assert.equal(runSession.pace, '5:00/km')
  assert.equal(runSession.pace_seconds_per_km, 300)
  assert.equal('speed_kmh' in runSession, false)
  // Enlazada por provider_activity_id: no se duplica como actividad suelta y trae sus laps resumidos
  assert.equal(runSession.strava_activity_id, 'strava-run')
  assert.equal(activities.filter((activity: any) => activity.id === 'strava-run').length, 0)
  assert.deepEqual(runSession.laps.map((lap: any) => [lap.lap, lap.distance_km]), [[1, 5], [2, 5]])
})

Deno.test('get_cardio_results: ordena por fecha y pagina con laps resumidos', async () => {
  const run = cardioFixture()
  const first = await run({ limit: 1 })
  assert.equal(first.activities.length, 1)
  assert.equal(first.activities[0].id, 'run-session')
  assert.equal(first.has_more, true)
  assert.equal(first.next_offset, 1)
  assert.ok(Array.isArray(first.activities[0].laps))
  const rest = await run({ limit: 10, offset: 1 })
  assert.deepEqual(rest.activities.map((activity: any) => activity.id), ['ride-session', 'strava-mtb', 'old-ride'])
  assert.equal(rest.has_more, false)
  assert.ok(rest.activities.every((activity: any) => Array.isArray(activity.laps) && Array.isArray(activity.splits_km)))
})
