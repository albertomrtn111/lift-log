import { z } from 'npm:zod@4.3.6'
import {
  formatPace,
  HR_ZONE_NAMES,
  POWER_ZONE_NAMES,
  resolveHrBounds,
  resolvePaceBounds,
  resolvePowerBounds,
  type CustomZones,
  type HrZoneMethod,
  type ResolvedZoneBounds,
} from '../../../src/lib/training/zones.ts'
import { createToolRunner, type Db, defaultHelpers, readOnlyAnnotations, type Row, type ToolHelpers } from './shared.ts'

type Server = any

// Ficha del atleta: datos de contacto y de la cuenta (clients), datos base (athlete_baseline),
// umbrales y zonas (athlete_thresholds), perfil IA aprobado (athlete_ai_profiles) y el
// cuestionario de alta (checkins de tipo onboarding). Las lesiones y notas relevantes de
// Modo Sala (client_injuries, client_notes_relevant) se quedan fuera a propósito.

const CLIENT_COLUMNS = 'id, full_name, email, phone, sex, birthday, height_cm, status, start_date, deactivated_at, notes, preferences, objectives, onboarding_status, invite_status, accepted_at, checkin_frequency_days, next_checkin_date, daily_metrics_enabled'
const BASELINE_COLUMNS = 'birth_date, sex, height_cm, reference_weight_kg, reference_weight_date, vo2max, endurance_enabled, updated_at'
const THRESHOLD_COLUMNS = 'max_hr, resting_hr, run_lthr, run_threshold_pace_sec, bike_lthr, bike_ftp_watts, hr_zone_method, custom_zones, tested_at, notes, updated_at'
const AI_PROFILE_COLUMNS = 'profile_status, onboarding_status, answers_json, generated_athlete_summary, generated_goals_and_calendar, generated_health_and_constraints, generated_training_profile, generated_nutrition_and_body_context, generated_key_points_and_working_rules, generated_profile_json, onboarding_completed_at, approved_at, updated_at'

const SEX_LABELS: Record<string, string> = { male: 'hombre', female: 'mujer', other: 'otro' }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Row).length === 0
  return false
}

/** Años cumplidos en «today» (YYYY-MM-DD), sin depender de la zona del servidor. */
export function ageOn(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number)
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
  return age >= 0 && age < 130 ? age : null
}

/** Campos del formulario por id, con su etiqueta y su tipo. */
function formFields(schema: unknown): Map<string, { label: string; type: string | null }> {
  const fields = new Map<string, { label: string; type: string | null }>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const item = value as Row
    if (typeof item.id === 'string' && typeof item.label === 'string') {
      fields.set(item.id, { label: item.label, type: typeof item.type === 'string' ? item.type : null })
    }
    for (const nested of Object.values(item)) if (nested && typeof nested === 'object') visit(nested)
  }
  visit(schema)
  return fields
}

/**
 * Respuestas del formulario con la etiqueta de cada campo, sin las vacías. Las medidas
 * (claves metric_<id>) van aparte con su nombre y unidad, y de las fotos solo se cuenta cuántas hay.
 */
export function labelledAnswers(payload: unknown, schema: unknown, metricDefinitions: Row[] = []) {
  const answers: Array<{ field_id: string; label: string; value: unknown }> = []
  const measurements: Array<{ metric_id: string; name: string; value: number | null; unit: string | null }> = []
  let photoCount = 0
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { answers, measurements, photo_count: photoCount }
  const fields = formFields(schema)
  const metrics = new Map(metricDefinitions.map((item) => [item.id, item]))
  for (const [fieldId, value] of Object.entries(payload as Row)) {
    if (isEmpty(value)) continue
    if (fieldId.startsWith('metric_')) {
      const metricId = fieldId.slice(7)
      const definition = metrics.get(metricId)
      measurements.push({ metric_id: metricId, name: definition?.name ?? fieldId, value: numberOrNull(value), unit: definition?.unit ?? null })
      continue
    }
    const field = fields.get(fieldId)
    if (field?.type === 'photo_upload') {
      photoCount += Array.isArray(value) ? value.length : 1
      continue
    }
    answers.push({ field_id: fieldId, label: field?.label ?? fieldId, value })
  }
  return { answers, measurements, photo_count: photoCount }
}

