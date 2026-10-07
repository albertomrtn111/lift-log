import { z } from 'npm:zod@4.3.6'

type Db = any
type Server = any
type Row = Record<string, any>

type Helpers = {
  resolveCoach: (db: Db, coachId?: string) => Promise<{ coachId: string; role: string }>
  requireClient: (db: Db, coachId: string, clientId: string) => Promise<Row>
  jsonResult: (data: unknown) => unknown
  toolError: (message: string) => unknown
  audit: (tool: string, details: Record<string, unknown>) => void
  annotations: Record<string, boolean>
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Fecha inválida; usa YYYY-MM-DD')
const clientIdSchema = z.string().uuid()
const coachIdSchema = z.string().uuid().optional().describe('Indícalo si tienes acceso a varios espacios de entrenamiento.')
const historyDates = {
  from_date: dateSchema.optional(),
  to_date: dateSchema.optional(),
}

function day(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return day(date)
}

function dateRange(from?: string, to?: string, defaultDays = 90, maxDays = 730) {
  const end = to ?? day(new Date())
  const start = from ?? addDays(end, 1 - defaultDays)
  const length = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
  if (length < 0 || length > maxDays) throw new Error(`El rango debe estar ordenado y no superar ${maxDays} días.`)
  return { from_date: start, to_date: end, end_exclusive: `${addDays(end, 1)}T00:00:00Z` }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function rounded(value: number, decimals = 2) {
  return Number(value.toFixed(decimals))
}

function rows(result: { data: Row[] | null; error: { message?: string } | null }, label: string): Row[] {
  if (result.error) throw new Error(`No se han podido cargar ${label}.`)
  return result.data ?? []
}

function object(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function fieldLabels(schema: unknown): Map<string, string> {
  const labels = new Map<string, string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const item = value as Row
    if (typeof item.id === 'string' && typeof item.label === 'string') labels.set(item.id, item.label)
    for (const nested of Object.values(item)) if (nested && typeof nested === 'object') visit(nested)
  }
  visit(schema)
  return labels
}

function lapSummary(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 80).map((lap, index) => {
    const item = object(lap)
    return {
      lap: num(item.lap_index) ?? index + 1,
      distance_km: num(item.distance) === null ? null : rounded(Number(item.distance) / 1000, 3),
      moving_time_s: num(item.moving_time),
      elapsed_time_s: num(item.elapsed_time),
      avg_heart_rate: num(item.average_heartrate),
      max_heart_rate: num(item.max_heartrate),
      elevation_gain_m: num(item.total_elevation_gain),
      average_speed_mps: num(item.average_speed),
    }
  })
}

function eventDistance(event: Row) {
  // La tabla no tiene distancia estructurada. Extraemos solo una cantidad explícita.
  const match = `${event.title ?? ''} ${event.target ?? ''} ${event.notes ?? ''}`.match(/\b(\d+(?:[.,]\d+)?)\s*(km|kil[oó]metros|m)\b/i)
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  return match[2].toLowerCase() === 'm' ? rounded(value / 1000, 3) : value
}

function mondayOf(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return day(date)
}

function scheduledSetDate(program: Row | undefined, trainingDay: Row | undefined, weekIndex: number | null) {
  if (!program?.effective_from || !trainingDay?.default_weekday || !weekIndex || weekIndex < 1) return null
  return addDays(mondayOf(program.effective_from), (weekIndex - 1) * 7 + trainingDay.default_weekday - 1)
}

async function strengthContext(db: Db, coachId: string, clientId: string, programId?: string, programOffset = 0, programLimit = 30) {
  let query = db.from('training_programs').select('id, name, status, weeks, total_weeks, effective_from, effective_to, created_at')
    .eq('coach_id', coachId).eq('client_id', clientId).order('created_at', { ascending: false }).order('id', { ascending: true })
  if (programId) query = query.eq('id', programId).limit(1)
  else query = query.range(programOffset, programOffset + programLimit)
  const allPrograms = rows(await query, 'los programas de fuerza')
  if (programId && allPrograms.length === 0) throw new Error('Programa no encontrado en el espacio del entrenador.')
  const hasMorePrograms = !programId && allPrograms.length > programLimit
  const programs = allPrograms.slice(0, programLimit)
  const programIds = programs.map((item) => item.id)
  const days = await inBatches(db, 'training_days', 'id, program_id, name, default_weekday, order_index', 'program_id', programIds,
    (q) => q.eq('coach_id', coachId).order('order_index', { ascending: true }))
  const exercises = await inBatches(db, 'training_exercises', 'id, program_id, day_id, exercise_name, muscle_group, order_index, sets, reps, rir, rest_seconds, notes', 'program_id', programIds,
    (q) => q.eq('coach_id', coachId).order('order_index', { ascending: true }))
  return { programs, days, exercises, hasMorePrograms }
}

async function completedStrengthRows(db: Db, coachId: string, clientId: string, context: Awaited<ReturnType<typeof strengthContext>>, range?: ReturnType<typeof dateRange>) {
  const programIds = context.programs.map((item) => item.id)
  const exerciseIds = context.exercises.map((item) => item.id)
  const [setRows, logRows, sessions] = await Promise.all([
    inBatches(db, 'training_exercise_sets', 'id, exercise_id, week_index, set_index, weight_kg, reps, rir, completed, notes, updated_at', 'exercise_id', exerciseIds,
      (q) => {
        let filtered = q.eq('completed', true).order('updated_at', { ascending: false })
        if (range) filtered = filtered.gte('updated_at', `${range.from_date}T00:00:00Z`).lt('updated_at', range.end_exclusive)
        return filtered
      }),
    inBatches(db, 'training_exercise_logs', 'id, program_id, day_id, exercise_id, week_index, performed_at, sets, notes, updated_at', 'program_id', programIds,
      (q) => {
        let filtered = q.eq('coach_id', coachId).eq('client_id', clientId).order('updated_at', { ascending: false })
        if (range) filtered = filtered.gte('updated_at', `${range.from_date}T00:00:00Z`).lt('updated_at', range.end_exclusive)
        return filtered
      }),
    inBatches(db, 'scheduled_strength_sessions', 'id, program_id, day_id, scheduled_date, is_completed', 'program_id', programIds,
      (q) => {
        let filtered = q.eq('coach_id', coachId).eq('client_id', clientId).order('scheduled_date', { ascending: false })
        if (range) filtered = filtered.gte('scheduled_date', range.from_date).lte('scheduled_date', range.to_date)
        return filtered
      }),
  ])
  const programById = new Map(context.programs.map((item) => [item.id, item]))
  const dayById = new Map(context.days.map((item) => [item.id, item]))
  const exerciseById = new Map(context.exercises.map((item) => [item.id, item]))
  const results: Row[] = []
  for (const set of setRows) {
    const exercise = exerciseById.get(set.exercise_id)
    if (!exercise) continue
    const program = programById.get(exercise.program_id)
    const trainingDay = dayById.get(exercise.day_id)
    results.push({
      source: 'completed_set', id: set.id, program_id: exercise.program_id, program_name: program?.name,
      day_id: exercise.day_id, day_name: trainingDay?.name, exercise_id: exercise.id, exercise: exercise.exercise_name,
      week_index: set.week_index, set_index: set.set_index, scheduled_date: scheduledSetDate(program, trainingDay, num(set.week_index)),
      performed_at: null, recorded_at: set.updated_at, weight_kg: num(set.weight_kg), reps: num(set.reps),
      rir: num(set.rir), rpe: null, completed: true, notes: set.notes,
    })
  }
  for (const log of logRows) {
    const exercise = exerciseById.get(log.exercise_id)
    if (!exercise) continue
    const program = programById.get(exercise.program_id)
    const trainingDay = dayById.get(exercise.day_id)
    const loggedSets = Array.isArray(log.sets) ? log.sets : []
    for (const [index, rawSet] of loggedSets.entries()) {
      const set = object(rawSet)
      results.push({
        source: 'exercise_log', id: `${log.id}:${index}`, program_id: exercise.program_id, program_name: program?.name,
        day_id: exercise.day_id, day_name: trainingDay?.name, exercise_id: exercise.id, exercise: exercise.exercise_name,
        week_index: log.week_index, set_index: num(set.set) ?? index + 1,
        scheduled_date: scheduledSetDate(program, trainingDay, num(log.week_index)),
        performed_at: log.performed_at, recorded_at: log.updated_at,
        weight_kg: num(set.weight_kg ?? set.weight), reps: num(set.reps), rir: num(set.rir), rpe: num(set.rpe),
        completed: set.completed ?? null, notes: set.notes ?? log.notes,
      })
    }
  }
  results.sort((a, b) => String(b.performed_at ?? b.recorded_at).localeCompare(String(a.performed_at ?? a.recorded_at)))
  return { results, sessions, source_counts: { completed_sets: setRows.length, exercise_logs: logRows.length } }
}

async function inBatches(db: Db, table: string, select: string, field: string, ids: string[], configure?: (query: any) => any) {
  const result: Row[] = []
  for (let index = 0; index < ids.length; index += 60) {
    const batch = ids.slice(index, index + 60)
    result.push(...await allRows(() => {
      let query = db.from(table).select(select).in(field, batch)
      if (configure) query = configure(query)
      return query.order('id', { ascending: true })
    }, table))
  }
  return result
}

async function allRows(makeQuery: () => any, label: string) {
  const result: Row[] = []
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const page = rows(await makeQuery().range(offset, offset + 999), label)
    result.push(...page)
    if (page.length < 1000) return result
  }
  throw new Error(`La consulta de ${label} es demasiado amplia. Acota el rango de fechas o el programa.`)
}

