import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.3.0'
import { pipeline } from 'npm:@supabase/middleware@1.0.0'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.9.0'
import { z } from 'npm:zod@4.3.6'
import { registerHistoryTools } from './history.ts'
import { normalizeCardioPlan } from './cardio-plan.js'

type SupabaseClientLike = any

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD')
const optionalCoachId = z.string().uuid().optional().describe(
  'Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.',
)

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

const additiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}

const cardioBlockSchema = z.strictObject({
  type: z.enum(['warmup', 'continuous', 'intervals', 'cooldown', 'station']),
  description: z.string().trim().min(1).max(800),
  distance_m: z.number().positive().max(300_000).optional().describe('Distancia total del bloque, en metros. Solo para bloques sin repeticiones.'),
  duration_min: z.number().positive().max(600).optional(),
  repetitions: z.number().int().positive().max(100).optional().describe('Número de repeticiones; solo para intervals.'),
  distance_per_rep_m: z.number().positive().max(100_000).optional().describe('Distancia de CADA repetición en metros; no la suma del bloque.'),
  duration_per_rep_seconds: z.number().positive().max(36_000).optional(),
  recovery_seconds: z.number().min(0).max(3600).optional().describe('Recuperación entre repeticiones, sin añadir una después de la última.'),
  target_pace: z.string().trim().max(80).optional(),
  target_hr: z.string().trim().max(80).optional(),
  target_rpe: z.string().trim().max(40).optional(),
})

const strengthExerciseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.string().trim().max(80).optional(),
  rir: z.number().min(0).max(10).optional(),
  rest_seconds: z.number().int().min(0).max(1800).optional(),
  notes: z.string().trim().max(800).optional(),
  muscle_group: z.enum([
    'hombro',
    'pecho',
    'espalda',
    'abdomen',
    'cuádriceps',
    'femorales',
    'gemelos',
    'tríceps',
    'bíceps',
    'glúteo',
    'aductores',
    'otros',
  ]).optional(),
})

const strengthDaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  weekday: z.number().int().min(1).max(7).describe('1=lunes, 7=domingo'),
  exercises: z.array(strengthExerciseSchema).min(1).max(30),
})

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  }
}

function audit(tool: string, details: Record<string, unknown>) {
  console.error(JSON.stringify({ event: 'nexttrain_mcp_tool', tool, ...details }))
}

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = toUtcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDate(date)
}