/** FC y potencia: límites crecientes. Z1 por debajo del primero; la última, desde el último. */
function ascendingZones(resolved: ResolvedZoneBounds | null, names: string[], unit: string) {
  if (!resolved) return null
  const { bounds } = resolved
  const zones = names.slice(0, bounds.length + 1).map((name, index) => ({
    zone: index + 1,
    name,
    from: index === 0 ? null : bounds[index - 1],
    to: index < bounds.length ? bounds[index] - 1 : null,
  }))
  return { unit, source: resolved.source, zones }
}

/** Ritmo en s/km: límites de más lento a más rápido. Z1 más lenta que el primero; Z5 más rápida que el último. */
function paceZones(resolved: ResolvedZoneBounds | null) {
  if (!resolved) return null
  const { bounds } = resolved
  const zones = HR_ZONE_NAMES.slice(0, bounds.length + 1).map((name, index) => {
    const slowest = index === 0 ? null : bounds[index - 1]
    const fastest = index < bounds.length ? bounds[index] : null
    return {
      zone: index + 1,
      name,
      slowest_sec_per_km: slowest,
      fastest_sec_per_km: fastest,
      slowest_pace: slowest === null ? null : `${formatPace(slowest)}/km`,
      fastest_pace: fastest === null ? null : `${formatPace(fastest)}/km`,
    }
  })
  return { unit: 's/km', source: resolved.source, zones }
}

/** Umbrales con las zonas efectivas, calculadas igual que en la web (src/lib/training/zones.ts). */
export function thresholdsWithZones(thresholds: Row | null) {
  if (!thresholds) return null
  const method = (thresholds.hr_zone_method ?? 'friel_lthr') as HrZoneMethod
  const custom = (thresholds.custom_zones ?? null) as CustomZones | null
  const common = { method, maxHr: thresholds.max_hr, restingHr: thresholds.resting_hr, custom }
  return {
    max_hr: numberOrNull(thresholds.max_hr),
    resting_hr: numberOrNull(thresholds.resting_hr),
    run_lthr: numberOrNull(thresholds.run_lthr),
    run_threshold_pace_sec_per_km: numberOrNull(thresholds.run_threshold_pace_sec),
    bike_lthr: numberOrNull(thresholds.bike_lthr),
    bike_ftp_watts: numberOrNull(thresholds.bike_ftp_watts),
    hr_zone_method: method,
    tested_at: thresholds.tested_at ?? null,
    notes: text(thresholds.notes),
    updated_at: thresholds.updated_at ?? null,
    zones: {
      run_hr: ascendingZones(resolveHrBounds({ ...common, sport: 'run', lthr: thresholds.run_lthr }), HR_ZONE_NAMES, 'ppm'),
      bike_hr: ascendingZones(resolveHrBounds({ ...common, sport: 'bike', lthr: thresholds.bike_lthr }), HR_ZONE_NAMES, 'ppm'),
      run_pace: paceZones(resolvePaceBounds({ thresholdPaceSec: thresholds.run_threshold_pace_sec, custom })),
      bike_power: ascendingZones(resolvePowerBounds({ ftp: thresholds.bike_ftp_watts, custom }), POWER_ZONE_NAMES, 'W'),
    },
  }
}

