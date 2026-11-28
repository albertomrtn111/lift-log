import assert from 'node:assert/strict'
import { ageOn, buildAthleteProfile, labelledAnswers, profileSummary, registerProfileTools, thresholdsWithZones } from './profile.ts'
import { outputSchemas } from './output-schemas.ts'
import { jsonResult, type ToolHelpers, toolError } from './shared.ts'

const coach = '22222222-2222-4222-8222-222222222222'
const otherCoach = '99999999-9999-4999-8999-999999999999'
const client = '11111111-1111-4111-8111-111111111111'
const template = '44444444-4444-4444-8444-444444444444'

function fixture(overrides: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {
    clients: [{
      id: client, coach_id: coach, full_name: 'Ana Pérez', email: 'ana@example.com', phone: ' ', sex: null, birthday: '1990-06-01',
      height_cm: 160, status: 'active', start_date: '2026-01-10', notes: 'Prefiere entrenar por la mañana.', preferences: {},
      objectives: ['Correr 10 km'], onboarding_status: 'completed', invite_status: 'accepted', checkin_frequency_days: 7,
    }],
    athlete_baseline: [{ client_id: client, birth_date: '1990-11-25', sex: 'female', height_cm: '165.0', reference_weight_kg: '61.5', reference_weight_date: '2026-11-01', vo2max: null, endurance_enabled: true }],
    athlete_thresholds: [{ client_id: client, max_hr: 190, resting_hr: 50, run_lthr: 170, run_threshold_pace_sec: 300, bike_lthr: null, bike_ftp_watts: 200, hr_zone_method: 'friel_lthr', custom_zones: null, tested_at: '2026-10-01' }],
    athlete_ai_profiles: [{ coach_id: coach, client_id: client, profile_status: 'approved', generated_athlete_summary: 'Corredora popular.', generated_profile_json: { training_profile: 'Tres días por semana.' }, answers_json: { restrictions: 'Rodilla derecha', coachNotes: '' } }],
    checkins: [
      { id: 'c-old', coach_id: coach, client_id: client, type: 'onboarding', submitted_at: '2026-01-10T10:00:00Z', raw_payload: { goal: 'antiguo' }, form_template_id: template },
      { id: 'c-new', coach_id: coach, client_id: client, type: 'onboarding', submitted_at: '2026-01-12T10:00:00Z', raw_payload: { goal: 'Bajar de 50 min', sleep: '', days: 3, metric_m1: 70, progress_photos: ['a.webp', 'b.webp'] }, form_template_id: template },
      { id: 'c-weekly', coach_id: coach, client_id: client, type: 'checkin', submitted_at: '2026-11-20T10:00:00Z', raw_payload: {}, form_template_id: null },
      { id: 'c-draft', coach_id: coach, client_id: client, type: 'onboarding', submitted_at: null, raw_payload: { goal: 'borrador' }, form_template_id: template },
    ],
    form_templates: [{ id: template, coach_id: coach, title: 'Alta', schema: { fields: [{ id: 'goal', label: 'Objetivo' }, { id: 'days', label: 'Días disponibles' }, { id: 'progress_photos', type: 'photo_upload', label: 'Fotos' }] } }],
    metric_definitions: [{ id: 'm1', coach_id: coach, name: 'Cintura', unit: 'cm' }],
    ...overrides,
  }
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let sort: { key: string; ascending: boolean } | null = null
      let max = Infinity
      const result = () => {
        let rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
        if (sort) rows = [...rows].sort((a, b) => (a[sort!.key] > b[sort!.key] ? 1 : -1) * (sort!.ascending ? 1 : -1))
        return rows.slice(0, max)
      }
      const query: any = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query },
        not(key: string, op: string, value: unknown) { filters.push((row) => !(op === 'is' && value === null && row[key] == null)); return query },
        order(key: string, options: { ascending?: boolean } = {}) { sort = { key, ascending: options.ascending !== false }; return query },
        limit(value: number) { max = value; return query },
        maybeSingle() { return Promise.resolve({ data: result()[0] ?? null, error: null }) },
        then(resolve: any) { return Promise.resolve({ data: result(), error: null }).then(resolve) },
      }
      return query
    },
  }
  return db
}

function tool(db: any, coachId = coach) {
  const tools = new Map<string, any>()
  const helpers: ToolHelpers = {
    resolveCoach: async () => ({ coachId, timeZone: 'Europe/Madrid' }),
    requireClient: async () => ({}),
    jsonResult, toolError, audit() {},
    now: () => new Date('2026-11-24T10:00:00Z'),
  }
  registerProfileTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, helpers)
  return tools.get('get_athlete_profile')
}

Deno.test('ageOn counts the birthday only once it has passed', () => {
  assert.equal(ageOn('1990-11-25', '2026-11-24'), 35)
  assert.equal(ageOn('1990-11-24', '2026-11-24'), 36)
  assert.equal(ageOn(null, '2026-11-24'), null)
  assert.equal(ageOn('fecha', '2026-11-24'), null)
})

