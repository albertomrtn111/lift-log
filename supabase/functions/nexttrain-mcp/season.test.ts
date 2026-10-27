import assert from 'node:assert/strict'
import { outputSchemas } from './output-schemas.ts'
import { buildSeasonView, normalizeWeekChanges, phasesToDates, registerSeasonTools } from './season.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const client = '11111111-1111-4111-8111-111111111111'
const seasonId = '66666666-6666-4666-8666-666666666666'
const version = '2026-10-15T10:00:00.123456+00:00'

// Hoy (Europe/Madrid) es el viernes 16 de octubre: la semana 1 es la actual y la 2, futura.
const season = {
  id: seasonId, name: 'Maratón', status: 'active', start_date: '2026-10-12', end_date: '2026-10-25', primary_unit: 'time',
  disciplines: ['strength', 'run', 'bike'], notes: null, updated_at: version, target_event: { id: 'event-1', title: 'Maratón de Valencia', event_date: '2026-12-06' },
  season_phases: [{ name: 'Base', phase_type: 'base', start_date: '2026-10-12', end_date: '2026-10-25', focus: null, sort_order: 0 }],
  season_weeks: [
    { id: 'w2', week_start: '2026-10-19', week_type: 'descarga', notes: 'Suave', season_week_targets: [{ discipline: 'run', target_minutes: 120, target_km: null, target_sessions: null }] },
    { id: 'w1', week_start: '2026-10-12', week_type: 'carga', notes: null, season_week_targets: [
      { discipline: 'run', target_minutes: 180, target_km: null, target_sessions: null },
      { discipline: 'strength', target_minutes: null, target_km: null, target_sessions: 2 },
    ] },
  ],
}

function fixture(tables: Record<string, any[]>, rpc: (name: string, args: any) => { data: any; error: any } = () => ({ data: null, error: null })) {
  const calls: any[] = []
  const db = {
    from(table: string) {
      let result = [...tables[table] ?? []]
      const filter = (test: (row: any) => boolean) => { result = result.filter(test); return query }
      const query: any = {
        select() { return query }, order() { return query }, limit() { return query },
        eq: (field: string, value: any) => filter((row) => !(field in row) || row[field] === value),
        gte: (field: string, value: any) => filter((row) => !(field in row) || row[field] >= value),
        lte: (field: string, value: any) => filter((row) => !(field in row) || row[field] <= value),
        in: (field: string, values: any[]) => filter((row) => values.includes(row[field])),
        range: (from: number, to: number) => { result = result.slice(from, to + 1); return query },
        maybeSingle: () => Promise.resolve({ data: result[0] ?? null, error: null }),
        then: (resolve: any) => Promise.resolve({ data: result, error: null }).then(resolve),
      }
      return query
    },
    rpc(name: string, args: any) { calls.push({ name, args }); return Promise.resolve(rpc(name, args)) },
  }
  const tools = new Map<string, any>()
  registerSeasonTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, {
    resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
    requireClient: async () => ({}),
    jsonResult: (data: any) => ({ data }), toolError: (message: string) => ({ error: message }), audit() {},
    now: () => new Date('2026-10-15T23:30:00Z'),
  })
  const parse = (name: string, input: any) => tools.get(name).config.inputSchema.parse(input)
  async function run(name: string, input: any) {
    const result = await tools.get(name).run(parse(name, input))
    if (result.data) outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result
  }
  return { run, parse, calls }
}

