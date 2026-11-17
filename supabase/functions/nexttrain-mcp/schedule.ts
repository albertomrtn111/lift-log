import { z } from 'npm:zod@4.3.6'
import {
  addDays,
  allRows,
  createToolRunner,
  type Db,
  defaultHelpers,
  isoDate,
  mondayOf,
  readOnlyAnnotations,
  type Row,
  rows,
  toUtcDate,
  type ToolHelpers,
} from './shared.ts'
import { loadSkippedDays } from './strength-skips.ts'

type Server = any

const PROGRAM_FIELDS = 'id, name, status, weeks, total_weeks, effective_from, effective_to, created_at, training_days(id, name, order_index, default_weekday, training_exercises(exercise_name, sets, reps, rir, rest_seconds, notes, order_index))'

function daysBetween(start: string, end: string) {
  return Math.floor((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86_400_000)
}

function programWeek(program: Row | undefined, date: string) {
  if (!program?.effective_from) return null
  const week = Math.floor(daysBetween(mondayOf(program.effective_from), mondayOf(date)) / 7) + 1
  const weeks = Number(program.weeks)
  if (week < 1 || (weeks > 0 && week > weeks)) return null
  return week
}

function exercisesOf(trainingDay: Row | undefined) {
  return [...trainingDay?.training_exercises ?? []]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map(({ order_index: _order, ...exercise }) => exercise)
}

type StrengthScheduleInput = {
  // Programas activos del cliente, del más reciente al más antiguo.
  activePrograms: Row[]
  // Todos los programas conocidos (activos y los de las sesiones guardadas) con días y ejercicios.
  programs: Row[]
  // Filas de scheduled_strength_sessions de las semanas completas (lunes a domingo) que cubren el rango.
  sessions: Row[]
  startDate: string
  endDate: string
  // Filas de strength_day_week_skips: días que el coach quitó en una semana del programa.
  skips?: Row[]
}

/**
 * Fuerza tal como la ven el coach (PlanningTab → getWeeklySchedule) y el atleta
 * (getClientWeeklySchedule):
 * - Cada fila de scheduled_strength_sessions cuenta en su fecha, con su is_completed.
 * - El programa activo genera días de plantilla durante `weeks || 4` semanas desde el
 *   lunes de la semana de inicio, por default_weekday.
 * - Un día de plantilla se oculta si en esa semana hay una fila del mismo day_id:
 *   así una sesión reprogramada solo aparece en su fecha nueva.
 * - Un día que el coach quitó en esa semana del programa sale con skipped_by_coach
 *   (salvo una sesión ya completada): el atleta no lo ve y no es un fallo.
 */
export function buildStrengthSchedule({ activePrograms, programs, sessions, startDate, endDate, skips = [] }: StrengthScheduleInput) {
  const skipped = new Map(skips.map((row) => [`${row.program_id}:${row.day_id}:${row.week_index}`, row]))
  const skipOf = (programId: string | null | undefined, dayId: string, week: number | null) =>
    programId && week ? skipped.get(`${programId}:${dayId}:${week}`) ?? null : null
  const programById = new Map(programs.map((program) => [program.id, program]))
  const dayById = new Map<string, Row>()
  for (const program of programs) {
    for (const trainingDay of program.training_days ?? []) dayById.set(trainingDay.id, trainingDay)
  }

  const active = activePrograms.find((program) => (program.training_days ?? []).some((item: Row) => item.default_weekday != null)) ?? null
  const template: Row[] = []
  if (active?.effective_from) {
    const weeks = Number(active.weeks) || 4
    const firstMonday = mondayOf(active.effective_from)
    for (let week = 0; week < weeks; week++) {
      for (const trainingDay of active.training_days ?? []) {
        const weekday = Number(trainingDay.default_weekday)
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue
        template.push({ trainingDay, date: addDays(firstMonday, week * 7 + weekday - 1), week: week + 1 })
      }
    }
  }

  const sameWeek = (a: string, b: string) => mondayOf(a) === mondayOf(b)
  const items: Row[] = []

  for (const slot of template) {
    if (sessions.some((session) => session.day_id === slot.trainingDay.id && sameWeek(session.scheduled_date, slot.date))) continue
    const skip = skipOf(active!.id, slot.trainingDay.id, slot.week)
    items.push({
      kind: 'strength',
      date: slot.date,
      program_id: active!.id,
      program_name: active!.name,
      program_status: active!.status ?? 'active',
      week: slot.week,
      day_id: slot.trainingDay.id,
      day_name: slot.trainingDay.name,
      exercises: exercisesOf(slot.trainingDay),
      session_id: null,
      source: 'program_template',
      is_completed: false,
      rescheduled: false,
      original_date: null,
      extra_session: false,
      skipped_by_coach: Boolean(skip),
      skipped_at: skip?.created_at ?? null,
    })
  }

  for (const session of sessions) {
    const program = programById.get(session.program_id)
    const trainingDay = dayById.get(session.day_id)
    // Fecha que tenía ese día en la plantilla de la misma semana, si la había.
    const templateDate = template.find((slot) => slot.trainingDay.id === session.day_id && sameWeek(slot.date, session.scheduled_date))?.date ?? null
    const rescheduled = templateDate !== null && templateDate !== session.scheduled_date
    const week = programWeek(program, session.scheduled_date)
    const skip = session.is_completed === true ? null : skipOf(session.program_id, session.day_id, week)
    items.push({
      kind: 'strength',
      date: session.scheduled_date,
      program_id: session.program_id,
      program_name: program?.name ?? null,
      program_status: program?.status ?? null,
      week,
      day_id: session.day_id,
      day_name: trainingDay?.name ?? null,
      exercises: exercisesOf(trainingDay),
      session_id: session.id,
      source: 'scheduled_session',
      is_completed: session.is_completed === true,
      rescheduled,
      original_date: rescheduled ? templateDate : null,
      // Sesión añadida o duplicada que no sustituye a ningún día de la plantilla en esa semana.
      extra_session: templateDate === null,
      skipped_by_coach: Boolean(skip),
      skipped_at: skip?.created_at ?? null,
    })
  }

  return items
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.day_name ?? '').localeCompare(String(b.day_name ?? '')))
}