export function registerHistoryTools(server: Server, db: Db, helpers: Helpers) {
  const { resolveCoach, requireClient, jsonResult, toolError, audit, annotations } = helpers
  const scoped = async (tool: string, clientId: string, requestedCoachId: string | undefined, run: (coachId: string) => Promise<unknown>) => {
    try {
      const { coachId } = await resolveCoach(db, requestedCoachId)
      await requireClient(db, coachId, clientId)
      const result = await run(coachId)
      audit(tool, { coach_id: coachId, client_id: clientId, status: 'ok' })
      return jsonResult(result)
    } catch (error) {
      audit(tool, { client_id: clientId, status: 'error' })
      return toolError(error instanceof Error ? error.message : 'No se han podido cargar los datos del cliente.')
    }
  }

  server.registerTool('get_body_history', {
    title: 'Histórico corporal',
    description: 'Peso diario, media semanal calculada con pesajes, peso medio del check-in y medidas corporales con nombre. Acepta hasta dos años.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, ...historyDates }),
    annotations,
  }, async ({ client_id, coach_id, from_date, to_date }: any) => scoped('get_body_history', client_id, coach_id, async (coachId) => {
    const range = dateRange(from_date, to_date, 180)
    const [dailyResult, checkinResult, definitionsResult] = await Promise.all([
      db.from('client_metrics').select('metric_date, weight_kg, notes').eq('coach_id', coachId).eq('client_id', client_id)
        .gte('metric_date', range.from_date).lte('metric_date', range.to_date).order('metric_date', { ascending: true }).limit(1000),
      db.from('checkins').select('id, submitted_at, period_start, period_end, weight_kg, weight_avg_kg, raw_payload')
        .eq('coach_id', coachId).eq('client_id', client_id).not('submitted_at', 'is', null)
        .gte('submitted_at', `${range.from_date}T00:00:00Z`).lt('submitted_at', range.end_exclusive)
        .order('submitted_at', { ascending: true }).limit(500),
      db.from('metric_definitions').select('id, name, unit, category').eq('coach_id', coachId).limit(500),
    ])
    const daily = rows(dailyResult, 'los pesos diarios')
    const checkins = rows(checkinResult, 'las medidas corporales')
    const definitions = rows(definitionsResult, 'los nombres de las medidas')
    const byId = new Map(definitions.map((item) => [item.id, item]))
    const weeks = new Map<string, number[]>()
    for (const record of daily) {
      const weight = num(record.weight_kg)
      if (weight === null) continue
      const date = new Date(`${record.metric_date}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
      const monday = day(date)
      weeks.set(monday, [...(weeks.get(monday) ?? []), weight])
    }
    const weekly = [...weeks.entries()].map(([week_start, weights]) => ({
      week_start, average_weight_kg: rounded(weights.reduce((a, b) => a + b, 0) / weights.length), weigh_ins: weights.length,
    }))
    const snapshots = checkins.map((item) => {
      const payload = object(item.raw_payload)
      const measurements = Object.entries(payload).filter(([key, value]) => key.startsWith('metric_') && num(value) !== null)
        .map(([key, value]) => {
          const definition = byId.get(key.slice(7))
          return { metric_id: key.slice(7), name: definition?.name ?? key, value: num(value), unit: definition?.unit ?? null }
        })
      const waist = measurements.find((m) => /cintura|waist/i.test(m.name))
      const bodyFat = measurements.find((m) => /(?:grasa|body.?fat)/i.test(m.name))
      return {
        checkin_id: item.id, date: day(item.submitted_at), period_start: item.period_start, period_end: item.period_end,
        weight_kg: num(item.weight_kg), reported_weekly_average_weight_kg: num(item.weight_avg_kg),
        waist_cm: waist?.value ?? num(payload.waist_cm), body_fat_pct: bodyFat?.value ?? num(payload.body_fat_pct), measurements,
      }
    })
    return {
      client_id, ...range, daily_weights: daily.map((item) => ({ date: item.metric_date, weight_kg: num(item.weight_kg), notes: item.notes })),
      calculated_weekly_averages: weekly, checkin_measurements: snapshots,
      note: 'La media calculada usa únicamente los pesajes diarios disponibles; la media declarada en cada check-in se muestra aparte.',
    }
  }))

  server.registerTool('get_checkins', {
    title: 'Check-ins y formularios completos',
    description: 'Devuelve respuestas originales del formulario, etiquetas de sus campos y revisión del entrenador. Usa checkin_id para una revisión concreta.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, checkin_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(3), offset: z.number().int().min(0).max(500).default(0) }),
    annotations,
  }, async ({ client_id, coach_id, checkin_id, limit, offset }: any) => scoped('get_checkins', client_id, coach_id, async (coachId) => {
    let query = db.from('checkins').select('id, type, status, created_at, submitted_at, period_start, period_end, weight_kg, weight_avg_kg, steps_avg, training_adherence_pct, nutrition_adherence_pct, sleep_avg_h, energy, hunger, stress, performance, injuries, notes, raw_payload, form_template_id, review_template_id')
      .eq('coach_id', coachId).eq('client_id', client_id).not('submitted_at', 'is', null)
    if (checkin_id) query = query.eq('id', checkin_id)
    else query = query.order('submitted_at', { ascending: false }).range(offset, offset + limit)
    const checkins = rows(await query, 'los check-ins')
    const templateIds = [...new Set(checkins.map((item) => item.form_template_id).filter(Boolean))]
    const ids = checkins.map((item) => item.id)
    const [templates, reviews] = await Promise.all([
      inBatches(db, 'form_templates', 'id, title, type, schema', 'id', templateIds, (q) => q.eq('coach_id', coachId)),
      inBatches(db, 'reviews', 'id, checkin_id, status, summary, analysis, message_to_client, ai_summary, created_at', 'checkin_id', ids, (q) => q.eq('coach_id', coachId).eq('client_id', client_id)),
    ])
    const templateById = new Map(templates.map((item) => [item.id, item]))
    const reviewByCheckin = new Map(reviews.map((item) => [item.checkin_id, item]))
    const mapped = checkins.slice(0, checkin_id ? 1 : limit).map((item) => {
      const template = templateById.get(item.form_template_id)
      const labels = fieldLabels(template?.schema)
      const payload = object(item.raw_payload)
      return {
        ...item, form_template: template ?? null, review: reviewByCheckin.get(item.id) ?? null,
        answers: Object.entries(payload).map(([field_id, value]) => ({ field_id, label: labels.get(field_id) ?? field_id, value })),
      }
    })
    return { client_id, checkins: mapped, has_more: !checkin_id && checkins.length > limit, next_offset: !checkin_id && checkins.length > limit ? offset + limit : null }
  }))

  server.registerTool('get_current_nutrition', {
    title: 'Nutrición vigente',
    description: 'Objetivo vigente de calorías y macronutrientes, fechas de validez y plan de dieta activo si existe.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, on_date: dateSchema.optional() }),
    annotations,
  }, async ({ client_id, coach_id, on_date }: any) => scoped('get_current_nutrition', client_id, coach_id, async (coachId) => {
    const date = on_date ?? day(new Date())
    const [macrosResult, dietsResult] = await Promise.all([
      db.from('macro_plans').select('id, name, kcal, protein_g, carbs_g, fat_g, steps, day_type_config, effective_from, effective_to, notes')
        .eq('coach_id', coachId).eq('client_id', client_id).lte('effective_from', date)
        .or(`effective_to.is.null,effective_to.gte.${date}`).order('effective_from', { ascending: false }).limit(1),
      db.from('diet_plans').select('id, name, type, status, effective_from, effective_to, notes')
        .eq('coach_id', coachId).eq('client_id', client_id).eq('status', 'active').lte('effective_from', date)
        .or(`effective_to.is.null,effective_to.gte.${date}`).order('effective_from', { ascending: false }).limit(1),
    ])
    const macro = rows(macrosResult, 'los objetivos nutricionales')[0] ?? null
    const diet = rows(dietsResult, 'los planes de dieta')[0] ?? null
    return {
      client_id, on_date: date,
      macro_target: macro ? { ...macro, kcal: num(macro.kcal), protein_g: num(macro.protein_g), carbs_g: num(macro.carbs_g), fat_g: num(macro.fat_g) } : null,
      active_diet_plan: diet,
      note: macro ? null : 'No hay objetivo de macronutrientes vigente; no se infieren calorías a partir del nombre de los alimentos.',
    }
  }))

  server.registerTool('get_recovery_history', {
    title: 'Recuperación y fatiga',
    description: 'Sueño y pasos diarios junto con energía, estrés, hambre, rendimiento y molestias comunicadas en check-ins. No inventa una puntuación de recuperación.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, ...historyDates }),
    annotations,
  }, async ({ client_id, coach_id, from_date, to_date }: any) => scoped('get_recovery_history', client_id, coach_id, async (coachId) => {
    const range = dateRange(from_date, to_date, 90)
    const [metricsResult, checkinsResult] = await Promise.all([
      db.from('client_metrics').select('metric_date, sleep_h, steps, notes').eq('coach_id', coachId).eq('client_id', client_id)
        .gte('metric_date', range.from_date).lte('metric_date', range.to_date).order('metric_date', { ascending: true }).limit(1000),
      db.from('checkins').select('id, submitted_at, period_start, period_end, sleep_avg_h, energy, stress, hunger, performance, injuries, training_adherence_pct, notes')
        .eq('coach_id', coachId).eq('client_id', client_id).not('submitted_at', 'is', null)
        .gte('submitted_at', `${range.from_date}T00:00:00Z`).lt('submitted_at', range.end_exclusive)
        .order('submitted_at', { ascending: true }).limit(500),
    ])
    return {
      client_id, ...range,
      daily_progress: rows(metricsResult, 'el progreso diario').map((item) => ({ date: item.metric_date, sleep_hours: num(item.sleep_h), steps: num(item.steps), notes: item.notes })),
      checkin_recovery: rows(checkinsResult, 'la recuperación de las revisiones'),
      note: 'Energía, estrés y molestias se recogen en revisiones; el registro diario disponible contiene sueño, pasos y notas.',
    }
  }))

  server.registerTool('list_client_events', {
    title: 'Eventos y objetivos',
    description: 'Carreras, pruebas y objetivos con fecha, tipo, prioridad, meta, notas y distancia cuando está escrita explícitamente.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, ...historyDates, limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).max(500).default(0) }),
    annotations,
  }, async ({ client_id, coach_id, from_date, to_date, limit, offset }: any) => scoped('list_client_events', client_id, coach_id, async (coachId) => {
    const today = day(new Date())
    const range = dateRange(from_date ?? addDays(today, -365), to_date ?? addDays(today, 365), 730, 1460)
    const result = rows(await db.from('client_events').select('id, title, event_date, event_type, status, priority, location, target, notes')
      .eq('coach_id', coachId).eq('client_id', client_id).gte('event_date', range.from_date).lte('event_date', range.to_date)
      .order('event_date', { ascending: true }).range(offset, offset + limit), 'los eventos')
    return {
      client_id, ...range,
      events: result.slice(0, limit).map((event) => ({ ...event, distance_km: eventDistance(event), distance_source: eventDistance(event) === null ? null : 'texto_del_evento' })),
      has_more: result.length > limit, next_offset: result.length > limit ? offset + limit : null,
    }
  }))

  server.registerTool('get_strength_results', {
    title: 'Resultados reales de fuerza',
    description: 'Series y cargas registradas por ejercicio, reps, RIR/RPE cuando existen, notas y sesiones completadas. La fecha de una serie sin performed_at se marca como fecha de registro.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, program_id: z.string().uuid().optional(), ...historyDates, limit: z.number().int().min(1).max(200).default(80), offset: z.number().int().min(0).max(5000).default(0) }),
    annotations,
  }, async ({ client_id, coach_id, program_id, from_date, to_date, limit, offset }: any) => scoped('get_strength_results', client_id, coach_id, async (coachId) => {
    const range = dateRange(from_date, to_date, 180)
    const context = await strengthContext(db, coachId, client_id, program_id)
    const data = await completedStrengthRows(db, coachId, client_id, context, range)
    return {
      client_id, ...range, program_id: program_id ?? null,
      results: data.results.slice(offset, offset + limit),
      completed_sessions: data.sessions.filter((session) => session.is_completed),
      has_more: data.results.length > offset + limit, next_offset: data.results.length > offset + limit ? offset + limit : null,
      programs_scanned: context.programs.map((program) => ({ id: program.id, name: program.name })),
      older_programs_available: context.hasMorePrograms,
      source_counts: data.source_counts,
      note: 'Las series planificadas sin registro de ejecución no se presentan como resultados. performed_at solo aparece si el atleta lo guardó; recorded_at indica cuándo se modificó el registro.',
    }
  }))

  server.registerTool('get_cardio_results', {
    title: 'Cardio realizado y respuesta al estímulo',
    description: 'Distancia, tiempo, ritmo, FC, RPE, desnivel, laps y comentarios. Incluye actividades de Strava no vinculadas a una sesión para evitar huecos.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, ...historyDates, limit: z.number().int().min(1).max(60).default(20), offset: z.number().int().min(0).max(500).default(0) }),
    annotations,
  }, async ({ client_id, coach_id, from_date, to_date, limit, offset }: any) => scoped('get_cardio_results', client_id, coach_id, async (coachId) => {
    const range = dateRange(from_date, to_date, 90)
    const [cardio, strava] = await Promise.all([
      allRows(() => db.from('cardio_sessions').select('id, scheduled_date, performed_date, name, activity_type, training_type, is_completed, actual_distance_km, actual_duration_min, actual_avg_pace, avg_heart_rate, max_heart_rate, rpe, feedback_notes, source_provider, provider_activity_id, strava_activity_id, planned_structure, source_laps:source_payload->laps, source_elevation:source_payload->total_elevation_gain')
        .eq('coach_id', coachId).eq('client_id', client_id).eq('is_completed', true)
        .gte('scheduled_date', range.from_date).lte('scheduled_date', range.to_date)
        .order('scheduled_date', { ascending: false }).order('id', { ascending: true }), 'las sesiones de cardio'),
      allRows(() => db.from('strava_activities').select('id, provider_activity_id, name, sport_type, start_date, distance_meters, moving_time_seconds, elapsed_time_seconds, average_pace_seconds_per_km, average_heartrate, max_heartrate, total_elevation_gain, rpe, athlete_notes, matched_planned_session_id, cardio_session_id, laps:raw_payload->laps, splits_metric:raw_payload->splits_metric')
        .eq('coach_id', coachId).eq('client_id', client_id).eq('is_deleted', false)
        .gte('start_date', `${range.from_date}T00:00:00Z`).lt('start_date', range.end_exclusive)
        .order('start_date', { ascending: false }).order('id', { ascending: true }), 'las actividades de Strava'),
    ])
    const stravaById = new Map(strava.map((activity) => [activity.id, activity]))
    const stravaBySession = new Map<string, Row>()
    for (const activity of strava) {
      if (activity.cardio_session_id) stravaBySession.set(activity.cardio_session_id, activity)
      if (activity.matched_planned_session_id) stravaBySession.set(activity.matched_planned_session_id, activity)
    }
    const linkedStravaIds = new Set<string>()
    const activities: Row[] = cardio.map((session) => {
      const linked = stravaById.get(session.strava_activity_id) ?? stravaBySession.get(session.id) ??
        strava.find((activity) => activity.provider_activity_id && activity.provider_activity_id === session.provider_activity_id)
      if (linked) linkedStravaIds.add(linked.id)
      const distanceKm = num(session.actual_distance_km) ?? (num(linked?.distance_meters) === null ? null : rounded(Number(linked.distance_meters) / 1000, 3))
      const durationMin = num(session.actual_duration_min) ?? (num(linked?.moving_time_seconds) === null ? null : rounded(Number(linked.moving_time_seconds) / 60, 1))
      const lapData = linked?.laps ?? session.source_laps
      return {
        source: session.source_provider ?? (linked ? 'strava' : 'nexttrain'), id: session.id, strava_activity_id: linked?.id ?? session.strava_activity_id,
        date: session.performed_date ?? linked?.start_date ?? session.scheduled_date, scheduled_date: session.scheduled_date,
        name: session.name, activity_type: session.activity_type, training_type: session.training_type,
        distance_km: distanceKm, duration_min: durationMin, pace: session.actual_avg_pace,
        pace_seconds_per_km: num(linked?.average_pace_seconds_per_km),
        avg_heart_rate: num(session.avg_heart_rate) ?? num(linked?.average_heartrate),
        max_heart_rate: num(session.max_heart_rate) ?? num(linked?.max_heartrate),
        rpe: num(session.rpe) ?? num(linked?.rpe), elevation_gain_m: num(linked?.total_elevation_gain) ?? num(session.source_elevation),
        laps: lapSummary(lapData), splits_km: lapSummary(linked?.splits_metric),
        comments: session.feedback_notes ?? linked?.athlete_notes ?? null, planned_intervals: session.planned_structure,
      }
    })
    for (const activity of strava) {
      if (linkedStravaIds.has(activity.id)) continue
      activities.push({
        source: 'strava_unmatched', id: activity.id, date: activity.start_date, scheduled_date: null,
        name: activity.name, activity_type: activity.sport_type,
        distance_km: num(activity.distance_meters) === null ? null : rounded(Number(activity.distance_meters) / 1000, 3),
        duration_min: num(activity.moving_time_seconds) === null ? null : rounded(Number(activity.moving_time_seconds) / 60, 1),
        elapsed_time_min: num(activity.elapsed_time_seconds) === null ? null : rounded(Number(activity.elapsed_time_seconds) / 60, 1),
        pace_seconds_per_km: num(activity.average_pace_seconds_per_km), avg_heart_rate: num(activity.average_heartrate),
        max_heart_rate: num(activity.max_heartrate), rpe: num(activity.rpe), elevation_gain_m: num(activity.total_elevation_gain),
        laps: lapSummary(activity.laps), splits_km: lapSummary(activity.splits_metric), comments: activity.athlete_notes,
      })
    }
    activities.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    return {
      client_id, ...range, activities: activities.slice(offset, offset + limit),
      has_more: activities.length > offset + limit, next_offset: activities.length > offset + limit ? offset + limit : null,
      note: 'Las vueltas y parciales solo aparecen cuando el proveedor los entrega; las sesiones enlazadas con Strava se muestran una sola vez.',
    }
  }))

  server.registerTool('get_program_history', {
    title: 'Histórico de programas de fuerza',
    description: 'Sin program_id lista bloques y sesiones. Con program_id devuelve días, ejercicios, sesiones y resultados reales asociados para comparar bloques.',
    inputSchema: z.object({ client_id: clientIdSchema, coach_id: coachIdSchema, program_id: z.string().uuid().optional(), program_offset: z.number().int().min(0).max(5000).default(0), program_limit: z.number().int().min(1).max(50).default(30), result_limit: z.number().int().min(1).max(500).default(200), result_offset: z.number().int().min(0).max(5000).default(0) }),
    annotations,
  }, async ({ client_id, coach_id, program_id, program_offset, program_limit, result_limit, result_offset }: any) => scoped('get_program_history', client_id, coach_id, async (coachId) => {
    const context = await strengthContext(db, coachId, client_id, program_id, program_offset, program_limit)
    const programIds = context.programs.map((item) => item.id)
    const sessions = await inBatches(db, 'scheduled_strength_sessions', 'id, program_id, day_id, scheduled_date, is_completed', 'program_id', programIds,
      (q) => q.eq('coach_id', coachId).eq('client_id', client_id).order('scheduled_date', { ascending: false }))
    if (!program_id) {
      return {
        client_id,
        programs: context.programs.map((program) => {
          const ownSessions = sessions.filter((session) => session.program_id === program.id)
          return { ...program, day_count: context.days.filter((item) => item.program_id === program.id).length,
            exercise_count: context.exercises.filter((item) => item.program_id === program.id).length,
            scheduled_sessions: ownSessions.length, completed_sessions: ownSessions.filter((item) => item.is_completed).length }
        }),
        older_programs_available: context.hasMorePrograms,
        next_program_offset: context.hasMorePrograms ? program_offset + program_limit : null,
        note: 'Indica program_id para ver ejercicios y resultados de un bloque concreto.',
      }
    }
    const program = context.programs[0]
    const detail = await completedStrengthRows(db, coachId, client_id, context)
    const days = context.days.filter((item) => item.program_id === program_id).map((trainingDay) => ({
      ...trainingDay, exercises: context.exercises.filter((exercise) => exercise.day_id === trainingDay.id),
    }))
    return {
      client_id, program, days, sessions,
      results: detail.results.slice(result_offset, result_offset + result_limit),
      has_more_results: detail.results.length > result_offset + result_limit,
      next_result_offset: detail.results.length > result_offset + result_limit ? result_offset + result_limit : null,
      result_source_counts: detail.source_counts,
      note: 'Las series prescritas aparecen en days; results contiene solo datos registrados por el atleta o series marcadas como completadas.',
    }
  }))
}