Deno.test('phases and week changes are translated from week numbers to Mondays and validated', () => {
  assert.deepEqual(phasesToDates([
    { name: 'Específico', phase_type: 'especifico', from_week: 3, to_week: 4 },
    { name: 'Base', phase_type: 'base', from_week: 1, to_week: 2, focus: 'Aeróbico' },
  ], '2026-10-12', 4), [
    { name: 'Base', phase_type: 'base', start_date: '2026-10-12', end_date: '2026-10-25', focus: 'Aeróbico' },
    { name: 'Específico', phase_type: 'especifico', start_date: '2026-10-26', end_date: '2026-11-08', focus: null },
  ])
  assert.throws(() => phasesToDates([{ name: 'A', phase_type: 'base', from_week: 1, to_week: 2 }, { name: 'B', phase_type: 'taper', from_week: 2, to_week: 3 }], '2026-10-12', 4), /solaparse/)
  assert.throws(() => phasesToDates([{ name: 'A', phase_type: 'base', from_week: 1, to_week: 5 }], '2026-10-12', 4), /tiene 4/)

  assert.deepEqual(normalizeWeekChanges([
    { week_number: 2, week_type: 'descarga', targets: { run: 120, bike: null } },
    { week_start: '2026-11-02', notes: null },
  ], '2026-10-12', 4, ['run', 'bike']), [
    { week_start: '2026-10-19', week_number: 2, week_type: 'descarga', targets: [{ discipline: 'run', value: 120 }, { discipline: 'bike', value: null }] },
    { week_start: '2026-11-02', week_number: 4, notes: null },
  ])
  assert.throws(() => normalizeWeekChanges([{ week_start: '2026-10-14' }], '2026-10-12', 4, ['run']), /lunes: 2026-10-12/)
  assert.throws(() => normalizeWeekChanges([{ week_number: 5 }], '2026-10-12', 4, ['run']), /fuera de la temporada/)
  assert.throws(() => normalizeWeekChanges([{ week_number: 1, targets: { swim: 30 } }], '2026-10-12', 4, ['run']), /swim no está/)
  assert.throws(() => normalizeWeekChanges([{ week_number: 1 }, { week_start: '2026-10-12' }], '2026-10-12', 4, ['run']), /dos veces/)
})

Deno.test('the season view orders weeks and disciplines and only adds past and current weeks to date', () => {
  const view = buildSeasonView(season, null, '2026-10-16')
  assert.deepEqual(view.season.disciplines, ['run', 'bike', 'strength'])
  assert.equal(view.season.current_week_number, 1)
  assert.deepEqual(view.measures, { run: 'minutes', bike: 'minutes', strength: 'sessions' })
  assert.deepEqual(view.weeks.map((week) => [week.week_number, week.week_start, week.timing, week.week_type, week.phase]), [
    [1, '2026-10-12', 'current', 'carga', 'Base'],
    [2, '2026-10-19', 'future', 'descarga', 'Base'],
  ])
  assert.deepEqual(view.weeks[0].disciplines, { run: { target: 180 }, bike: { target: null }, strength: { target: 2 } })
  assert.deepEqual(view.totals.run, { measure: 'minutes', target_total: 300, target_to_date: 180 })
  assert.deepEqual(view.phases[0], { name: 'Base', phase_type: 'base', start_date: '2026-10-12', end_date: '2026-10-25', focus: null, from_week: 1, to_week: 2 })
  assert.deepEqual(buildSeasonView(season, null, '2026-10-16', { from_date: '2026-10-19' }).weeks.map((week) => week.week_number), [2])
})

Deno.test('get_season_plan compares targets with planned and done volume like the app', async () => {
  const { run } = fixture({
    season_plans: [season],
    client_events: [{ id: 'event-1', title: 'Maratón de Valencia', event_date: '2026-12-06', event_type: 'race', priority: 'A', status: 'planned' }],
    cardio_sessions: [
      // Programada y hecha con datos reales.
      { id: 'c1', scheduled_date: '2026-10-13', activity_type: 'Running', training_type: 'Rodaje', structure: null, planned_structure: null, target_duration_min: 60, target_distance_km: null, is_completed: true, actual_duration_min: 55, actual_distance_km: 10, source_provider: null, strava_activity_id: 's1' },
      // Importación de Strava sin plan: no cuenta como programada.
      { id: 'c2', scheduled_date: '2026-10-14', activity_type: 'Running', training_type: null, structure: null, planned_structure: {}, target_duration_min: 30, target_distance_km: null, is_completed: true, actual_duration_min: 30, actual_distance_km: 5, source_provider: 'strava', strava_activity_id: null },
    ],
    strava_activities: [
      { id: 's1', start_date_local: '2026-10-13T08:00:00', sport_type: 'Run', activity_type: 'Run', distance_meters: 10000, moving_time_seconds: 3300, cardio_session_id: 'c1', matched_planned_session_id: null, is_deleted: false },
      { id: 's2', start_date_local: '2026-10-15T09:00:00', sport_type: 'Ride', activity_type: 'Ride', distance_meters: 40000, moving_time_seconds: 5400, cardio_session_id: null, matched_planned_session_id: null, is_deleted: false },
      { id: 's3', start_date_local: '2026-10-16T09:00:00', sport_type: 'Ride', activity_type: 'Ride', distance_meters: 20000, moving_time_seconds: 3600, cardio_session_id: null, matched_planned_session_id: null, is_deleted: true },
    ],
    scheduled_strength_sessions: [
      { id: 'st1', program_id: 'p1', day_id: 'd1', scheduled_date: '2026-10-12', is_completed: true },
      { id: 'st2', program_id: 'p1', day_id: 'd2', scheduled_date: '2026-10-15', is_completed: false },
    ],
    training_programs: [{ id: 'p1', name: 'Fuerza', status: 'active', weeks: 4, effective_from: '2026-10-12', created_at: '2026-10-01', training_days: [
      { id: 'd1', name: 'A', order_index: 0, default_weekday: 1 }, { id: 'd2', name: 'B', order_index: 1, default_weekday: 4 },
    ] }],
  })
  const { data } = await run('get_season_plan', { client_id: client })
  assert.equal(data.season.id, seasonId)
  assert.equal(data.season.target_event.title, 'Maratón de Valencia')
  assert.deepEqual(data.weeks[0].disciplines, {
    run: { target: 180, planned: 60, done: 85 },
    bike: { target: null, planned: 0, done: 90 },
    strength: { target: 2, planned: 2, done: 1 },
  })
  assert.deepEqual(data.weeks[1].disciplines.strength, { target: null, planned: 2, done: 0 })
  assert.deepEqual(data.totals.run, { measure: 'minutes', target_total: 300, target_to_date: 180, planned_total: 60, done_to_date: 85 })
  assert.equal(data.upcoming_events.length, 1)
})

