import { z } from 'npm:zod@4.3.6'
import { cardioSessionMetrics } from '../../../src/lib/cardio/structure.js'
import {
  SEASON_DISCIPLINES,
  aggregateSeasonVolume,
  measureFor,
  seasonDiscipline,
  targetAmount,
  weekTiming,
} from '../../../src/lib/season/volume.js'
import { buildStrengthSchedule } from './schedule.ts'
import {
  addDays,
  allRows,
  createToolRunner,
  type Db,
  defaultHelpers,
  idempotentWriteAnnotations,
  isoDate,
  mondayOf,
  readOnlyAnnotations,
  type Row,
  rows,
  toUtcDate,
  type ToolHelpers,
  writeAnnotations,
} from './shared.ts'

// Plan de temporada (pestaña Temporada de la app): objetivo de volumen por
// semana y disciplina, con fases y tipo de semana. Programado y realizado se
// calculan con src/lib/season/volume.js, el mismo módulo que la app, para que
// las cifras coincidan con las de Temporada y Progreso.

type Server = any

const disciplineEnum = z.enum(['run', 'bike', 'swim', 'strength', 'other'])
const weekTypeEnum = z.enum(['carga', 'descarga', 'test', 'competicion', 'transicion'])
const phaseTypeEnum = z.enum(['base', 'construccion', 'especifico', 'taper', 'competicion', 'transicion'])
const optionalCoachId = z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.')

const targetValue = z.number().min(0).max(100000)
const MEASURE_HELP = 'Valores en la magnitud de cada disciplina: fuerza en sesiones; el resto en minutos (primary_unit time) o km (primary_unit distance).'

// { run: 180, bike: null } → null borra el objetivo de esa disciplina.
const targetsSchema = z.strictObject({
  run: targetValue.nullable().optional(),
  bike: targetValue.nullable().optional(),
  swim: targetValue.nullable().optional(),
  strength: targetValue.nullable().optional(),
  other: targetValue.nullable().optional(),
})

const weekChange = z.strictObject({
  week_number: z.number().int().min(1).max(60).optional().describe('Número de semana (1 = la primera). Indica week_number o week_start.'),
  week_start: isoDate.optional().describe('Lunes de la semana.'),
  week_type: weekTypeEnum.optional(),
  notes: z.string().trim().max(2000).nullable().optional().describe('null vacía la nota.'),
  targets: targetsSchema.optional().describe(`Objetivos de la semana; omitir una disciplina la conserva y null la borra. ${MEASURE_HELP}`),
}).refine((week) => week.week_number !== undefined || week.week_start !== undefined, 'Indica week_number o week_start.')

const phaseSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  phase_type: phaseTypeEnum,
  from_week: z.number().int().min(1).max(60).describe('Semana en que empieza la fase (1 = la primera).'),
  to_week: z.number().int().min(1).max(60).describe('Semana en que termina la fase (incluida).'),
  focus: z.string().trim().max(500).optional(),
})

// ---------------------------------------------------------------------------
// Lógica pura (exportada para las pruebas)
// ---------------------------------------------------------------------------

export function isMonday(date: string) {
  return toUtcDate(date).getUTCDay() === 1
}

export function weekStartOf(startDate: string, weekNumber: number) {
  return addDays(startDate, (weekNumber - 1) * 7)
}

export function targetList(targets: Row | undefined, { keepNull }: { keepNull: boolean }) {
  return Object.entries(targets ?? {})
    .filter(([, value]) => value !== undefined && (keepNull || value !== null))
    .map(([discipline, value]) => ({ discipline, value }))
}