function daysBetween(start: string, end: string) {
  return Math.floor((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86_400_000)
}

function startOfIsoWeek(value: string) {
  const date = toUtcDate(value)
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date
}

function asNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function resolveCoach(supabase: SupabaseClientLike, requestedCoachId?: string) {
  let query = supabase
    .from('coach_memberships')
    .select('coach_id, role, status, created_at')
    .eq('status', 'active')
    .in('role', ['owner', 'coach'])
    .order('created_at', { ascending: true })

  if (requestedCoachId) query = query.eq('coach_id', requestedCoachId)

  const { data, error } = await query
  if (error) throw new Error('No se ha podido comprobar el acceso del entrenador.')
  if (!data?.length) throw new Error('La cuenta no tiene una membresía activa de entrenador.')
  if (!requestedCoachId && data.length > 1) {
    throw new Error('La cuenta pertenece a varios espacios. Indica coach_id para elegir uno.')
  }

  return { coachId: data[0].coach_id as string, role: data[0].role as string }
}

async function requireClient(
  supabase: SupabaseClientLike,
  coachId: string,
  clientId: string,
) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, coach_id, full_name, status, start_date, next_checkin_date')
    .eq('id', clientId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (error || !data) throw new Error('Cliente no encontrado en el espacio del entrenador.')
  return data
}

function createNextTrainServer(supabase: SupabaseClientLike) {
  const server = new McpServer({
    name: 'nexttrain',
    title: 'NexTrain',
    version: '0.4.0',
    websiteUrl: 'https://nexttrain.ascenttech.cloud',
  })

  server.registerTool(
    'who_am_i',
    {
      title: 'Comprobar acceso de entrenador',
      description: 'Devuelve los espacios de entrenamiento a los que pertenece la cuenta conectada.',
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    async () => {
      const { data, error } = await supabase
        .from('coach_memberships')
        .select('coach_id, role, status, coaches(name)')
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])

      if (error) return toolError('No se ha podido comprobar la cuenta conectada.')
      return jsonResult({ trainer_access: data ?? [] })
    },
  )

  server.registerTool(
    'list_clients',
    {
      title: 'Listar clientes',
      description: 'Lista clientes del entrenador con señales breves de seguimiento y su último check-in.',
      inputSchema: z.object({
        coach_id: optionalCoachId,
        status: z.enum(['active', 'inactive', 'all']).default('active'),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ coach_id, status, search, limit }) => {
      try {
        const { coachId } = await resolveCoach(supabase, coach_id)
        let query = supabase
          .from('clients')
          .select('id, full_name, status, start_date, next_checkin_date, checkin_frequency_days')
          .eq('coach_id', coachId)
          .order('full_name', { ascending: true })
          .limit(limit)

        if (status !== 'all') query = query.eq('status', status)
        if (search) query = query.ilike('full_name', `%${search.replaceAll('%', '')}%`)

        const { data: clients, error } = await query
        if (error) throw new Error('No se ha podido cargar la cartera de clientes.')

        const clientIds = (clients ?? []).map((client: any) => client.id)
        let checkins: any[] = []
        if (clientIds.length) {
          const response = await supabase
            .from('checkins')
            .select('client_id, submitted_at, weight_avg_kg, training_adherence_pct, nutrition_adherence_pct, sleep_avg_h, energy, stress, injuries')
            .in('client_id', clientIds)
            .eq('coach_id', coachId)
            .not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false })
            .limit(Math.min(clientIds.length * 5, 500))
          if (!response.error) checkins = response.data ?? []
        }

        const latestByClient = new Map<string, any>()
        for (const checkin of checkins) {
          if (!latestByClient.has(checkin.client_id)) latestByClient.set(checkin.client_id, checkin)
        }

        const today = formatDate(new Date())
        const result = (clients ?? []).map((client: any) => {
          const latest = latestByClient.get(client.id) ?? null
          const flags: string[] = []
          if (!latest) flags.push('sin_checkin')
          if (latest?.training_adherence_pct != null && latest.training_adherence_pct < 70) flags.push('adherencia_entreno_baja')
          if (latest?.nutrition_adherence_pct != null && latest.nutrition_adherence_pct < 70) flags.push('adherencia_nutricion_baja')
          if (latest?.energy != null && latest.energy <= 4) flags.push('energia_baja')
          if (latest?.stress != null && latest.stress >= 7) flags.push('estres_alto')
          if (latest?.injuries?.trim()) flags.push('lesion_o_molestia')
          if (client.next_checkin_date && client.next_checkin_date < today) flags.push('checkin_atrasado')

          return {
            ...client,
            latest_checkin: latest,
            attention_flags: flags,
          }
        })

        audit('list_clients', { coach_id: coachId, result_count: result.length, status: 'ok' })
        return jsonResult({ coach_id: coachId, clients: result })
      } catch (error) {
        audit('list_clients', { status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se han podido listar los clientes.')
      }
    },
  )

  server.registerTool(
    'get_client_overview',
    {
      title: 'Ver estado de un cliente',
      description: 'Resume evolución, adherencia, bienestar, molestias, próximos eventos y planificación de un cliente.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ client_id, coach_id }) => {
      try {
        const { coachId } = await resolveCoach(supabase, coach_id)
        const client = await requireClient(supabase, coachId, client_id)
        const today = formatDate(new Date())

        const [checkinsResult, cardioResult, eventsResult, programsResult] = await Promise.all([
          supabase
            .from('checkins')
            .select('id, submitted_at, period_start, period_end, weight_kg, weight_avg_kg, steps_avg, training_adherence_pct, nutrition_adherence_pct, sleep_avg_h, energy, hunger, stress, performance, injuries, notes, status')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false })
            .limit(8),
          supabase
            .from('cardio_sessions')
            .select('id, scheduled_date, name, activity_type, training_type, target_distance_km, target_duration_min, target_pace, is_completed, actual_distance_km, actual_duration_min, rpe, feedback_notes')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('scheduled_date', addDays(today, -30))
            .lte('scheduled_date', addDays(today, 30))
            .order('scheduled_date', { ascending: true }),
          supabase
            .from('client_events')
            .select('id, title, event_date, event_type, status, priority, target, location')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('event_date', today)
            .order('event_date', { ascending: true })
            .limit(10),
          supabase
            .from('training_programs')
            .select('id, name, weeks, total_weeks, status, effective_from, effective_to, training_days(id, name, default_weekday)')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .in('status', ['active', 'draft'])
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        const failed = [checkinsResult, cardioResult, eventsResult, programsResult].find((item) => item.error)
        if (failed?.error) throw new Error('No se ha podido construir el resumen completo del cliente.')

        const checkins = checkinsResult.data ?? []
        const latest = checkins[0] ?? null
        const previous = checkins[1] ?? null
        const metricDelta = (key: string) => {
          const current = asNumber(latest?.[key])
          const before = asNumber(previous?.[key])
          return current == null || before == null ? null : Number((current - before).toFixed(2))
        }

        const attentionFlags: string[] = []
        if (!latest) attentionFlags.push('No hay check-ins enviados.')
        if (latest?.training_adherence_pct != null && latest.training_adherence_pct < 70) attentionFlags.push('Adherencia al entrenamiento por debajo del 70%.')
        if (latest?.nutrition_adherence_pct != null && latest.nutrition_adherence_pct < 70) attentionFlags.push('Adherencia nutricional por debajo del 70%.')
        if (latest?.sleep_avg_h != null && Number(latest.sleep_avg_h) < 6) attentionFlags.push('Media de sueño inferior a 6 horas.')
        if (latest?.energy != null && latest.energy <= 4) attentionFlags.push('Energía baja en el último check-in.')
        if (latest?.stress != null && latest.stress >= 7) attentionFlags.push('Estrés alto en el último check-in.')
        if (latest?.injuries?.trim()) attentionFlags.push('Ha comunicado lesión o molestias.')
        if (client.next_checkin_date && client.next_checkin_date < today) attentionFlags.push('El próximo check-in está atrasado.')

        audit('get_client_overview', { coach_id: coachId, client_id, status: 'ok' })
        return jsonResult({
          client,
          attention_flags: attentionFlags,
          latest_checkin: latest,
          recent_trend: {
            compared_with: previous?.submitted_at ?? null,
            weight_kg_delta: metricDelta('weight_avg_kg'),
            training_adherence_points_delta: metricDelta('training_adherence_pct'),
            nutrition_adherence_points_delta: metricDelta('nutrition_adherence_pct'),
            sleep_hours_delta: metricDelta('sleep_avg_h'),
            energy_delta: metricDelta('energy'),
            stress_delta: metricDelta('stress'),
          },
          recent_checkins: checkins,
          cardio_window: cardioResult.data ?? [],
          upcoming_events: eventsResult.data ?? [],
          training_programs: programsResult.data ?? [],
        })
      } catch (error) {
        audit('get_client_overview', { client_id, status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se ha podido cargar el cliente.')
      }
    },
  )

  server.registerTool(
    'list_client_schedule',
    {
      title: 'Consultar planificación',
      description: 'Devuelve cardio, fuerza y eventos de un cliente dentro de un rango de hasta 120 días.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        start_date: isoDate,
        end_date: isoDate,
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ client_id, start_date, end_date, coach_id }) => {
      try {
        const rangeDays = daysBetween(start_date, end_date)
        if (rangeDays < 0 || rangeDays > 120) {
          return toolError('El rango debe estar ordenado y no puede superar 120 días.')
        }

        const { coachId } = await resolveCoach(supabase, coach_id)
        await requireClient(supabase, coachId, client_id)

        const [cardioResult, eventsResult, programsResult] = await Promise.all([
          supabase
            .from('cardio_sessions')
            .select('id, scheduled_date, name, activity_type, training_type, description, target_distance_km, target_duration_min, target_pace, planned_structure, coach_notes, is_completed')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('scheduled_date', start_date)
            .lte('scheduled_date', end_date),
          supabase
            .from('client_events')
            .select('id, title, event_date, event_type, status, priority, location, target, notes')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .gte('event_date', start_date)
            .lte('event_date', end_date),
          supabase
            .from('training_programs')
            .select('id, name, weeks, total_weeks, effective_from, effective_to, training_days(id, name, default_weekday, training_exercises(exercise_name, sets, reps, rir, rest_seconds, notes))')
            .eq('coach_id', coachId)
            .eq('client_id', client_id)
            .eq('status', 'active')
            .lte('effective_from', end_date)
            .order('created_at', { ascending: false })
            .limit(5),
        ])

        const failed = [cardioResult, eventsResult, programsResult].find((item) => item.error)
        if (failed?.error) throw new Error('No se ha podido cargar la planificación.')

        const items: any[] = []
        for (const session of cardioResult.data ?? []) {
          items.push({ kind: 'cardio', date: session.scheduled_date, ...session })
        }
        for (const event of eventsResult.data ?? []) {
          items.push({ kind: 'event', date: event.event_date, ...event })
        }

        for (const program of programsResult.data ?? []) {
          const programStart = startOfIsoWeek(program.effective_from)
          const totalWeeks = program.total_weeks ?? program.weeks ?? 1
          const programEnd = program.effective_to ?? addDays(program.effective_from, totalWeeks * 7 - 1)
          for (let offset = 0; offset <= rangeDays; offset += 1) {
            const date = addDays(start_date, offset)
            if (date < program.effective_from || date > programEnd) continue
            const current = toUtcDate(date)
            const weekday = current.getUTCDay() || 7
            const weekIndex = Math.floor((startOfIsoWeek(date).getTime() - programStart.getTime()) / (7 * 86_400_000)) + 1
            if (weekIndex < 1 || weekIndex > totalWeeks) continue

            for (const day of program.training_days ?? []) {
              if (day.default_weekday !== weekday) continue
              items.push({
                kind: 'strength',
                date,
                program_id: program.id,
                program_name: program.name,
                week: weekIndex,
                day_id: day.id,
                day_name: day.name,
                exercises: day.training_exercises ?? [],
              })
            }
          }
        }

        items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
        audit('list_client_schedule', { coach_id: coachId, client_id, result_count: items.length, status: 'ok' })
        return jsonResult({ client_id, start_date, end_date, items })
      } catch (error) {
        audit('list_client_schedule', { client_id, status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se ha podido consultar la planificación.')
      }
    },
  )

  server.registerTool(
    'schedule_cardio_session',
    {
      title: 'Programar sesión de cardio',
      description: 'Añade cardio al calendario solo tras una petición explícita. Usa planning_mode=quick para sesiones sencillas de texto libre; structured solo para bloques ejecutables. En series, distance_per_rep_m es por repetición y las demás distancias de bloques están en metros.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        scheduled_date: isoDate,
        name: z.string().trim().min(1).max(160),
        activity_type: z.string().trim().min(1).max(80).default('Running'),
        training_type: z.string().trim().max(120).optional(),
        planning_mode: z.enum(['quick', 'structured']).describe('quick: descripción libre sin bloques; structured: intervalos y bloques ejecutables.'),
        description: z.string().trim().max(2000).optional(),
        target_distance_km: z.number().positive().max(300).optional(),
        target_duration_min: z.number().positive().max(1440).optional(),
        target_pace: z.string().trim().max(80).optional(),
        coach_notes: z.string().trim().max(2000).optional(),
        blocks: z.array(cardioBlockSchema).max(30).optional(),
        coach_id: optionalCoachId,
      }),
      annotations: additiveWriteAnnotations,
    },
    async (input) => {
      try {
        const normalized = normalizeCardioPlan(input)
        const { coachId } = await resolveCoach(supabase, input.coach_id)
        await requireClient(supabase, coachId, input.client_id)
        const { data, error } = await supabase
          .from('cardio_sessions')
          .insert({
            coach_id: coachId,
            client_id: input.client_id,
            scheduled_date: input.scheduled_date,
            date: input.scheduled_date,
            name: input.name,
            activity_type: input.activity_type,
            training_type: input.training_type ?? null,
            description: normalized.description,
            target_distance_km: normalized.target_distance_km,
            target_duration_min: normalized.target_duration_min,
            target_pace: normalized.target_pace,
            coach_notes: input.coach_notes ?? null,
            notes: input.coach_notes ?? null,
            planned_structure: normalized.planned_structure,
            structure: normalized.structure,
            is_completed: false,
          })
          .select('id, client_id, scheduled_date, name, activity_type, training_type, description, target_distance_km, target_duration_min, target_pace, structure, planned_structure')
          .single()

        if (error) throw new Error('No se ha podido guardar la sesión de cardio.')
        audit('schedule_cardio_session', { coach_id: coachId, client_id: input.client_id, record_id: data.id, status: 'ok' })
        return jsonResult({ created: true, session: data, normalized: {
          planning_mode: normalized.planning_mode,
          distance_validation: normalized.distance_validation,
          structure: data.structure,
          planned_structure: data.planned_structure,
          target_distance_km: data.target_distance_km,
          target_duration_min: data.target_duration_min,
        } })
      } catch (error) {
        audit('schedule_cardio_session', { client_id: input.client_id, status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se ha podido programar la sesión.')
      }
    },
  )

  server.registerTool(
    'create_strength_program',
    {
      title: 'Crear programa de fuerza',
      description: 'Crea un programa de fuerza completo con días y ejercicios. Por seguridad se crea en borrador salvo que status sea active.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
        effective_from: isoDate,
        weeks: z.number().int().min(1).max(52),
        status: z.enum(['draft', 'active']).default('draft'),
        days: z.array(strengthDaySchema).min(1).max(7),
        coach_id: optionalCoachId,
      }),
      annotations: additiveWriteAnnotations,
    },
    async (input) => {
      let programId: string | null = null
      try {
        const { coachId } = await resolveCoach(supabase, input.coach_id)
        await requireClient(supabase, coachId, input.client_id)

        programId = crypto.randomUUID()
        const effectiveTo = addDays(input.effective_from, input.weeks * 7 - 1)
        const { error: programError } = await supabase.from('training_programs').insert({
          id: programId,
          coach_id: coachId,
          client_id: input.client_id,
          name: input.name,
          weeks: input.weeks,
          total_weeks: input.weeks,
          status: input.status,
          effective_from: input.effective_from,
          effective_to: effectiveTo,
        })
        if (programError) throw new Error('No se ha podido crear el programa de fuerza.')

        const dayRows = input.days.map((day, index) => ({
          id: crypto.randomUUID(),
          coach_id: coachId,
          program_id: programId,
          name: day.name,
          day_name: day.name,
          order_index: index + 1,
          day_order: index + 1,
          default_weekday: day.weekday,
        }))
        const { error: daysError } = await supabase.from('training_days').insert(dayRows)
        if (daysError) throw new Error('No se han podido crear los días del programa.')

        const exerciseRows = input.days.flatMap((day, dayIndex) =>
          day.exercises.map((exercise, exerciseIndex) => ({
            id: crypto.randomUUID(),
            coach_id: coachId,
            program_id: programId,
            day_id: dayRows[dayIndex].id,
            order_index: exerciseIndex + 1,
            exercise_name: exercise.name,
            sets: exercise.sets ?? null,
            reps: exercise.reps ?? null,
            rir: exercise.rir ?? null,
            rest_seconds: exercise.rest_seconds ?? null,
            notes: exercise.notes ?? null,
            muscle_group: exercise.muscle_group ?? 'otros',
          })),
        )
        const { error: exercisesError } = await supabase.from('training_exercises').insert(exerciseRows)
        if (exercisesError) throw new Error('No se han podido crear los ejercicios del programa.')

        audit('create_strength_program', { coach_id: coachId, client_id: input.client_id, record_id: programId, status: 'ok' })
        return jsonResult({
          created: true,
          program: {
            id: programId,
            client_id: input.client_id,
            name: input.name,
            status: input.status,
            effective_from: input.effective_from,
            effective_to: effectiveTo,
            weeks: input.weeks,
            days: input.days.length,
            exercises: exerciseRows.length,
          },
        })
      } catch (error) {
        if (programId) await supabase.from('training_programs').delete().eq('id', programId)
        audit('create_strength_program', { client_id: input.client_id, record_id: programId, status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se ha podido crear el programa de fuerza.')
      }
    },
  )

  server.registerTool(
    'create_coach_task',
    {
      title: 'Crear tarea de seguimiento',
      description: 'Añade una tarea a la agenda del entrenador, opcionalmente vinculada a un cliente.',
      inputSchema: z.object({
        task_date: isoDate,
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        priority: z.enum(['normal', 'high']).default('normal'),
        client_id: z.string().uuid().optional(),
        coach_id: optionalCoachId,
      }),
      annotations: additiveWriteAnnotations,
    },
    async (input) => {
      try {
        const { coachId } = await resolveCoach(supabase, input.coach_id)
        if (input.client_id) await requireClient(supabase, coachId, input.client_id)

        const { data, error } = await supabase
          .from('coach_tasks')
          .insert({
            coach_id: coachId,
            client_id: input.client_id ?? null,
            task_date: input.task_date,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
            status: 'pending',
          })
          .select('id, client_id, task_date, title, priority, status')
          .single()

        if (error) throw new Error('No se ha podido crear la tarea.')
        audit('create_coach_task', { coach_id: coachId, client_id: input.client_id ?? null, record_id: data.id, status: 'ok' })
        return jsonResult({ created: true, task: data })
      } catch (error) {
        audit('create_coach_task', { client_id: input.client_id ?? null, status: 'error' })
        return toolError(error instanceof Error ? error.message : 'No se ha podido crear la tarea.')
      }
    },
  )

  registerHistoryTools(server, supabase, {
    resolveCoach,
    requireClient,
    jsonResult,
    toolError,
    audit,
    annotations: readOnlyAnnotations,
  })

  return server
}

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (request, { supabase }) => {
      const handler = createMcpHandler(() => createNextTrainServer(supabase))
      return handler.fetch(request)
    },
  ),
)
