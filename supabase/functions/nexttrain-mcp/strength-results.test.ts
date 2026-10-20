import assert from 'node:assert/strict'
import { registerHistoryTools } from './history.ts'
import { outputSchemas } from './output-schemas.ts'
import { groupStrengthResults } from './strength-progress.js'

const client = '11111111-1111-4111-8111-111111111111'
const coach = '22222222-2222-4222-8222-222222222222'
const programId = '33333333-3333-4333-8333-333333333333'

// Fila plana como las de completedStrengthRows.
function flatSet(week: number, exercise: number, set: number, extra: Record<string, unknown> = {}) {
  return {
    source: 'completed_set', execution_status: 'confirmed', id: `set-${week}-${exercise}-${set}`,
    program_id: programId, program_name: 'Bloque de fuerza hipertrofia', day_id: `day-${week % 3}`, day_name: 'Pierna y glúteo',
    exercise_id: `exercise-${exercise}`, catalog_exercise_id: `catalog-${exercise}`, comparison_exercise_id: `catalog-${exercise}`,
    comparison_scope: 'catalog_across_programs', exercise: `Ejercicio ${exercise}`,
    week_index: week, set_index: set - 1, set_number: set, scheduled_date: `2026-10-${String(week).padStart(2, '0')}`,
    scheduled_date_source: 'stored_session', session_id: `session-${week}`, session_completed: true,
    performed_at: null, recorded_at: '2026-10-15T10:00:00Z', weight_kg: 80 + set, reps: 8, rir: 2, rpe: null,
    completed: true, notes: null, note_source: null, ...extra,
  }
}

Deno.test('grouping keeps every set value once and drops repeated session and exercise fields', () => {
  const flat = [flatSet(2, 1, 1), flatSet(2, 1, 2, { notes: 'Bien', note_source: 'set_row' }), flatSet(2, 2, 1), flatSet(1, 1, 1)]
  const workouts = groupStrengthResults(flat)
  assert.equal(workouts.length, 2)
  assert.deepEqual(workouts.map((workout: any) => workout.week_index), [2, 1])
  const [first] = workouts
  assert.equal(first.program_name, 'Bloque de fuerza hipertrofia')
  assert.equal(first.session_completed, true)
  assert.deepEqual(first.exercises.map((exercise: any) => [exercise.exercise_id, exercise.sets.length]), [['exercise-1', 2], ['exercise-2', 1]])
  const set = first.exercises[0].sets[1]
  assert.equal(set.notes, 'Bien')
  assert.equal('program_name' in set, false)
  assert.equal('comparison_scope' in set, false)
  assert.equal('set_index' in set, false)
  // Los nulos de las series se omiten; los valores reales se conservan.
  assert.equal('rpe' in set, false)
  assert.equal(set.weight_kg, 82)

  // Reconstruir las filas planas a partir de los grupos no pierde ningún valor no nulo.
  const rebuilt = workouts.flatMap(({ exercises, ...workout }: any) => exercises.flatMap(({ sets, ...exercise }: any) =>
    sets.map((item: any) => ({ ...workout, ...exercise, ...item }))))
  const withoutNulls = (row: any) => Object.fromEntries(Object.entries(row).filter(([key, value]) => value !== null && key !== 'set_index'))
  assert.deepEqual(rebuilt.map(withoutNulls).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    flat.map(withoutNulls).sort((a: any, b: any) => a.id.localeCompare(b.id)))
})

Deno.test('a typical page of 200 sets is less than half the size when grouped', () => {
  const flat: any[] = []
  for (let week = 1; week <= 10; week++) for (let exercise = 1; exercise <= 5; exercise++) for (let set = 1; set <= 4; set++) flat.push(flatSet(week, exercise, set))
  assert.equal(flat.length, 200)
  const flatSize = JSON.stringify(flat).length
  const groupedSize = JSON.stringify(groupStrengthResults(flat)).length
  console.log(`200 series: plano ${flatSize} caracteres, agrupado ${groupedSize} (${Math.round(100 * groupedSize / flatSize)} %)`)
  assert.ok(groupedSize < flatSize * 0.5)
})

