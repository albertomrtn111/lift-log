import { z } from 'npm:zod@4.3.6'
import {
  addDays,
  createToolRunner,
  type Db,
  defaultHelpers,
  idempotentWriteAnnotations,
  inBatches,
  isoDate,
  readOnlyAnnotations,
  type Row,
  rows,
  type ToolHelpers,
  writeAnnotations,
} from './shared.ts'

type Server = any

const optionalCoachId = z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.')
const version = z.string().datetime({ offset: true }).describe('updated_at leído antes de editar. Si el registro cambió entretanto, no se guarda.')
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

// Mismos valores que la app (calendar-actions.ts y event-actions.ts).
const taskStatus = z.enum(['pending', 'completed'])
const taskPriority = z.enum(['normal', 'high'])
const eventType = z.enum(['race', 'test', 'camp', 'other']).describe('race=carrera, test=prueba, camp=concentración, other=otro')
const eventStatus = z.enum(['planned', 'completed', 'cancelled'])
const eventPriority = z.enum(['a', 'b', 'c']).describe('a=objetivo principal, b=secundario, c=preparatorio')

const TASK_FIELDS = 'id, client_id, task_date, title, description, status, priority, completed_at, created_at, updated_at'
const EVENT_FIELDS = 'id, client_id, title, event_date, event_type, status, priority, location, target, notes, created_at, updated_at'

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined
  return value?.trim() ? value.trim() : null
}

function sameVersion(current: string | null, expected: string) {
  return current === expected || (current !== null && Date.parse(current) === Date.parse(expected))
}

async function clientNames(db: Db, coachId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map<string, Row>()
  const found = await inBatches(db, 'clients', 'id, full_name, status', 'id', unique, (query) => query.eq('coach_id', coachId))
  return new Map(found.map((client) => [client.id, client]))
}