/** Fases con semanas → fechas, validando que caben y no se solapan */
export function phasesToDates(phases: Row[], startDate: string, weekCount: number) {
  const sorted = [...phases].sort((a, b) => a.from_week - b.from_week)
  for (const [index, phase] of sorted.entries()) {
    if (phase.to_week < phase.from_week) throw new Error(`La fase «${phase.name}» termina antes de empezar.`)
    if (phase.to_week > weekCount) throw new Error(`La fase «${phase.name}» llega a la semana ${phase.to_week} y la temporada tiene ${weekCount}.`)
    if (index > 0 && phase.from_week <= sorted[index - 1].to_week) throw new Error('Las fases no pueden solaparse.')
  }
  return sorted.map((phase) => ({
    name: phase.name,
    phase_type: phase.phase_type,
    start_date: weekStartOf(startDate, phase.from_week),
    end_date: addDays(weekStartOf(startDate, phase.to_week), 6),
    focus: phase.focus ?? null,
  }))
}

/** Cambios de semanas → {week_start, ...} validando que pertenecen a la temporada */
export function normalizeWeekChanges(changes: Row[], startDate: string, weekCount: number, disciplines: string[]) {
  const seen = new Set<string>()
  return changes.map((change) => {
    const weekStart = change.week_start ?? weekStartOf(startDate, change.week_number)
    if (change.week_start && change.week_number !== undefined && weekStartOf(startDate, change.week_number) !== change.week_start) {
      throw new Error(`week_number ${change.week_number} no corresponde al lunes ${change.week_start}.`)
    }
    if (!isMonday(weekStart)) throw new Error(`La semana debe indicarse por su lunes; ${weekStart} no lo es (lunes: ${mondayOf(weekStart)}).`)
    const number = Math.round((toUtcDate(weekStart).getTime() - toUtcDate(startDate).getTime()) / (7 * 86_400_000)) + 1
    if (number < 1 || number > weekCount) throw new Error(`La semana del ${weekStart} está fuera de la temporada (${weekCount} semanas desde ${startDate}).`)
    if (seen.has(weekStart)) throw new Error(`La semana del ${weekStart} aparece dos veces.`)
    seen.add(weekStart)
    const targets = targetList(change.targets, { keepNull: true })
    const foreign = targets.find((target) => !disciplines.includes(target.discipline))
    if (foreign) throw new Error(`La disciplina ${foreign.discipline} no está en la temporada (${disciplines.join(', ')}).`)
    const normalized: Row = { week_start: weekStart, week_number: number }
    if (change.week_type !== undefined) normalized.week_type = change.week_type
    if (change.notes !== undefined) normalized.notes = change.notes
    if (change.targets !== undefined) normalized.targets = targets
    return normalized
  })
}

function phaseFor(phases: Row[], weekStart: string) {
  const weekEnd = addDays(weekStart, 6)
  return [...phases]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .find((phase) => phase.start_date <= weekEnd && phase.end_date >= weekStart) ?? null
}

function rounded(value: number | null | undefined, measure: string) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null
  return measure === 'km' ? Math.round(Number(value) * 10) / 10 : Math.round(Number(value))
}

/**
 * Vista de la temporada para el modelo: por semana y disciplina, objetivo,
 * programado y realizado en la magnitud de la disciplina; totales a la fecha.
 */