export function registerScheduleTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'list_client_schedule',
    {
      title: 'Consultar planificación',
      description: 'Devuelve cardio, fuerza y eventos de un cliente dentro de un rango de hasta 120 días. La fuerza usa las sesiones programadas (fecha real, completada, reprogramada) y completa con la plantilla del programa activo, igual que el calendario de la app. Los días de fuerza que el coach quitó en una semana no están en items: van en skipped_strength_days (el atleta no los ve y no son fallos).',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        start_date: isoDate,
        end_date: isoDate,
        coach_id: z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.'),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ client_id, start_date, end_date, coach_id }: Row) => {
      const rangeDays = daysBetween(start_date, end_date)
      if (rangeDays < 0 || rangeDays > 120) {
        return helpers.toolError('El rango debe estar ordenado y no puede superar 120 días.')
      }

      return run('list_client_schedule', {
        coachId: coach_id,
        clientId: client_id,
        fallbackError: 'No se ha podido consultar la planificación.',
      }, async ({ coachId, log }) => {
        // La app carga semanas completas: una sesión movida oculta el día de plantilla de su semana
        // aunque esa semana empiece antes del rango pedido.
        const weekStart = mondayOf(start_date)
        const weekEnd = addDays(mondayOf(end_date), 6)

        const [cardioResult, eventsResult, programsResult, sessions, skips] = await Promise.all([
          db
            .from('cardio_sessions')
            .select('id, scheduled_date, name, activity_type, training_type, description, target_distance_km, target_duration_min, target_pace, planned_structure, coach_notes, is_completed')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('scheduled_date', start_date)
            .lte('scheduled_date', end_date),
          db
            .from('client_events')
            .select('id, title, event_date, event_type, status, priority, location, target, notes')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('event_date', start_date)
            .lte('event_date', end_date),
          db
            .from('training_programs')
            .select(PROGRAM_FIELDS)
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(10),
          allRows(() => db
            .from('scheduled_strength_sessions')
            .select('id, program_id, day_id, scheduled_date, is_completed')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('scheduled_date', weekStart)
            .lte('scheduled_date', weekEnd)
            .order('scheduled_date', { ascending: true })
            .order('id', { ascending: true }), 'las sesiones de fuerza programadas', { loadError: 'No se ha podido cargar la planificación.' }),
          loadSkippedDays(db, coachId, client_id),
        ])

        const failed = [cardioResult, eventsResult, programsResult].find((item) => item.error)
        if (failed?.error) throw new Error('No se ha podido cargar la planificación.')

        // Como en la app, cuentan también las sesiones de programas ya archivados.
        const activePrograms = programsResult.data ?? []
        const known = new Set(activePrograms.map((program: Row) => program.id))
        const missingIds = [...new Set(sessions.map((session) => session.program_id))].filter((id) => id && !known.has(id))
        const otherPrograms = missingIds.length
          ? rows(await db
            .from('training_programs')
            .select(PROGRAM_FIELDS)
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .in('id', missingIds), 'los programas de fuerza', 'No se ha podido cargar la planificación.')
          : []

        const items: Row[] = []
        for (const session of cardioResult.data ?? []) {
          items.push({ kind: 'cardio', date: session.scheduled_date, ...session })
        }
        for (const event of eventsResult.data ?? []) {
          items.push({ kind: 'event', date: event.event_date, ...event })
        }
        const strength = buildStrengthSchedule({
          activePrograms,
          programs: [...activePrograms, ...otherPrograms],
          sessions,
          startDate: start_date,
          endDate: end_date,
          skips,
        })
        items.push(...strength.filter((item) => !item.skipped_by_coach))
        const skippedStrengthDays = strength.filter((item) => item.skipped_by_coach).map((item) => ({
          date: item.date, week: item.week, program_id: item.program_id, program_name: item.program_name,
          day_id: item.day_id, day_name: item.day_name, skipped_at: item.skipped_at,
        }))

        // sort es estable: dentro de cada día la fuerza conserva el orden de buildStrengthSchedule.
        items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
        log.result_count = items.length
        return { client_id, start_date, end_date, items, skipped_strength_days: skippedStrengthDays }
      })
    },
  )
}