export function registerAgendaTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool('list_coach_tasks', {
    title: 'Listar tareas del entrenador',
    description: 'Lista las tareas de la agenda del entrenador, por defecto las pendientes. Devuelve updated_at para editarlas o completarlas con update_coach_task.',
    inputSchema: z.object({
      coach_id: optionalCoachId,
      status: z.enum(['pending', 'completed', 'all']).default('pending'),
      client_id: z.string().uuid().optional(),
      from_date: isoDate.optional(),
      to_date: isoDate.optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).max(5000).default(0),
    }),
    annotations: readOnlyAnnotations,
  }, async (input: Row) => {
    if (input.from_date && input.to_date && input.to_date < input.from_date) return helpers.toolError('El rango de fechas debe estar ordenado.')
    return run('list_coach_tasks', { coachId: input.coach_id, clientId: input.client_id ?? null, fallbackError: 'No se han podido listar las tareas.' },
      async ({ coachId, today, log }) => {
        let query = db.from('coach_tasks').select(TASK_FIELDS).eq('coach_id', coachId)
        if (input.status !== 'all') query = query.eq('status', input.status)
        if (input.client_id) query = query.eq('client_id', input.client_id)
        if (input.from_date) query = query.gte('task_date', input.from_date)
        if (input.to_date) query = query.lte('task_date', input.to_date)
        const found = rows(await query.order('task_date', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(input.offset, input.offset + input.limit), 'las tareas')
        const tasks = found.slice(0, input.limit)
        const names = await clientNames(db, coachId, tasks.map((task) => task.client_id))
        log.result_count = tasks.length
        return {
          coach_id: coachId, today,
          tasks: tasks.map((task) => ({
            ...task,
            client_name: task.client_id ? names.get(task.client_id)?.full_name ?? null : null,
            overdue: task.status === 'pending' && task.task_date < today,
          })),
          has_more: found.length > input.limit, next_offset: found.length > input.limit ? input.offset + input.limit : null,
        }
      })
  })

  server.registerTool('update_coach_task', {
    title: 'Editar o completar una tarea',
    description: 'Edita una tarea (título, descripción, fecha, prioridad o cliente), la marca como completada o la reabre. Lee antes list_coach_tasks y envía expected_updated_at.',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      task_id: z.string().uuid(),
      expected_updated_at: version,
      title: z.string().trim().min(1).max(200).optional(),
      description: optionalText(2000),
      task_date: isoDate.optional().describe('Nueva fecha; sirve también para aplazarla.'),
      priority: taskPriority.optional(),
      client_id: z.string().uuid().nullable().optional().describe('null desvincula la tarea del cliente.'),
      status: taskStatus.optional().describe('completed la completa; pending la reabre.'),
    }),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_coach_task', {
    coachId: input.coach_id,
    // Al vincular un cliente se comprueba que pertenece al espacio.
    clientId: input.client_id ?? undefined,
    fallbackError: 'No se ha podido editar la tarea.',
  }, async ({ coachId, log }) => {
    log.record_id = input.task_id
    const { data: current, error } = await db.from('coach_tasks').select(TASK_FIELDS).eq('coach_id', coachId).eq('id', input.task_id).maybeSingle()
    if (error || !current) throw new Error('Tarea no encontrada en el espacio del entrenador.')
    if (!sameVersion(current.updated_at, input.expected_updated_at)) throw new Error('La tarea cambió; vuelve a leer list_coach_tasks.')

    const now = new Date().toISOString()
    const payload: Row = { updated_at: now }
    if (input.title !== undefined) payload.title = input.title
    if (input.description !== undefined) payload.description = emptyToNull(input.description)
    if (input.task_date !== undefined) payload.task_date = input.task_date
    if (input.priority !== undefined) payload.priority = input.priority
    if (input.client_id !== undefined) payload.client_id = input.client_id
    if (input.status !== undefined && input.status !== current.status) {
      payload.status = input.status
      payload.completed_at = input.status === 'completed' ? now : null
    }

    const { data, error: updateError } = await db.from('coach_tasks').update(payload)
      .eq('coach_id', coachId).eq('id', input.task_id).eq('updated_at', current.updated_at)
      .select(TASK_FIELDS).maybeSingle()
    if (updateError || !data) throw new Error('No se ha podido editar la tarea o cambió durante el guardado. Vuelve a leer list_coach_tasks.')
    return { updated: true, task: data }
  }))

  const eventFields = {
    title: z.string().trim().min(1).max(160),
    event_date: isoDate,
    event_type: eventType,
    status: eventStatus,
    priority: eventPriority,
    location: optionalText(200),
    target: optionalText(300).describe('Meta, por ejemplo marca o distancia: «Sub 3:30 en 42 km».'),
    notes: optionalText(2000),
  }

  server.registerTool('create_client_event', {
    title: 'Crear evento del cliente',
    description: 'Añade una carrera, prueba, concentración u otro evento con fecha al calendario del cliente. Úsala tras una petición explícita del entrenador.',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      ...eventFields,
      event_type: eventFields.event_type.default('race'),
      status: eventFields.status.default('planned'),
      priority: eventFields.priority.default('b'),
    }),
    annotations: writeAnnotations,
  }, (input: Row) => run('create_client_event', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido crear el evento.' },
    async ({ coachId, log }) => {
      const { data, error } = await db.from('client_events').insert({
        coach_id: coachId, client_id: input.client_id, title: input.title, event_date: input.event_date,
        event_type: input.event_type, status: input.status, priority: input.priority,
        location: emptyToNull(input.location) ?? null, target: emptyToNull(input.target) ?? null, notes: emptyToNull(input.notes) ?? null,
      }).select(EVENT_FIELDS).single()
      if (error || !data) throw new Error('No se ha podido crear el evento.')
      log.record_id = data.id
      return { created: true, event: data }
    }))

  server.registerTool('update_client_event', {
    title: 'Editar evento del cliente',
    description: 'Edita un evento existente: fecha, nombre, tipo, prioridad, meta, notas o estado (planned, completed, cancelled). Lee antes list_client_events y envía expected_updated_at. Los campos omitidos se conservan.',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      event_id: z.string().uuid(),
      expected_updated_at: version,
      title: eventFields.title.optional(),
      event_date: eventFields.event_date.optional(),
      event_type: eventFields.event_type.optional(),
      status: eventFields.status.optional(),
      priority: eventFields.priority.optional(),
      location: eventFields.location,
      target: eventFields.target,
      notes: eventFields.notes,
    }),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_client_event', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido editar el evento.' },
    async ({ coachId, log }) => {
      log.record_id = input.event_id
      const { data: current, error } = await db.from('client_events').select(EVENT_FIELDS)
        .eq('coach_id', coachId).eq('client_id', input.client_id).eq('id', input.event_id).maybeSingle()
      if (error || !current) throw new Error('Evento no encontrado en este cliente y espacio.')
      if (!sameVersion(current.updated_at, input.expected_updated_at)) throw new Error('El evento cambió; vuelve a leer list_client_events.')

      const payload: Row = { updated_at: new Date().toISOString() }
      for (const key of ['title', 'event_date', 'event_type', 'status', 'priority']) {
        if (input[key] !== undefined) payload[key] = input[key]
      }
      for (const key of ['location', 'target', 'notes']) {
        if (input[key] !== undefined) payload[key] = emptyToNull(input[key])
      }

      const { data, error: updateError } = await db.from('client_events').update(payload)
        .eq('coach_id', coachId).eq('client_id', input.client_id).eq('id', input.event_id).eq('updated_at', current.updated_at)
        .select(EVENT_FIELDS).maybeSingle()
      if (updateError || !data) throw new Error('No se ha podido editar el evento o cambió durante el guardado. Vuelve a leer list_client_events.')
      return { updated: true, event: data }
    }))

  server.registerTool('get_coach_inbox', {
    title: 'Bandeja del entrenador',
    description: 'Reúne en una llamada lo pendiente de todos los clientes activos: check-ins enviados sin revisión aprobada, actividades de Strava sin enlazar a una sesión y tareas pendientes de hoy o vencidas.',
    inputSchema: z.object({
      coach_id: optionalCoachId,
      strava_days: z.number().int().min(1).max(90).default(21).describe('Días hacia atrás para las actividades de Strava (la app usa 21).'),
      limit: z.number().int().min(1).max(100).default(30).describe('Máximo de elementos por sección.'),
    }),
    annotations: readOnlyAnnotations,
  }, (input: Row) => run('get_coach_inbox', { coachId: input.coach_id, fallbackError: 'No se ha podido cargar la bandeja.' },
    async ({ coachId, today, log }) => {
      const stravaSince = addDays(today, -input.strava_days)
      // Se pide más de limit porque los elementos de clientes inactivos se descartan después.
      const fetchLimit = input.limit * 3
      const [checkinResult, stravaResult, taskResult] = await Promise.all([
        // Al enviar el formulario la app deja el check-in en «reviewed»; al aprobar la revisión pasa a «archived».
        db.from('checkins')
          .select('id, client_id, submitted_at, period_start, period_end, training_adherence_pct, nutrition_adherence_pct, energy, stress, injuries')
          .eq('coach_id', coachId).eq('type', 'checkin').eq('status', 'reviewed').not('submitted_at', 'is', null)
          .order('submitted_at', { ascending: true }).limit(fetchLimit),
        db.from('strava_activities')
          .select('id, client_id, name, sport_type, start_date, start_date_local, distance_meters, moving_time_seconds, feedback_status')
          .eq('coach_id', coachId).eq('is_deleted', false).is('cardio_session_id', null).is('matched_planned_session_id', null)
          .gte('start_date', `${stravaSince}T00:00:00Z`)
          .order('start_date', { ascending: false }).limit(fetchLimit),
        db.from('coach_tasks').select(TASK_FIELDS)
          .eq('coach_id', coachId).eq('status', 'pending').lte('task_date', today)
          .order('task_date', { ascending: true }).order('created_at', { ascending: true }).limit(fetchLimit),
      ])
      const checkins = rows(checkinResult, 'los check-ins')
      const strava = rows(stravaResult, 'las actividades de Strava')
      const tasks = rows(taskResult, 'las tareas')

      const reviews = await inBatches(db, 'reviews', 'id, checkin_id, status, ai_status, message_to_client', 'checkin_id', checkins.map((item) => item.id),
        (query) => query.eq('coach_id', coachId))
      const reviewByCheckin = new Map(reviews.map((review) => [review.checkin_id, review]))
      const names = await clientNames(db, coachId, [...checkins, ...strava, ...tasks].map((item) => item.client_id))
      // Como el panel de la app: solo clientes activos. Las tareas sin cliente siempre cuentan.
      const active = (clientId: string | null) => names.get(clientId ?? '')?.status === 'active'
      const named = (item: Row) => ({ ...item, client_name: names.get(item.client_id)?.full_name ?? null })
      const section = (items: Row[]) => ({ items: items.slice(0, input.limit), has_more: items.length > input.limit })

      const toReview = checkins
        .filter((checkin) => active(checkin.client_id) && reviewByCheckin.get(checkin.id)?.status !== 'approved')
        .map((checkin) => {
          const review = reviewByCheckin.get(checkin.id)
          return {
            ...named(checkin),
            review_id: review?.id ?? null, review_status: review?.status ?? null, ai_status: review?.ai_status ?? null,
            has_draft_message: Boolean(review?.message_to_client?.trim()),
          }
        })
      const unlinked = strava.filter((activity) => active(activity.client_id)).map(named)
      const pendingTasks = tasks.filter((task) => !task.client_id || active(task.client_id))
        .map((task) => ({ ...named(task), overdue: task.task_date < today }))

      const result = {
        coach_id: coachId, today,
        checkins_to_review: section(toReview),
        unlinked_strava_activities: { since: stravaSince, ...section(unlinked) },
        pending_tasks: section(pendingTasks),
        note: 'Los check-ins por revisar van del más antiguo al más reciente. Las actividades de Strava sin enlazar no tienen sesión de cardio asociada; feedback_status=pending indica que el atleta aún no las ha revisado.',
      }
      log.result_count = result.checkins_to_review.items.length + result.unlinked_strava_activities.items.length + result.pending_tasks.items.length
      return result
    }))
}