export function buildSeasonView(season: Row, volume: Row | null, today: string, filter: { from_date?: string; to_date?: string } = {}) {
  const disciplines = SEASON_DISCIPLINES.filter((discipline) => (season.disciplines ?? []).includes(discipline))
  const measures = Object.fromEntries(disciplines.map((discipline) => [discipline, measureFor(discipline, season.primary_unit)]))
  const phases = [...season.season_phases ?? []].sort((a: Row, b: Row) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.start_date.localeCompare(b.start_date))
  const allWeeks = [...season.season_weeks ?? []].sort((a: Row, b: Row) => a.week_start.localeCompare(b.week_start))

  const totals = Object.fromEntries(disciplines.map((discipline) => [discipline, {
    measure: measures[discipline], target_total: 0, target_to_date: 0, planned_total: 0, done_to_date: 0,
  }]))

  const weeks = allWeeks.map((week: Row, index: number) => {
    const timing = weekTiming(week.week_start, today)
    const targetsByDiscipline = new Map<string, Row>((week.season_week_targets ?? []).map((target: Row) => [target.discipline, target]))
    const cells = Object.fromEntries(disciplines.map((discipline) => {
      const measure = measures[discipline]
      const target = targetAmount(targetsByDiscipline.get(discipline), measure)
      const cell: Row = { target }
      const total = totals[discipline]
      if (target !== null) {
        total.target_total += target
        if (timing !== 'future') total.target_to_date += target
      }
      if (volume) {
        const value = volume[week.week_start]?.[discipline]
        cell.planned = rounded(value?.planned?.[measure] ?? 0, measure)
        cell.done = rounded(value?.done?.[measure] ?? 0, measure)
        if (value?.doneMissingData) cell.done_without_data = value.doneMissingData
        total.planned_total += cell.planned ?? 0
        if (timing !== 'future') total.done_to_date += cell.done ?? 0
      }
      return [discipline, cell]
    }))
    const phase = phaseFor(phases, week.week_start)
    return {
      week_number: index + 1,
      week_start: week.week_start,
      week_end: addDays(week.week_start, 6),
      week_type: week.week_type,
      notes: week.notes ?? null,
      timing,
      phase: phase?.name ?? null,
      disciplines: cells,
    }
  })

  for (const total of Object.values(totals) as Row[]) {
    for (const key of ['target_total', 'target_to_date', 'planned_total', 'done_to_date']) total[key] = rounded(total[key], total.measure)
    if (!volume) {
      delete total.planned_total
      delete total.done_to_date
    }
  }

  const current = weeks.find((week) => week.timing === 'current') ?? null
  const visible = weeks.filter((week) => (!filter.from_date || week.week_end >= filter.from_date) && (!filter.to_date || week.week_start <= filter.to_date))
  const event = Array.isArray(season.target_event) ? season.target_event[0] : season.target_event
  return {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      start_date: season.start_date,
      end_date: season.end_date,
      primary_unit: season.primary_unit,
      disciplines,
      notes: season.notes ?? null,
      target_event: event ? { id: event.id, title: event.title, event_date: event.event_date } : null,
      total_weeks: weeks.length,
      current_week_number: current?.week_number ?? null,
      updated_at: season.updated_at,
    },
    measures,
    phases: phases.map((phase: Row) => {
      const covered = weeks.filter((week) => week.week_end >= phase.start_date && week.week_start <= phase.end_date)
      return {
        name: phase.name, phase_type: phase.phase_type, start_date: phase.start_date, end_date: phase.end_date, focus: phase.focus ?? null,
        from_week: covered[0]?.week_number ?? null, to_week: covered[covered.length - 1]?.week_number ?? null,
      }
    }),
    weeks: visible,
    totals,
  }
}

function isEmptyStructure(value: unknown) {
  return value == null
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0)
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return value === null || value === undefined || !Number.isFinite(number) ? null : number
}

const PROGRAM_FIELDS = 'id, name, status, weeks, total_weeks, effective_from, effective_to, created_at, training_days(id, name, order_index, default_weekday)'