function aiProfileView(profile: Row | null) {
  if (!profile) return null
  const generated = (profile.generated_profile_json ?? {}) as Row
  const pick = (column: string, key: string) => text(profile[column]) ?? text(generated[key])
  return {
    status: profile.profile_status ?? null,
    approved_at: profile.approved_at ?? null,
    updated_at: profile.updated_at ?? null,
    summary: pick('generated_athlete_summary', 'athlete_summary'),
    goals_and_calendar: pick('generated_goals_and_calendar', 'goals_and_calendar'),
    health_and_constraints: pick('generated_health_and_constraints', 'health_and_constraints'),
    training_profile: pick('generated_training_profile', 'training_profile'),
    nutrition_and_body_context: pick('generated_nutrition_and_body_context', 'nutrition_and_body_context'),
    key_points_and_working_rules: pick('generated_key_points_and_working_rules', 'key_points_and_working_rules'),
    // Cuestionario del perfil IA que rellena el entrenador; se omiten los campos vacíos.
    coach_questionnaire: Object.fromEntries(Object.entries((profile.answers_json ?? {}) as Row).filter(([, value]) => !isEmpty(value))),
  }
}

export type ProfileSources = {
  client: Row
  baseline: Row | null
  thresholds: Row | null
  aiProfile: Row | null
  onboarding: Row | null
  onboardingTemplate: Row | null
  metricDefinitions?: Row[]
}

/** Ficha completa. Los datos base del atleta mandan sobre los de la ficha general. */
export function buildAthleteProfile(sources: ProfileSources, today: string) {
  const { client, baseline, thresholds, aiProfile, onboarding, onboardingTemplate, metricDefinitions = [] } = sources
  const birthDate = baseline?.birth_date ?? client.birthday ?? null
  const sex = baseline?.sex ?? client.sex ?? null
  const personal = {
    sex,
    sex_label: sex ? SEX_LABELS[sex] ?? sex : null,
    birth_date: birthDate,
    age: ageOn(birthDate, today),
    height_cm: numberOrNull(baseline?.height_cm ?? client.height_cm),
    reference_weight_kg: numberOrNull(baseline?.reference_weight_kg),
    reference_weight_date: baseline?.reference_weight_date ?? null,
    vo2max: numberOrNull(baseline?.vo2max),
    // false: el entrenador ha marcado el perfil como solo fuerza; no hay que analizar zonas de FC ni ritmos.
    endurance_enabled: baseline ? baseline.endurance_enabled !== false : true,
  }
  const onboardingForm = onboarding
    ? {
      checkin_id: onboarding.id,
      submitted_at: onboarding.submitted_at,
      form_title: onboardingTemplate?.title ?? null,
      ...labelledAnswers(onboarding.raw_payload, onboardingTemplate?.schema, metricDefinitions),
    }
    : null
  const profile = {
    client_id: client.id,
    today,
    contact: { full_name: client.full_name, email: text(client.email), phone: text(client.phone) },
    personal,
    account: {
      status: client.status,
      start_date: client.start_date ?? null,
      deactivated_at: client.deactivated_at ?? null,
      invite_status: client.invite_status ?? null,
      onboarding_status: client.onboarding_status ?? null,
      accepted_at: client.accepted_at ?? null,
      checkin_frequency_days: client.checkin_frequency_days ?? null,
      next_checkin_date: client.next_checkin_date ?? null,
      daily_metrics_enabled: client.daily_metrics_enabled ?? null,
    },
    objectives: Array.isArray(client.objectives) ? client.objectives : [],
    coach_notes: text(client.notes),
    preferences: isEmpty(client.preferences) ? null : client.preferences,
    thresholds: thresholdsWithZones(thresholds),
    ai_profile: aiProfileView(aiProfile),
    onboarding_form: onboardingForm,
  }
  const missing: string[] = []
  if (personal.age === null) missing.push('fecha de nacimiento')
  if (!sex) missing.push('sexo')
  if (personal.height_cm === null) missing.push('altura')
  if (personal.reference_weight_kg === null) missing.push('peso de referencia')
  if (!thresholds) missing.push('umbrales y zonas')
  if (!aiProfile) missing.push('perfil IA')
  if (!onboardingForm) missing.push('cuestionario de alta')
  return { ...profile, missing }
}

