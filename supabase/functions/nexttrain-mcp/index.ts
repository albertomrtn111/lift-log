import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.3.0'
import { pipeline } from 'npm:@supabase/middleware@1.0.0'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1.9.0'
import { z } from 'npm:zod@4.3.6'
import { registerHistoryTools } from './history.ts'
import { registerNutritionTools } from './nutrition.ts'
import { registerCardioTools } from './cardio.ts'
import { registerClientTools } from './clients.ts'
import { registerScheduleTools } from './schedule.ts'
import { withOutputSchemas } from './output-schemas.ts'
import { registerAgendaTools } from './agenda.ts'
import { registerCoachWriteTools } from './coach-writes.ts'
import { registerPrompts } from './prompts.ts'
import {
  addDays,
  createToolRunner,
  type Db,
  idempotentWriteAnnotations,
  isoDate,
  jsonResult,
  readOnlyAnnotations,
  type Row,
  toolError,
  toUtcDate,
  writeAnnotations,
} from './shared.ts'

const optionalCoachId = z.string().uuid().optional().describe(
  'Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.',
)
const athleteGoalType = z.enum([
  'recomposition',
  'definition',
  'muscle_gain',
  'endurance',
  'competition',
  'health',
  'other',
])

// Solo ejercicios de la biblioteca: el grupo muscular y el nombre final los pone el catálogo.
const strengthExerciseSchema = z.object({
  catalog_exercise_id: z.string().uuid().optional().describe(
    'ID de list_exercise_catalog. Si se omite, name debe coincidir con un ejercicio o alias de la biblioteca.',
  ),
  name: z.string().trim().min(1).max(160).describe('Nombre del ejercicio en la biblioteca (list_exercise_catalog).'),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.string().trim().max(80).optional(),
  rir: z.number().min(0).max(10).optional(),
  rest_seconds: z.number().int().min(0).max(1800).optional(),
  notes: z.string().trim().max(800).optional(),
})

function exerciseNameKey(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const strengthDaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  weekday: z.number().int().min(1).max(7).describe('1=lunes, 7=domingo'),
  exercises: z.array(strengthExerciseSchema).min(1).max(30),
})