Deno.test('get_season_plan without an active season returns the history and the possible target events', async () => {
  const { run } = fixture({ season_plans: [{ ...season, status: 'archived' }], client_events: [] })
  const { data } = await run('get_season_plan', { client_id: client })
  assert.equal(data.season, null)
  assert.equal(data.seasons.length, 1)
  assert.match(data.note, /create_season_plan/)
})

const createInput = {
  client_id: client, name: 'Temporada 2027', start_date: '2026-10-12', weeks: 4, disciplines: ['run', 'strength'],
  base_targets: { run: 180, strength: 2 },
  week_changes: [{ week_number: 2, targets: { run: 210 } }, { week_number: 4, week_type: 'descarga', notes: 'Recuperar', targets: { run: 120, strength: null } }],
  phases: [{ name: 'Base', phase_type: 'base', from_week: 1, to_week: 4 }],
}

Deno.test('create_season_plan dry_run shows the whole season without saving', async () => {
  const { run, calls } = fixture({ season_plans: [season] })
  const { data } = await run('create_season_plan', { ...createInput, dry_run: true })
  assert.equal(data.saved, false)
  assert.equal(calls.length, 0)
  assert.equal(data.season.end_date, '2026-11-08')
  assert.deepEqual(data.weeks.map((week: any) => [week.week_type, week.disciplines.run.target, week.disciplines.strength.target]), [
    ['carga', 180, 2], ['carga', 210, 2], ['carga', 180, 2], ['descarga', 120, null],
  ])
  assert.equal(data.weeks[3].notes, 'Recuperar')
  assert.deepEqual(data.totals.run.target_total, 690)
  assert.match(data.warnings[0], /replace_active/)
})

Deno.test('create_season_plan sends one atomic payload with dates instead of week numbers', async () => {
  const { run, calls } = fixture({}, () => ({ data: { id: seasonId, name: 'Temporada 2027', status: 'active', start_date: '2026-10-12', end_date: '2026-11-08', updated_at: version, week_count: 4, target_count: 7, phase_count: 1, archived_season_ids: [] }, error: null }))
  const { data } = await run('create_season_plan', createInput)
  assert.equal(data.created, true)
  assert.equal(data.target_count, 7)
  assert.equal(calls[0].name, 'create_nexttrain_season_plan')
  assert.deepEqual(calls[0].args.p_payload, {
    name: 'Temporada 2027', start_date: '2026-10-12', weeks: 4, primary_unit: 'time', disciplines: ['run', 'strength'],
    target_event_id: null, notes: null, status: 'active', replace_active: false,
    base_targets: [{ discipline: 'run', value: 180 }, { discipline: 'strength', value: 2 }],
    week_changes: [
      { week_start: '2026-10-19', week_number: 2, targets: [{ discipline: 'run', value: 210 }] },
      { week_start: '2026-11-02', week_number: 4, week_type: 'descarga', notes: 'Recuperar', targets: [{ discipline: 'run', value: 120 }, { discipline: 'strength', value: null }] },
    ],
    phases: [{ name: 'Base', phase_type: 'base', start_date: '2026-10-12', end_date: '2026-11-08', focus: null }],
  })
})