Deno.test('get_athlete_profile merges baseline over the client file and returns the latest onboarding form', async () => {
  const result = await tool(fixture()).run({ client_id: client })
  assert.equal(result.isError, undefined)
  const profile = result.structuredContent
  outputSchemas.get_athlete_profile.parse(profile)

  // Los datos base mandan sobre la ficha general.
  assert.deepEqual(profile.personal, {
    sex: 'female', sex_label: 'mujer', birth_date: '1990-11-25', age: 35, height_cm: 165,
    reference_weight_kg: 61.5, reference_weight_date: '2026-11-01', vo2max: null, endurance_enabled: true,
  })
  assert.deepEqual(profile.contact, { full_name: 'Ana Pérez', email: 'ana@example.com', phone: null })
  assert.equal(profile.coach_notes, 'Prefiere entrenar por la mañana.')
  assert.equal(profile.preferences, null)
  assert.deepEqual(profile.objectives, ['Correr 10 km'])

  // Solo el último cuestionario enviado, con etiquetas y sin respuestas vacías.
  assert.equal(profile.onboarding_form.checkin_id, 'c-new')
  assert.equal(profile.onboarding_form.form_title, 'Alta')
  assert.deepEqual(profile.onboarding_form.answers, [
    { field_id: 'goal', label: 'Objetivo', value: 'Bajar de 50 min' },
    { field_id: 'days', label: 'Días disponibles', value: 3 },
  ])
  assert.deepEqual(profile.onboarding_form.measurements, [{ metric_id: 'm1', name: 'Cintura', value: 70, unit: 'cm' }])
  assert.equal(profile.onboarding_form.photo_count, 2)

  assert.equal(profile.ai_profile.summary, 'Corredora popular.')
  assert.equal(profile.ai_profile.training_profile, 'Tres días por semana.')
  assert.deepEqual(profile.ai_profile.coach_questionnaire, { restrictions: 'Rodilla derecha' })
  assert.equal(profile.ai_profile.generated_system_prompt, undefined)
  assert.deepEqual(profile.missing, [])
})

Deno.test('get_athlete_profile lists what is missing for a bare client', async () => {
  const result = await tool(fixture({
    clients: [{ id: client, coach_id: coach, full_name: 'Luis', status: 'active', objectives: [] }],
    athlete_baseline: [], athlete_thresholds: [], athlete_ai_profiles: [], checkins: [],
  })).run({ client_id: client })
  const profile = result.structuredContent
  outputSchemas.get_athlete_profile.parse(profile)
  assert.equal(profile.personal.age, null)
  assert.equal(profile.personal.endurance_enabled, true)
  assert.equal(profile.thresholds, null)
  assert.equal(profile.onboarding_form, null)
  assert.deepEqual(profile.missing, ['fecha de nacimiento', 'sexo', 'altura', 'peso de referencia', 'umbrales y zonas', 'perfil IA', 'cuestionario de alta'])
  assert.equal(profileSummary(profile).has_onboarding_form, false)
})

Deno.test('get_athlete_profile does not read a client from another workspace', async () => {
  const result = await tool(fixture(), otherCoach).run({ client_id: client })
  assert.equal(result.isError, true)
})

Deno.test('thresholds come with the same zones as the web', () => {
  const view = thresholdsWithZones({ max_hr: 190, resting_hr: 50, run_lthr: 170, run_threshold_pace_sec: 300, bike_ftp_watts: 200, hr_zone_method: 'friel_lthr', custom_zones: null })!
  const run = view.zones.run_hr!
  assert.equal(run.zones.length, 5)
  assert.equal(run.zones[0].from, null)
  assert.equal(run.zones[4].to, null)
  // Contiguas: cada zona empieza justo después de la anterior.
  for (let index = 1; index < run.zones.length; index++) assert.equal(run.zones[index].from, run.zones[index - 1].to! + 1)
  assert.equal(view.zones.bike_hr, null)

  // Ritmo de umbral 5:00/km: Z1 más lenta que 6:27, Z5 más rápida que 4:57.
  const pace = view.zones.run_pace!
  assert.equal(pace.zones[0].slowest_sec_per_km, null)
  assert.equal(pace.zones[0].fastest_pace, '6:27/km')
  assert.equal(pace.zones[4].slowest_pace, '4:57/km')
  assert.equal(pace.zones[4].fastest_sec_per_km, null)

  const power = view.zones.bike_power!
  assert.equal(power.zones.length, 6)
  assert.equal(power.zones[3].name, 'Umbral')
})

Deno.test('labelledAnswers keeps unknown fields with their id as label', () => {
  assert.deepEqual(labelledAnswers({ extra: 'sí', empty: [], metric_x: '5' }, null), {
    answers: [{ field_id: 'extra', label: 'extra', value: 'sí' }],
    measurements: [{ metric_id: 'x', name: 'metric_x', value: 5, unit: null }],
    photo_count: 0,
  })
  assert.deepEqual(labelledAnswers(null, null), { answers: [], measurements: [], photo_count: 0 })
})

Deno.test('buildAthleteProfile honours a strength-only athlete', () => {
  const profile = buildAthleteProfile({
    client: { id: client, full_name: 'Ana', status: 'active' },
    baseline: { endurance_enabled: false }, thresholds: null, aiProfile: null, onboarding: null, onboardingTemplate: null,
  }, '2026-11-24')
  assert.equal(profile.personal.endurance_enabled, false)
})