function historyFixture() {
  const tables: Record<string, any[]> = {
    training_programs: [{ id: programId, coach_id: coach, client_id: client, name: 'Bloque', status: 'active', weeks: 4, total_weeks: 4,
      effective_from: '2026-10-05', effective_to: '2026-11-01', created_at: '2026-10-01T00:00:00Z' }],
    training_days: [{ id: 'day-a', coach_id: coach, program_id: programId, name: 'Pierna', default_weekday: 1, order_index: 1 }],
    training_exercises: [
      { id: 'exercise-1', coach_id: coach, program_id: programId, day_id: 'day-a', catalog_exercise_id: null, exercise_name: 'Sentadilla', order_index: 1, sets: 2, reps: '5', rir: 2 },
      { id: 'exercise-2', coach_id: coach, program_id: programId, day_id: 'day-a', catalog_exercise_id: 'catalog-2', exercise_name: 'Prensa', order_index: 2, sets: 1, reps: '10', rir: 2 },
    ],
    training_exercise_sets: [
      { id: 'set-1', exercise_id: 'exercise-1', week_index: 2, set_index: 0, weight_kg: 100, reps: 5, rir: 2, completed: true, is_override: false, notes: null, updated_at: '2026-10-12T18:00:00Z' },
      { id: 'set-2', exercise_id: 'exercise-1', week_index: 2, set_index: 1, weight_kg: 100, reps: 5, rir: 1, completed: true, is_override: false, notes: 'Dura', updated_at: '2026-10-12T18:05:00Z' },
      { id: 'set-3', exercise_id: 'exercise-2', week_index: 2, set_index: 0, weight_kg: 200, reps: 10, rir: null, completed: false, is_override: true, notes: null, updated_at: '2026-10-12T18:10:00Z' },
    ],
    training_exercise_logs: [],
    scheduled_strength_sessions: [{ id: 'session-2', coach_id: coach, client_id: client, program_id: programId, day_id: 'day-a', scheduled_date: '2026-10-12', is_completed: true }],
  }
  const db = {
    from(table: string) {
      let filtered = [...tables[table] ?? []]
      const query: any = {
        select() { return query }, order() { return query }, or() { return query },
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
  return async (name: string, input: any) => {
    const tool = tools.get(name)
    const result = await tool.run(tool.config.inputSchema.parse(input))
    if (result.error) throw new Error(result.error)
    outputSchemas[name].parse(JSON.parse(JSON.stringify(result.data)))
    return result.data
  }
}

Deno.test('get_strength_results groups by default and keeps the flat format on request', async () => {
  const run = historyFixture()
  const grouped = await run('get_strength_results', { client_id: client })
  assert.equal(grouped.format, 'grouped')
  assert.equal(grouped.result_count, 3)
  assert.equal('results' in grouped, false)
  assert.equal(grouped.workouts.length, 1)
  const [workout] = grouped.workouts
  assert.equal(workout.session_id, 'session-2')
  assert.equal(workout.scheduled_date, '2026-10-12')
  const squat = workout.exercises.find((exercise: any) => exercise.exercise_id === 'exercise-1')
  assert.deepEqual(squat.sets.map((set: any) => [set.set_number, set.execution_status, set.weight_kg]), [[1, 'confirmed', 100], [2, 'confirmed', 100]])
  assert.equal(workout.exercises.find((exercise: any) => exercise.exercise_id === 'exercise-2').sets[0].execution_status, 'recorded_unverified')
  assert.equal(grouped.data_quality.confirmed_execution_sets, 2)

  const flat = await run('get_strength_results', { client_id: client, format: 'flat' })
  assert.equal(flat.format, 'flat')
  assert.equal(flat.results.length, 3)
  assert.equal(flat.results[0].program_name, 'Bloque')
  assert.equal('workouts' in flat, false)

  const paged = await run('get_strength_results', { client_id: client, limit: 2 })
  assert.equal(paged.result_count, 2)
  assert.equal(paged.has_more, true)
  assert.equal(paged.next_offset, 2)
})

Deno.test('get_program_history detail uses the same grouped results and validates both shapes', async () => {
  const run = historyFixture()
  const detail = await run('get_program_history', { client_id: client, program_id: programId })
  assert.equal(detail.format, 'grouped')
  assert.equal(detail.workouts[0].exercises.length, 2)
  assert.equal(detail.as_of_date, '2026-10-16')
  const flat = await run('get_program_history', { client_id: client, program_id: programId, format: 'flat' })
  assert.equal(flat.results.length, 3)
  const list = await run('get_program_history', { client_id: client })
  assert.equal(list.programs.length, 1)
})