/** Programado y realizado del cliente por semana y disciplina, como loadVolume() en la app */
export async function loadSeasonVolume(db: Db, coachId: string, clientId: string, weekStarts: string[]) {
  if (!weekStarts.length) return {}
  const from = weekStarts[0]
  const to = addDays(weekStarts[weekStarts.length - 1], 6)
  const [cardio, strava, sessions, programsResult] = await Promise.all([
    allRows(() => db.from('cardio_sessions')
      .select('id, scheduled_date, activity_type, training_type, structure, planned_structure, target_distance_km, target_duration_min, is_completed, actual_distance_km, actual_duration_min, source_provider, strava_activity_id')
      .eq('coach_id', coachId).eq('client_id', clientId).gte('scheduled_date', from).lte('scheduled_date', to)
      .order('scheduled_date', { ascending: true }).order('id', { ascending: true }), 'las sesiones de cardio'),
    allRows(() => db.from('strava_activities')
      .select('id, start_date_local, sport_type, activity_type, distance_meters, moving_time_seconds, cardio_session_id, matched_planned_session_id, is_deleted')
      .eq('coach_id', coachId).eq('client_id', clientId).gte('start_date_local', `${from}T00:00:00`).lte('start_date_local', `${to}T23:59:59`)
      .order('start_date_local', { ascending: true }).order('id', { ascending: true }), 'las actividades de Strava'),
    allRows(() => db.from('scheduled_strength_sessions')
      .select('id, program_id, day_id, scheduled_date, is_completed')
      .eq('coach_id', coachId).eq('client_id', clientId).gte('scheduled_date', from).lte('scheduled_date', to)
      .order('scheduled_date', { ascending: true }).order('id', { ascending: true }), 'las sesiones de fuerza'),
    db.from('training_programs').select(PROGRAM_FIELDS)
      .eq('coach_id', coachId).eq('client_id', clientId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(10),
  ])
  const activePrograms = rows(programsResult, 'los programas de fuerza')
  const known = new Set(activePrograms.map((program) => program.id))
  const missingIds = [...new Set(sessions.map((session) => session.program_id))].filter((id) => id && !known.has(id))
  const otherPrograms = missingIds.length
    ? rows(await db.from('training_programs').select(PROGRAM_FIELDS).eq('coach_id', coachId).eq('client_id', clientId).in('id', missingIds), 'los programas de fuerza')
    : []

  const disciplineOf = (session: Row) => seasonDiscipline(session.activity_type, session.training_type, session.structure?.trainingType)
  // Una importación de Strava sin plan no es algo que el coach programara.
  const plannedCardio = cardio
    .filter((session) => session.source_provider !== 'strava' || !isEmptyStructure(session.planned_structure))
    .map((session) => {
      const metrics = cardioSessionMetrics(session)
      return { date: session.scheduled_date, discipline: disciplineOf(session), minutes: metrics.durationMin, km: metrics.distanceKm }
    })
  const doneCardio = cardio
    .filter((session) => session.is_completed || Number(session.actual_duration_min) > 0 || Number(session.actual_distance_km) > 0)
    .map((session) => ({
      id: session.id, date: session.scheduled_date, discipline: disciplineOf(session),
      minutes: numberOrNull(session.actual_duration_min), km: numberOrNull(session.actual_distance_km), stravaActivityId: session.strava_activity_id,
    }))
  const stravaActivities = strava
    .filter((activity) => !activity.is_deleted)
    .map((activity) => ({
      id: activity.id, date: String(activity.start_date_local).slice(0, 10), discipline: seasonDiscipline(activity.sport_type, activity.activity_type),
      minutes: Number(activity.moving_time_seconds) > 0 ? Number(activity.moving_time_seconds) / 60 : null,
      km: Number(activity.distance_meters) > 0 ? Number(activity.distance_meters) / 1000 : null,
      cardioSessionId: activity.cardio_session_id, matchedSessionId: activity.matched_planned_session_id,
    }))
  const plannedStrength = buildStrengthSchedule({
    activePrograms, programs: [...activePrograms, ...otherPrograms], sessions, startDate: from, endDate: to,
  }).map((item) => ({ date: item.date }))

  return aggregateSeasonVolume({
    weekStarts, plannedCardio, plannedStrength, doneCardio, stravaActivities,
    doneStrength: sessions.filter((session) => session.is_completed === true).map((session) => ({ date: session.scheduled_date })),
  })
}

const SEASON_SELECT = 'id, name, start_date, end_date, primary_unit, disciplines, status, notes, updated_at, target_event_id, target_event:client_events ( id, title, event_date ), season_weeks ( id, week_start, week_type, notes, season_week_targets ( discipline, target_minutes, target_km, target_sessions ) ), season_phases ( name, phase_type, start_date, end_date, focus, sort_order )'

// P0001 y 42501 son los mensajes propios de las funciones SQL; el resto se oculta.
function rpcError(error: any, fallback: string) {
  return new Error(error && ['P0001', '42501'].includes(error.code) ? error.message : fallback)
}

async function loadSeason(db: Db, coachId: string, clientId: string, seasonId?: string) {
  let query = db.from('season_plans').select(SEASON_SELECT).eq('coach_id', coachId).eq('client_id', clientId)
  query = seasonId ? query.eq('id', seasonId) : query.eq('status', 'active')
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error('No se ha podido cargar la temporada.')
  if (!data && seasonId) throw new Error('Temporada no encontrada en este cliente.')
  return data as Row | null
}

/** Aplica cambios de semanas sobre la temporada leída, para previsualizar sin guardar */
export function applyWeekChangesPreview(season: Row, changes: Row[]) {
  const weeks = (season.season_weeks ?? []).map((week: Row) => ({ ...week, season_week_targets: [...week.season_week_targets ?? []] }))
  for (const change of changes) {
    const week = weeks.find((item: Row) => item.week_start === change.week_start)
    if (!week) continue
    if (change.week_type !== undefined) week.week_type = change.week_type
    if (change.notes !== undefined) week.notes = change.notes?.trim() || null
    for (const target of change.targets ?? []) {
      week.season_week_targets = week.season_week_targets.filter((item: Row) => item.discipline !== target.discipline)
      if (target.value !== null) {
        const measure = measureFor(target.discipline, season.primary_unit)
        week.season_week_targets.push({
          discipline: target.discipline,
          target_minutes: measure === 'minutes' ? Math.round(target.value) : null,
          target_km: measure === 'km' ? Math.round(target.value * 10) / 10 : null,
          target_sessions: measure === 'sessions' ? Math.round(target.value) : null,
        })
      }
    }
  }
  return { ...season, season_weeks: weeks }
}

// ---------------------------------------------------------------------------
// Herramientas
// ---------------------------------------------------------------------------

export function registerSeasonTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool('get_season_plan', {
    title: 'Ver plan de temporada',
    description: `Temporada del cliente (la activa o la indicada): fases, tipo de cada semana (carga, descarga, test, competicion, transicion) y, por semana y disciplina, objetivo, programado y realizado, con totales a la fecha. ${MEASURE_HELP} Si no hay temporada activa devuelve season null, el historial de temporadas y los próximos eventos que pueden ser su objetivo. Usa season.updated_at como expected_updated_at para editar.`,
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      season_id: z.string().uuid().optional().describe('Temporada concreta (también archivadas o en borrador); por defecto, la activa.'),
      include_volume: z.boolean().default(true).describe('Calcular programado y realizado (más lento). false devuelve solo objetivos.'),
      from_date: isoDate.optional().describe('Mostrar solo las semanas desde esta fecha.'),
      to_date: isoDate.optional().describe('Mostrar solo las semanas hasta esta fecha.'),
    }),
    annotations: readOnlyAnnotations,
  }, (input: Row) => run('get_season_plan', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido cargar la temporada.' },
    async ({ coachId, today, log }) => {
      const [season, history, events] = await Promise.all([
        loadSeason(db, coachId, input.client_id, input.season_id),
        db.from('season_plans').select('id, name, status, start_date, end_date, updated_at')
          .eq('coach_id', coachId).eq('client_id', input.client_id).order('start_date', { ascending: false }).limit(20),
        db.from('client_events').select('id, title, event_date, event_type, priority')
          .eq('coach_id', coachId).eq('client_id', input.client_id).eq('status', 'planned').gte('event_date', today)
          .order('event_date', { ascending: true }).limit(20),
      ])
      const seasons = rows(history, 'las temporadas')
      const upcomingEvents = rows(events, 'los eventos')
      if (!season) {
        log.result_count = 0
        return {
          client_id: input.client_id, today, season: null, seasons, upcoming_events: upcomingEvents,
          note: 'Este cliente no tiene temporada activa. Créala con create_season_plan (puedes usar dry_run para previsualizarla).',
        }
      }
      const weekStarts = (season.season_weeks ?? []).map((week: Row) => week.week_start).sort()
      const volume = input.include_volume ? await loadSeasonVolume(db, coachId, input.client_id, weekStarts) : null
      const view = buildSeasonView(season, volume, today, { from_date: input.from_date, to_date: input.to_date })
      log.record_id = season.id
      log.result_count = view.weeks.length
      return { client_id: input.client_id, today, ...view, seasons, upcoming_events: upcomingEvents }
    }))

  server.registerTool('create_season_plan', {
    title: 'Crear plan de temporada',
    description: `Crea la temporada de un cliente en una sola transacción: semanas desde un lunes, disciplinas, volumen base para todas las semanas, progresión por semana (week_changes: objetivos, tipo y notas) y fases por número de semana. ${MEASURE_HELP} Solo puede haber una temporada activa: si ya existe, falla salvo replace_active (que la archiva). Usa dry_run para enseñarme la temporada completa sin guardar y créala solo cuando la confirme.`,
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      start_date: isoDate.describe('Lunes de la primera semana.'),
      weeks: z.number().int().min(1).max(60),
      primary_unit: z.enum(['time', 'distance']).default('time').describe('time: objetivos de cardio en minutos (recomendado si hay varias disciplinas); distance: en km.'),
      disciplines: z.array(disciplineEnum).min(1).max(5),
      target_event_id: z.string().uuid().optional().describe('Evento objetivo (list_client_events o get_season_plan.upcoming_events).'),
      notes: z.string().trim().max(2000).optional(),
      status: z.enum(['active', 'draft']).default('active').describe('La app muestra la temporada activa; draft queda guardada sin mostrarse.'),
      replace_active: z.boolean().default(false).describe('Archivar la temporada activa actual del cliente.'),
      base_targets: targetsSchema.optional().describe(`Objetivo igual para todas las semanas. ${MEASURE_HELP}`),
      week_changes: z.array(weekChange).max(60).optional().describe('Ajustes por semana sobre el volumen base: progresión, descargas, tests y competición.'),
      phases: z.array(phaseSchema).max(12).optional(),
      dry_run: z.boolean().default(false).describe('true: valida y devuelve la temporada resultante sin guardar.'),
    }),
    annotations: writeAnnotations,
  }, (input: Row) => run('create_season_plan', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido crear la temporada.' },
    async ({ coachId, today, log }) => {
      if (!isMonday(input.start_date)) throw new Error(`La temporada empieza en lunes; ${input.start_date} no lo es (lunes de esa semana: ${mondayOf(input.start_date)}).`)
      const disciplines = [...new Set(input.disciplines as string[])]
      const base = targetList(input.base_targets, { keepNull: false })
      const foreign = base.find((target) => !disciplines.includes(target.discipline))
      if (foreign) throw new Error(`La disciplina ${foreign.discipline} no está en la temporada (${disciplines.join(', ')}).`)
      const weekChanges = normalizeWeekChanges(input.week_changes ?? [], input.start_date, input.weeks, disciplines)
      const phases = phasesToDates(input.phases ?? [], input.start_date, input.weeks)
      const payload = {
        name: input.name, start_date: input.start_date, weeks: input.weeks, primary_unit: input.primary_unit, disciplines,
        target_event_id: input.target_event_id ?? null, notes: input.notes ?? null, status: input.status,
        replace_active: input.replace_active, base_targets: base, week_changes: weekChanges, phases,
      }

      if (input.dry_run) {
        // Misma temporada que se guardaría, con la vista de get_season_plan y sin programado ni realizado.
        const preview: Row = {
          id: null, name: input.name, start_date: input.start_date, end_date: addDays(input.start_date, input.weeks * 7 - 1),
          primary_unit: input.primary_unit, disciplines, status: input.status, notes: input.notes ?? null, updated_at: null,
          season_phases: phases.map((phase, index) => ({ ...phase, sort_order: index + 1 })),
          season_weeks: Array.from({ length: input.weeks }, (_, index) => ({
            week_start: weekStartOf(input.start_date, index + 1), week_type: 'carga', notes: null, season_week_targets: [],
          })),
        }
        const withBase = applyWeekChangesPreview(preview, preview.season_weeks.map((week: Row) => ({ week_start: week.week_start, targets: base })))
        const view = buildSeasonView(applyWeekChangesPreview(withBase, weekChanges), null, today)
        const { data: active } = await db.from('season_plans').select('id, name').eq('coach_id', coachId).eq('client_id', input.client_id).eq('status', 'active').maybeSingle()
        return {
          saved: false, ...view,
          warnings: active && input.status === 'active'
            ? [input.replace_active ? `Al guardar se archivará la temporada activa «${active.name}».` : `Ya hay una temporada activa («${active.name}»): guardar fallará salvo replace_active.`]
            : [],
        }
      }

      const { data, error } = await db.rpc('create_nexttrain_season_plan', { p_coach_id: coachId, p_client_id: input.client_id, p_payload: payload })
      if (error || !data?.id) throw rpcError(error, 'No se ha podido crear la temporada. No se guardó ningún cambio.')
      log.record_id = data.id
      return {
        created: true,
        season: { id: data.id, name: data.name, status: data.status, start_date: data.start_date, end_date: data.end_date, updated_at: data.updated_at },
        week_count: data.week_count, target_count: data.target_count, phase_count: data.phase_count,
        archived_season_ids: data.archived_season_ids ?? [],
        note: 'Usa get_season_plan para ver la temporada con programado y realizado.',
      }
    }))

  server.registerTool('update_season_plan', {
    title: 'Editar plan de temporada',
    description: 'Cambia nombre, notas, evento objetivo, estado (active, draft, archived), disciplinas, duración o fases de una temporada en una sola transacción. Quitar una disciplina borra sus objetivos; alargar añade semanas de carga al final y acortar borra las últimas; phases sustituye todas las fases ([] las quita). Para objetivos, tipo o notas de semanas usa update_season_weeks. Lee antes get_season_plan y envía expected_updated_at. Con dry_run devuelve lo que cambiaría sin guardar.',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      season_id: z.string().uuid(),
      expected_updated_at: z.string().datetime({ offset: true }).describe('season.updated_at de get_season_plan.'),
      name: z.string().trim().min(1).max(120).optional(),
      notes: z.string().trim().max(2000).nullable().optional().describe('null vacía las notas.'),
      target_event_id: z.string().uuid().nullable().optional().describe('null quita el evento objetivo.'),
      status: z.enum(['active', 'draft', 'archived']).optional(),
      replace_active: z.boolean().default(false).describe('Al activarla, archivar la otra temporada activa del cliente.'),
      disciplines: z.array(disciplineEnum).min(1).max(5).optional(),
      weeks: z.number().int().min(1).max(60).optional(),
      phases: z.array(phaseSchema).max(12).optional(),
      dry_run: z.boolean().default(false),
    }).refine((input) => ['name', 'notes', 'target_event_id', 'status', 'disciplines', 'weeks', 'phases'].some((key) => (input as Row)[key] !== undefined), 'No hay cambios que guardar.'),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_season_plan', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido editar la temporada.' },
    async ({ coachId, log }) => {
      log.record_id = input.season_id
      const season = await loadSeason(db, coachId, input.client_id, input.season_id) as Row
      if (season.updated_at !== input.expected_updated_at && new Date(season.updated_at).getTime() !== new Date(input.expected_updated_at).getTime()) {
        throw new Error('La temporada cambió; vuelve a leer get_season_plan.')
      }
      const weekCount = input.weeks ?? (season.season_weeks ?? []).length
      const payload: Row = { expected_updated_at: input.expected_updated_at, replace_active: input.replace_active }
      for (const key of ['name', 'notes', 'target_event_id', 'status', 'weeks']) if (input[key] !== undefined) payload[key] = input[key]
      if (input.disciplines !== undefined) payload.disciplines = [...new Set(input.disciplines as string[])]
      if (input.phases !== undefined) payload.phases = phasesToDates(input.phases, season.start_date, weekCount)

      if (input.dry_run) {
        const removedDisciplines = payload.disciplines ? (season.disciplines as string[]).filter((item) => !payload.disciplines.includes(item)) : []
        const removedTargets = (season.season_weeks ?? []).reduce((sum: number, week: Row) => sum + (week.season_week_targets ?? [])
          .filter((target: Row) => removedDisciplines.includes(target.discipline) || weekStartIndex(season, week.week_start) > weekCount).length, 0)
        const currentWeeks = (season.season_weeks ?? []).length
        return {
          saved: false,
          changes: payload,
          effects: {
            removed_disciplines: removedDisciplines,
            removed_targets: removedTargets,
            added_weeks: Math.max(0, weekCount - currentWeeks),
            removed_weeks: Math.max(0, currentWeeks - weekCount),
            new_end_date: addDays(season.start_date, weekCount * 7 - 1),
          },
        }
      }

      const { data, error } = await db.rpc('update_nexttrain_season_plan', {
        p_coach_id: coachId, p_client_id: input.client_id, p_season_id: input.season_id, p_payload: payload,
      })
      if (error || !data?.id) throw rpcError(error, 'No se ha podido editar la temporada. No se guardó ningún cambio.')
      return {
        updated: true,
        season: { id: data.id, name: data.name, status: data.status, start_date: data.start_date, end_date: data.end_date, disciplines: data.disciplines, updated_at: data.updated_at },
        week_count: data.week_count, target_count: data.target_count, phase_count: data.phase_count,
        removed_weeks: data.removed_weeks ?? 0, removed_targets: data.removed_targets ?? 0,
        archived_season_ids: data.archived_season_ids ?? [],
      }
    }))

  server.registerTool('update_season_weeks', {
    title: 'Editar semanas de la temporada',
    description: `Cambia objetivos, tipo (carga, descarga, test, competicion, transicion) y notas de una o varias semanas en una sola transacción: progresiones, descargas, semanas de test o de competición. ${MEASURE_HELP} En targets, omitir una disciplina la conserva y null borra su objetivo. Lee antes get_season_plan y envía expected_updated_at. Con dry_run devuelve las semanas resultantes (antes y después) sin guardar.`,
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      season_id: z.string().uuid(),
      expected_updated_at: z.string().datetime({ offset: true }).describe('season.updated_at de get_season_plan.'),
      weeks: z.array(weekChange).min(1).max(60),
      dry_run: z.boolean().default(false),
    }),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_season_weeks', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se han podido editar las semanas.' },
    async ({ coachId, today, log }) => {
      log.record_id = input.season_id
      const season = await loadSeason(db, coachId, input.client_id, input.season_id) as Row
      if (season.updated_at !== input.expected_updated_at && new Date(season.updated_at).getTime() !== new Date(input.expected_updated_at).getTime()) {
        throw new Error('La temporada cambió; vuelve a leer get_season_plan.')
      }
      const changes = normalizeWeekChanges(input.weeks, season.start_date, (season.season_weeks ?? []).length, season.disciplines)

      if (input.dry_run) {
        const changed = new Set(changes.map((change) => change.week_start))
        const pick = (view: Row) => view.weeks.filter((week: Row) => changed.has(week.week_start))
        return {
          saved: false,
          before: pick(buildSeasonView(season, null, today)),
          after: pick(buildSeasonView(applyWeekChangesPreview(season, changes), null, today)),
        }
      }

      const { data, error } = await db.rpc('update_nexttrain_season_plan', {
        p_coach_id: coachId, p_client_id: input.client_id, p_season_id: input.season_id,
        p_payload: { expected_updated_at: input.expected_updated_at, week_changes: changes },
      })
      if (error || !data?.id) throw rpcError(error, 'No se han podido editar las semanas. No se guardó ningún cambio.')
      log.result_count = changes.length
      return {
        updated: true,
        season: { id: data.id, name: data.name, status: data.status, updated_at: data.updated_at },
        changed_weeks: changes.map((change) => change.week_number),
        target_count: data.target_count,
        note: 'Usa get_season_plan para ver el resultado con programado y realizado.',
      }
    }))
}

function weekStartIndex(season: Row, weekStart: string) {
  return Math.round((toUtcDate(weekStart).getTime() - toUtcDate(season.start_date).getTime()) / (7 * 86_400_000)) + 1
}