Deno.test('create_season_plan rejects bad dates and disciplines before calling SQL', async () => {
  const { run, calls } = fixture({})
  assert.match((await run('create_season_plan', { ...createInput, start_date: '2026-10-14' })).error, /lunes de esa semana: 2026-10-12/)
  assert.match((await run('create_season_plan', { ...createInput, base_targets: { bike: 60 } })).error, /bike no está/)
  assert.equal(calls.length, 0)
  const conflict = fixture({}, () => ({ data: null, error: { code: 'P0001', message: 'Este atleta ya tiene una temporada activa. Archívala o usa replace_active.' } }))
  assert.match((await conflict.run('create_season_plan', createInput)).error, /replace_active/)
  const internal = fixture({}, () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }))
  assert.equal((await internal.run('create_season_plan', createInput)).error, 'No se ha podido crear la temporada. No se guardó ningún cambio.')
})

Deno.test('update_season_weeks previews before and after and saves only the changed weeks', async () => {
  const tables = { season_plans: [season] }
  const preview = await fixture(tables).run('update_season_weeks', {
    client_id: client, season_id: seasonId, expected_updated_at: version, dry_run: true,
    weeks: [{ week_number: 2, week_type: 'carga', notes: null, targets: { run: 200, bike: 90 } }],
  })
  assert.deepEqual(preview.data.before[0].disciplines, { run: { target: 120 }, bike: { target: null }, strength: { target: null } })
  assert.deepEqual(preview.data.after[0].disciplines, { run: { target: 200 }, bike: { target: 90 }, strength: { target: null } })
  assert.equal(preview.data.after[0].week_type, 'carga')
  assert.equal(preview.data.after[0].notes, null)

  const { run, calls } = fixture(tables, () => ({ data: { id: seasonId, name: 'Maratón', status: 'active', updated_at: '2026-10-16T08:00:00+00:00', target_count: 4 }, error: null }))
  const { data } = await run('update_season_weeks', { client_id: client, season_id: seasonId, expected_updated_at: version, weeks: [{ week_start: '2026-10-19', targets: { run: null } }] })
  assert.deepEqual(data.changed_weeks, [2])
  assert.deepEqual(calls[0].args.p_payload, { expected_updated_at: version, week_changes: [{ week_start: '2026-10-19', week_number: 2, targets: [{ discipline: 'run', value: null }] }] })

  const stale = await fixture(tables).run('update_season_weeks', { client_id: client, season_id: seasonId, expected_updated_at: '2026-10-01T00:00:00Z', weeks: [{ week_number: 1 }] })
  assert.equal(stale.error, 'La temporada cambió; vuelve a leer get_season_plan.')
})

Deno.test('update_season_plan previews the effects of shortening and removing disciplines', async () => {
  const { run, calls, parse } = fixture({ season_plans: [season] })
  assert.throws(() => parse('update_season_plan', { client_id: client, season_id: seasonId, expected_updated_at: version }))
  const { data } = await run('update_season_plan', {
    client_id: client, season_id: seasonId, expected_updated_at: version, dry_run: true, weeks: 1, disciplines: ['run', 'bike'],
    phases: [{ name: 'Base', phase_type: 'base', from_week: 1, to_week: 1 }],
  })
  assert.equal(calls.length, 0)
  assert.deepEqual(data.effects, { removed_disciplines: ['strength'], removed_targets: 2, added_weeks: 0, removed_weeks: 1, new_end_date: '2026-10-18' })
  assert.deepEqual(data.changes.phases, [{ name: 'Base', phase_type: 'base', start_date: '2026-10-12', end_date: '2026-10-18', focus: null }])

  const saved = fixture({ season_plans: [season] }, () => ({ data: { id: seasonId, name: 'Maratón', status: 'archived', start_date: '2026-10-12', end_date: '2026-10-25', disciplines: ['run'], updated_at: version, week_count: 2, target_count: 2, phase_count: 1, removed_weeks: 0, removed_targets: 1 }, error: null }))
  const result = await saved.run('update_season_plan', { client_id: client, season_id: seasonId, expected_updated_at: version, status: 'archived', target_event_id: null })
  assert.deepEqual(saved.calls[0].args.p_payload, { expected_updated_at: version, replace_active: false, target_event_id: null, status: 'archived' })
  assert.equal(result.data.updated, true)
})