function daysBetween(start: string, end: string) {
  return Math.floor((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86_400_000)
}

function asNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function createNextTrainServer(supabase: Db) {
  const server = withOutputSchemas(new McpServer({
    name: 'nexttrain',
    title: 'NexTrain',
    version: '0.13.0',
    websiteUrl: 'https://nexttrain.ascenttech.cloud',
  }))
  const run = createToolRunner(supabase)

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

  registerClientTools(server, supabase)

  server.registerTool(
    'get_client_overview',
    {
      title: 'Ver estado de un cliente',
      description: 'Resume evolución, adherencia, bienestar, molestias, objetivo actual, próximos eventos y planificación de un cliente.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    ({ client_id, coach_id }) => run('get_client_overview', {
      coachId: coach_id,
      clientId: client_id,
      fallbackError: 'No se ha podido cargar el cliente.',
    }, async ({ coachId, client, today }) => {

      const [checkinsResult, cardioResult, eventsResult, programsResult, goalResult] = await Promise.all([
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
        supabase
          .from('athlete_current_goals')
          .select('id, goal_type, title, start_date, target_date, notes, updated_at')
          .eq('coach_id', coachId)
          .eq('client_id', client_id)
          .maybeSingle(),
      ])

      const failed = [checkinsResult, cardioResult, eventsResult, programsResult, goalResult].find((item) => item.error)
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
      if (client?.next_checkin_date && client.next_checkin_date < today) attentionFlags.push('El próximo check-in está atrasado.')

      return {
        client,
        today,
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
        current_goal: goalResult.data
          ? {
            ...goalResult.data,
            days_until_end: daysBetween(today, goalResult.data.target_date),
            deadline_status: goalResult.data.target_date < today
              ? 'overdue'
              : goalResult.data.target_date === today
                ? 'ends_today'
                : 'upcoming',
          }
          : null,
        cardio_window: cardioResult.data ?? [],
        upcoming_events: eventsResult.data ?? [],
        training_programs: programsResult.data ?? [],
      }
    }),
  )

  server.registerTool(
    'get_athlete_goal',
    {
      title: 'Consultar objetivo actual del atleta',
      description: 'Devuelve la fase u objetivo actual del atleta, su periodo y los días que faltan para la fecha límite.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    ({ client_id, coach_id }) => run('get_athlete_goal', {
      coachId: coach_id,
      clientId: client_id,
      fallbackError: 'No se ha podido consultar el objetivo actual.',
    }, async ({ coachId, today }) => {
      const { data, error } = await supabase
        .from('athlete_current_goals')
        .select('id, goal_type, title, start_date, target_date, notes, updated_at')
        .eq('coach_id', coachId)
        .eq('client_id', client_id)
        .maybeSingle()
      if (error) throw new Error('No se ha podido consultar el objetivo actual.')

      const goal = data
        ? {
          ...data,
          days_until_end: daysBetween(today, data.target_date),
          deadline_status: data.target_date < today
            ? 'overdue'
            : data.target_date === today
              ? 'ends_today'
              : 'upcoming',
        }
        : null

      return { client_id, current_goal: goal }
    }),
  )

  server.registerTool(
    'set_athlete_goal',
    {
      title: 'Definir objetivo actual del atleta',
      description: 'Crea o actualiza el objetivo actual del atleta con tipo, descripción y fechas. Úsala tras una petición explícita del entrenador.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        goal_type: athleteGoalType,
        title: z.string().trim().min(1).max(160),
        start_date: isoDate,
        target_date: isoDate,
        notes: z.string().trim().max(1000).optional(),
        coach_id: optionalCoachId,
      }),
      annotations: idempotentWriteAnnotations,
    },
    async (input) => {
      if (input.target_date < input.start_date) {
        return toolError('La fecha límite debe ser igual o posterior a la fecha de inicio.')
      }

      return run('set_athlete_goal', {
        coachId: input.coach_id,
        clientId: input.client_id,
        fallbackError: 'No se ha podido guardar el objetivo actual.',
      }, async ({ coachId, log }) => {
        const { data, error } = await supabase
          .from('athlete_current_goals')
          .upsert({
            coach_id: coachId,
            client_id: input.client_id,
            goal_type: input.goal_type,
            title: input.title,
            start_date: input.start_date,
            target_date: input.target_date,
            notes: input.notes?.trim() || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'coach_id,client_id' })
          .select('id, goal_type, title, start_date, target_date, notes, updated_at')
          .single()

        if (error || !data) throw new Error('No se ha podido guardar el objetivo actual.')
        log.record_id = data.id
        return { saved: true, current_goal: data }
      })
    },
  )

  registerScheduleTools(server, supabase)

  server.registerTool(
    'list_exercise_catalog',
    {
      title: 'Consultar biblioteca de ejercicios',
      description: 'Lista los ejercicios de fuerza de la biblioteca común. create_strength_program solo admite ejercicios de esta lista (nombre exacto, alias o catalog_exercise_id).',
      inputSchema: z.object({
        search: z.string().trim().max(80).optional().describe('Texto a buscar en el nombre, el grupo o los nombres alternativos.'),
        primary_group: z.string().trim().max(40).optional().describe('Grupo exacto, por ejemplo Pecho, Espalda o Cuádriceps.'),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    (input) => run('list_exercise_catalog', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido consultar la biblioteca de ejercicios.',
    }, async ({ log }) => {
      const [catalogResult, aliasResult] = await Promise.all([
        supabase.from('exercise_catalog').select('id, name, primary_group').eq('is_active', true).order('name'),
        supabase.from('exercise_catalog_aliases').select('alias_key, catalog_exercise_id'),
      ])
      if (catalogResult.error) throw new Error('No se ha podido consultar la biblioteca de ejercicios.')

      const aliasKeys = new Map<string, string[]>()
      for (const alias of aliasResult.data ?? []) {
        const keys = aliasKeys.get(alias.catalog_exercise_id) ?? []
        keys.push(alias.alias_key)
        aliasKeys.set(alias.catalog_exercise_id, keys)
      }
      const query = input.search ? exerciseNameKey(input.search) : ''
      const group = input.primary_group ? exerciseNameKey(input.primary_group) : ''
      const exercises = (catalogResult.data ?? []).filter((exercise: Row) => {
        if (group && exerciseNameKey(exercise.primary_group) !== group) return false
        if (!query) return true
        return exerciseNameKey(exercise.name).includes(query)
          || exerciseNameKey(exercise.primary_group).includes(query)
          || (aliasKeys.get(exercise.id) ?? []).some((key) => key.includes(query))
      })

      log.result_count = exercises.length
      return { exercises }
    }),
  )

  server.registerTool(
    'create_strength_program',
    {
      title: 'Crear programa de fuerza',
      description: 'Crea un programa de fuerza completo con días y ejercicios de la biblioteca (consulta list_exercise_catalog). Si algún ejercicio no está en la biblioteca no se crea nada y el error lo indica. Por seguridad se crea en borrador salvo que status sea active. active archiva el programa activo anterior del cliente y no admite fecha de inicio futura.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
        effective_from: isoDate,
        weeks: z.number().int().min(1).max(52),
        status: z.enum(['draft', 'active']).default('draft'),
        days: z.array(strengthDaySchema).min(1).max(7),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input) => run('create_strength_program', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se ha podido crear el programa de fuerza.',
    }, async ({ coachId, log }) => {
      // Una única transacción en Postgres: si falla un día o ejercicio no queda nada guardado.
      const { data, error } = await supabase.rpc('create_nexttrain_strength_program', {
        p_coach_id: coachId,
        p_client_id: input.client_id,
        p_payload: {
          name: input.name,
          weeks: input.weeks,
          status: input.status,
          effective_from: input.effective_from,
          days: input.days,
        },
      })
      if (error || !data?.id) {
        // P0001 y 42501 son los mensajes propios de la función; el resto se oculta.
        const ownMessage = error && ['P0001', '42501'].includes(error.code) ? error.message : null
        throw new Error(ownMessage ?? 'No se ha podido crear el programa de fuerza. No se guardó ningún cambio.')
      }

      log.record_id = data.id
      return {
        created: true,
        program: {
          id: data.id,
          client_id: input.client_id,
          name: data.name,
          status: data.status,
          effective_from: data.effective_from,
          effective_to: data.effective_to,
          weeks: data.weeks,
          days: data.day_count,
          exercises: data.exercise_count,
        },
        archived_program_ids: data.archived_program_ids ?? [],
      }
    }),
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
      annotations: writeAnnotations,
    },
    (input) => run('create_coach_task', {
      coachId: input.coach_id,
      clientId: input.client_id ?? null,
      fallbackError: 'No se ha podido crear la tarea.',
    }, async ({ coachId, log }) => {
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
      log.record_id = data.id
      return { created: true, task: data }
    }),
  )

  registerHistoryTools(server, supabase)
  registerNutritionTools(server, supabase)
  registerCardioTools(server, supabase)
  registerAgendaTools(server, supabase)
  registerCoachWriteTools(server, supabase)
  registerPrompts(server)

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