/** Resumen corto para get_client_overview: lo imprescindible para no planificar a ciegas. */
export function profileSummary(profile: ReturnType<typeof buildAthleteProfile>) {
  return {
    age: profile.personal.age,
    sex: profile.personal.sex,
    height_cm: profile.personal.height_cm,
    reference_weight_kg: profile.personal.reference_weight_kg,
    vo2max: profile.personal.vo2max,
    endurance_enabled: profile.personal.endurance_enabled,
    objectives: profile.objectives,
    coach_notes: profile.coach_notes,
    ai_summary: profile.ai_profile?.summary ?? null,
    has_thresholds: profile.thresholds !== null,
    has_onboarding_form: profile.onboarding_form !== null,
    missing: profile.missing,
    note: 'Ficha completa, zonas y respuestas del cuestionario de alta en get_athlete_profile.',
  }
}

/** Lee todas las fuentes de la ficha del cliente, siempre dentro del espacio del entrenador. */
export async function loadAthleteProfile(db: Db, coachId: string, clientId: string, today: string) {
  const [clientResult, baselineResult, thresholdsResult, aiResult, onboardingResult] = await Promise.all([
    db.from('clients').select(CLIENT_COLUMNS).eq('id', clientId).eq('coach_id', coachId).maybeSingle(),
    db.from('athlete_baseline').select(BASELINE_COLUMNS).eq('client_id', clientId).maybeSingle(),
    db.from('athlete_thresholds').select(THRESHOLD_COLUMNS).eq('client_id', clientId).maybeSingle(),
    db.from('athlete_ai_profiles').select(AI_PROFILE_COLUMNS).eq('coach_id', coachId).eq('client_id', clientId).maybeSingle(),
    db.from('checkins').select('id, submitted_at, raw_payload, form_template_id')
      .eq('coach_id', coachId).eq('client_id', clientId).eq('type', 'onboarding').not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false }).limit(1),
  ])
  if (clientResult.error || !clientResult.data) throw new Error('Cliente no encontrado en el espacio del entrenador.')
  const failed = [baselineResult, thresholdsResult, aiResult, onboardingResult].find((result) => result.error)
  if (failed?.error) throw new Error('No se ha podido cargar la ficha completa del atleta.')

  const onboarding = (onboardingResult.data ?? [])[0] ?? null
  const hasMeasurements = Object.keys(onboarding?.raw_payload ?? {}).some((key) => key.startsWith('metric_'))
  const [template, definitions] = await Promise.all([
    onboarding?.form_template_id
      ? db.from('form_templates').select('id, title, schema').eq('id', onboarding.form_template_id).eq('coach_id', coachId).maybeSingle()
      : null,
    hasMeasurements ? db.from('metric_definitions').select('id, name, unit').eq('coach_id', coachId).limit(500) : null,
  ])
  // Sin plantilla o sin nombres de medidas las respuestas salen igual, con el identificador del campo.
  const onboardingTemplate = template && !template.error ? template.data ?? null : null
  const metricDefinitions = definitions && !definitions.error ? definitions.data ?? [] : []

  return buildAthleteProfile({
    client: clientResult.data,
    baseline: baselineResult.data ?? null,
    thresholds: thresholdsResult.data ?? null,
    aiProfile: aiResult.data ?? null,
    onboarding,
    onboardingTemplate,
    metricDefinitions,
  }, today)
}

export function registerProfileTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'get_athlete_profile',
    {
      title: 'Ver la ficha del atleta',
      description: 'Ficha del atleta: contacto, edad, sexo, altura, peso de referencia, VO2max, si es solo fuerza, objetivos y notas del entrenador, umbrales con zonas de FC, ritmo y potencia, perfil IA aprobado y respuestas del cuestionario de alta con sus etiquetas. missing indica qué datos faltan.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        coach_id: z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.'),
      }),
      annotations: readOnlyAnnotations,
    },
    ({ client_id, coach_id }: Row) => run('get_athlete_profile', {
      coachId: coach_id,
      clientId: client_id,
      fallbackError: 'No se ha podido cargar la ficha del atleta.',
    }, ({ coachId, today }) => loadAthleteProfile(db, coachId, client_id, today)),
  )
}
