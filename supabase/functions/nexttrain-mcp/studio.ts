import { z } from 'npm:zod@4.3.6'
import {
  addDays,
  createToolRunner,
  type Db,
  defaultHelpers,
  isoDate,
  readOnlyAnnotations,
  type Row,
  rows,
  type ToolHelpers,
  writeAnnotations,
} from './shared.ts'

type Server = any

const optionalCoachId = z.string().uuid().optional().describe('Solo si la cuenta pertenece a varios espacios.')

const prescription = {
  sets: z.number().int().min(1).max(30).nullable().optional(),
  reps: z.string().trim().max(40).nullable().optional().describe('Repeticiones, por ejemplo 10 u 8-10.'),
  time_seconds: z.number().int().min(0).nullable().optional(),
  load_kg: z.number().min(0).max(9999).nullable().optional(),
  rir: z.number().min(0).max(10).nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).optional().describe('Material o variante: banda roja, fitball…'),
}

const newExercise = z.object({
  catalog_exercise_id: z.string().uuid().optional().describe('ID de list_exercise_catalog.'),
  name: z.string().trim().min(1).max(160).optional().describe('Nombre o alias, si no tienes el ID.'),
  section: z.string().trim().min(1).max(80).optional().describe('Subbloque de la sesión, por ejemplo Calentamiento.'),
  ...prescription,
}).refine((input) => input.catalog_exercise_id || input.name, 'Indica catalog_exercise_id o name.')

const SESSION_FIELDS = ['session_date', 'start_time', 'duration_min', 'professional_id', 'name', 'arrival_note', 'rpe', 'wellness_sleep', 'wellness_fatigue', 'wellness_stress', 'wellness_soreness'] as const

// Mensajes de la base de datos que ayudan a corregir la petición.
export function studioError(error: { code?: string; message?: string; details?: string } | null, fallback: string) {
  if (error?.code === 'NT409') {
    return new Error('Otra persona ha cambiado esto. Vuelve a leerlo con get_studio_session y repite el cambio con la versión nueva.')
  }
  if (error?.code === '22023' || error?.code === '42501') return new Error(error.message ?? fallback)
  return new Error(fallback)
}

/** Resumen de una sesión para listarla. */
export function sessionSummary(session: Row, items: Row[]) {
  const own = items.filter((item) => item.session_id === session.id)
  return {
    id: session.id,
    date: session.session_date,
    start_time: session.start_time,
    name: session.name,
    status: session.status,
    origin: session.origin,
    professional_id: session.professional_id,
    exercises: own.length,
    exercises_done: own.filter((item) => item.is_done).length,
    version: session.version,
  }
}

/** Sesión completa, con cada ejercicio bajo su subbloque y lo realizado serie a serie. */
export function sessionDetail(
  session: Row,
  sections: Row[],
  items: Row[],
  sets: Row[],
  tagNames: Map<string, string[]>,
  attendance: Row[] = [],
  people: Row[] = [],
) {
  const titles = new Map(sections.map((section) => [section.id, section.title]))
  return {
    id: session.id,
    client_id: session.client_id,
    group_id: session.group_id ?? null,
    ...(session.group_id ? { attendance } : {}),
    date: session.session_date,
    start_time: session.start_time,
    duration_min: session.duration_min,
    name: session.name,
    status: session.status,
    origin: session.origin,
    professional_id: session.professional_id,
    arrival: {
      note: session.arrival_note,
      sleep: session.wellness_sleep,
      fatigue: session.wellness_fatigue,
      stress: session.wellness_stress,
      soreness: session.wellness_soreness,
      score: session.wellness_score,
    },
    rpe: session.rpe,
    version: session.version,
    sections: sections.map((section) => section.title),
    exercises: [...items].sort((a, b) => a.sort_order - b.sort_order).map((item) => ({
      item_id: item.id,
      catalog_exercise_id: item.catalog_exercise_id,
      exercise: item.exercise_catalog?.name ?? null,
      section: titles.get(item.section_id) ?? null,
      sets: item.sets,
      reps: item.reps,
      time_seconds: item.time_seconds,
      load_kg: item.load_kg,
      rir: item.rir,
      rpe: item.rpe,
      next_load: item.next_load,
      circuit: item.circuit,
      note: item.note,
      tags: tagNames.get(item.id) ?? [],
      done: item.is_done,
      version: item.version,
      ...(session.group_id
        ? { people: people.filter((person) => person.item_id === item.id).map(({ item_id: _item, ...person }) => person) }
        : {}),
      performed_sets: sets
        .filter((set) => set.item_id === item.id)
        .sort((a, b) => a.set_index - b.set_index)
        .map(({ item_id: _item, ...set }) => set),
    })),
  }
}

/** Campos de un ejercicio para studio_add_items. */
export function exerciseFields(exercise: Row, catalogId: string): Row {
  const { name: _name, section, catalog_exercise_id: _id, ...fields } = exercise
  return { ...fields, catalog_exercise_id: catalogId, ...(section ? { section_title: section } : {}) }
}

const groupSlot = z.object({
  weekday: z.number().int().min(0).max(6).describe('0 es lunes y 6 domingo.'),
  time: z.string().regex(/^\d{2}:\d{2}$/).describe('Hora, HH:MM.'),
})

/** Una cita para la IA: sin contacto, solo lo que hace falta para trabajar con ella. */
export function agendaEntry(row: Row) {
  return {
    id: row.id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    attendance: row.attendance,
    client_id: row.client_id,
    client: row.clients?.full_name ?? row.external_patients?.full_name ?? null,
    external_patient_id: row.external_patients?.id ?? null,
    professional_id: row.professional_id,
    service: row.agenda_services?.name ?? null,
    session_id: row.session_id,
  }
}

/** Grupos con sus integrantes y su próxima clase. */
export function groupSummaries(groups: Row[], members: Row[], upcoming: Row[]) {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    schedule: group.schedule,
    professional_ids: group.professional_ids,
    archived: !group.is_active,
    members: members
      .filter((member) => member.group_id === group.id)
      .map((member) => ({ client_id: member.client_id, name: member.clients?.full_name ?? null })),
    next_session: upcoming.find((session) => session.group_id === group.id)?.session_date ?? null,
  }))
}

async function resolveExercises(db: Db, exercises: Row[]) {
  return await Promise.all(exercises.map(async (exercise) => {
    const { data } = await db.rpc('resolve_catalog_exercise', {
      p_catalog_exercise_id: exercise.catalog_exercise_id ?? null,
      p_name: exercise.name ?? null,
    })
    if (!data?.id) {
      throw new Error(`«${exercise.name ?? exercise.catalog_exercise_id}» no está en el catálogo. Búscalo con list_exercise_catalog.`)
    }
    return { id: data.id as string, name: data.name as string, fields: exerciseFields(exercise, data.id) }
  }))
}

async function loadSession(db: Db, coachId: string, sessionId: string): Promise<Row> {
  const { data, error } = await db.from('studio_sessions').select('*').eq('id', sessionId).eq('coach_id', coachId).maybeSingle()
  if (error || !data) throw new Error('Sesión no encontrada en este espacio.')
  return data
}

export function registerStudioTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'list_studio_sessions',
    {
      title: 'Ver sesiones de sala',
      description: 'Lista las sesiones presenciales de un cliente en un rango de fechas, con su estado y un resumen.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        from_date: isoDate.optional(),
        to_date: isoDate.optional(),
        limit: z.number().int().min(1).max(100).default(30),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('list_studio_sessions', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se han podido consultar las sesiones de sala.',
    }, async ({ log }) => {
      let query = db.from('studio_sessions')
        .select('id, session_date, start_time, name, status, origin, professional_id, version')
        .eq('client_id', input.client_id)
        .order('session_date', { ascending: false })
        .limit(input.limit)
      if (input.from_date) query = query.gte('session_date', input.from_date)
      if (input.to_date) query = query.lte('session_date', input.to_date)
      const sessions = rows(await query, 'sesiones', 'No se han podido consultar las sesiones de sala.')

      const ids = sessions.map((session) => session.id)
      const items = ids.length > 0
        ? rows(
          await db.from('studio_session_items').select('session_id, is_done').in('session_id', ids),
          'ejercicios',
          'No se han podido consultar las sesiones de sala.',
        )
        : []

      log.result_count = sessions.length
      return { client_id: input.client_id, sessions: sessions.map((session) => sessionSummary(session, items)) }
    }),
  )

  server.registerTool(
    'get_studio_session',
    {
      title: 'Ver una sesión de sala',
      description: 'Devuelve una sesión completa: ejercicios, subbloques, series realizadas, cómo llegó, RPE y versión. La versión hace falta para cambiarla.',
      inputSchema: z.object({ session_id: z.string().uuid(), coach_id: optionalCoachId }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('get_studio_session', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido consultar la sesión de sala.',
    }, async ({ coachId, log }) => {
      const session = await loadSession(db, coachId, input.session_id)
      const error = 'No se ha podido consultar la sesión de sala.'
      const [sections, items] = await Promise.all([
        db.from('studio_session_sections').select('id, title, sort_order').eq('session_id', session.id).order('sort_order'),
        db.from('studio_session_items')
          .select('*, exercise_catalog(name), studio_item_tags(studio_tags(name))')
          .eq('session_id', session.id),
      ])
      const itemRows = rows(items, 'ejercicios', error)
      const ids = itemRows.map((item) => item.id)
      const sets = ids.length > 0
        ? rows(
          await db.from('studio_session_sets')
            .select('item_id, client_id, set_index, load_kg, reps, time_seconds, rir, rpe, is_detailed')
            .in('item_id', ids),
          'series',
          error,
        )
        : []
      const tagNames = new Map(itemRows.map((item) => [
        item.id as string,
        (item.studio_item_tags ?? []).map((link: Row) => link.studio_tags?.name).filter(Boolean) as string[],
      ]))

      const attendance = session.group_id
        ? rows(
          await db.from('studio_session_attendance').select('client_id, status, origin').eq('session_id', session.id),
          'asistencia',
          error,
        )
        : []
      const people = session.group_id && ids.length > 0
        ? rows(
          await db.from('studio_item_people')
            .select('item_id, client_id, load_kg, reps, time_seconds, rir, rpe, next_load')
            .in('item_id', ids),
          'valores por persona',
          error,
        )
        : []

      log.record_id = session.id
      return { session: sessionDetail(session, rows(sections, 'subbloques', error), itemRows, sets, tagNames, attendance, people) }
    }),
  )

  server.registerTool(
    'create_studio_session',
    {
      title: 'Crear una sesión de sala',
      description: 'Crea una sesión presencial prevista con sus ejercicios, de la biblioteca o de una rutina. Con dry_run comprueba los ejercicios sin guardar nada.',
      inputSchema: z.object({
        client_id: z.string().uuid(),
        session_date: isoDate,
        start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Hora, HH:MM.'),
        name: z.string().trim().min(1).max(120).optional(),
        professional_id: z.string().uuid().optional().describe('Por defecto, quien la crea.'),
        exercises: z.array(newExercise).max(60).default([]),
        routine_id: z.string().uuid().optional().describe('Añade también los ejercicios de esta rutina.'),
        dry_run: z.boolean().default(false),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('create_studio_session', {
      coachId: input.coach_id,
      clientId: input.client_id,
      fallbackError: 'No se ha podido crear la sesión de sala.',
    }, async ({ log }) => {
      const resolved = await resolveExercises(db, input.exercises)
      let routineItems: Row[] = []
      if (input.routine_id) {
        const { data, error } = await db.from('studio_routine_items')
          .select('catalog_exercise_id, sets, reps, time_seconds, load_kg, rir, rpe, note')
          .eq('routine_id', input.routine_id)
          .order('sort_order')
        if (error || !data?.length) throw new Error('Esa rutina no existe o no tiene ejercicios.')
        routineItems = data
      }

      if (input.dry_run) {
        return {
          dry_run: true,
          exercises: resolved.map((exercise) => ({ id: exercise.id, name: exercise.name })),
          routine_exercises: routineItems.length,
        }
      }

      const batch = crypto.randomUUID()
      const { data: session, error } = await db.rpc('studio_create_session', {
        p_client_id: input.client_id,
        p_session_date: input.session_date,
        p_start_time: input.start_time ?? null,
        p_professional_id: input.professional_id ?? null,
        p_name: input.name ?? null,
        p_batch_id: batch,
      })
      if (error) throw studioError(error, 'No se ha podido crear la sesión de sala.')

      if (resolved.length > 0) {
        const added = await db.rpc('studio_add_items', {
          p_session_id: session.id,
          p_items: resolved.map((exercise) => exercise.fields),
          p_batch_id: batch,
        })
        if (added.error) throw studioError(added.error, 'La sesión se ha creado, pero sus ejercicios no.')
      }
      if (routineItems.length > 0) {
        const added = await db.rpc('studio_add_items', {
          p_session_id: session.id,
          p_items: routineItems,
          p_routine_id: input.routine_id,
          p_batch_id: batch,
        })
        if (added.error) throw studioError(added.error, 'La sesión se ha creado, pero su rutina no.')
      }

      log.record_id = session.id
      return {
        created: true,
        session: { id: session.id, date: session.session_date, status: session.status, version: session.version },
        exercises: resolved.length + routineItems.length,
      }
    }),
  )

  server.registerTool(
    'update_studio_session',
    {
      title: 'Cambiar una sesión de sala',
      description: 'Cambia los datos de una sesión, añade, cambia o quita ejercicios y ajusta su orden. Exige la versión leída con get_studio_session: si otro la cambió, no pisa su trabajo.',
      inputSchema: z.object({
        session_id: z.string().uuid(),
        version: z.number().int().describe('Versión de la sesión leída con get_studio_session.'),
        changes: z.object({
          session_date: isoDate.optional(),
          start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
          duration_min: z.number().int().min(1).max(600).nullable().optional(),
          professional_id: z.string().uuid().nullable().optional(),
          name: z.string().trim().max(120).nullable().optional(),
          status: z.enum(['planned', 'cancelled', 'no_show']).optional().describe('Pasa a hecha sola al marcar un ejercicio.'),
          arrival_note: z.string().trim().max(1000).nullable().optional(),
          rpe: z.number().min(0).max(10).nullable().optional(),
          wellness_sleep: z.number().int().min(0).max(10).nullable().optional(),
          wellness_fatigue: z.number().int().min(0).max(10).nullable().optional(),
          wellness_stress: z.number().int().min(0).max(10).nullable().optional(),
          wellness_soreness: z.number().int().min(0).max(10).nullable().optional(),
        }).default({}),
        add_exercises: z.array(newExercise).max(60).default([]),
        update_exercises: z.array(z.object({
          item_id: z.string().uuid(),
          version: z.number().int(),
          ...prescription,
        })).max(60).default([]),
        remove_exercises: z.array(z.object({ item_id: z.string().uuid(), version: z.number().int() })).max(60).default([]),
        exercise_order: z.array(z.string().uuid()).max(120).optional().describe('item_id de todos los ejercicios, en el orden nuevo.'),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('update_studio_session', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido cambiar la sesión de sala.',
    }, async ({ coachId, log }) => {
      const session = await loadSession(db, coachId, input.session_id)
      const resolved = await resolveExercises(db, input.add_exercises)
      const batch = crypto.randomUUID()
      const failed = 'No se ha podido cambiar la sesión de sala.'

      const patch: Row = {}
      for (const field of [...SESSION_FIELDS, 'status']) {
        if (input.changes[field] !== undefined) patch[field] = input.changes[field]
      }
      const updated = await db.rpc('studio_update_session', {
        p_session_id: session.id,
        p_version: input.version,
        p_patch: patch,
        p_batch_id: batch,
      })
      if (updated.error) throw studioError(updated.error, failed)

      for (const { item_id, version, ...fields } of input.update_exercises) {
        const { error } = await db.rpc('studio_save_item', {
          p_session_id: session.id, p_item_id: item_id, p_version: version, p_fields: fields, p_batch_id: batch,
        })
        if (error) throw studioError(error, failed)
      }
      for (const { item_id, version } of input.remove_exercises) {
        const { error } = await db.rpc('studio_delete_item', { p_item_id: item_id, p_version: version, p_batch_id: batch })
        if (error) throw studioError(error, failed)
      }
      if (resolved.length > 0) {
        const { error } = await db.rpc('studio_add_items', {
          p_session_id: session.id,
          p_items: resolved.map((exercise) => exercise.fields),
          p_batch_id: batch,
        })
        if (error) throw studioError(error, failed)
      }
      if (input.exercise_order) {
        const { data: current, error: readError } = await db.from('studio_session_items').select('id, section_id').eq('session_id', session.id)
        if (readError) throw new Error(failed)
        const sectionOf = new Map((current ?? []).map((item: Row) => [item.id, item.section_id]))
        const { data: sections } = await db.from('studio_session_sections').select('id').eq('session_id', session.id).order('sort_order')
        const { error } = await db.rpc('studio_arrange_session', {
          p_session_id: session.id,
          p_section_ids: (sections ?? []).map((section: Row) => section.id),
          p_items: input.exercise_order
            .filter((id: string) => sectionOf.has(id))
            .map((id: string) => ({ id, section_id: sectionOf.get(id) })),
          p_batch_id: batch,
        })
        if (error) throw studioError(error, failed)
      }

      log.record_id = session.id
      return { updated: true, session: { id: session.id, status: updated.data.status, version: updated.data.version } }
    }),
  )

  server.registerTool(
    'record_studio_sets',
    {
      title: 'Registrar lo realizado en sala',
      description: 'Registra un ejercicio de una sesión. Sin sets lo marca como realizado con lo prescrito; con sets guarda cada serie, y lo que falte hereda lo general. La sesión pasa a hecha sola.',
      inputSchema: z.object({
        item_id: z.string().uuid().describe('item_id de get_studio_session.'),
        version: z.number().int().describe('Versión del ejercicio leída con get_studio_session.'),
        sets: z.array(z.object({
          load_kg: z.number().min(0).max(9999).nullable().optional(),
          reps: z.number().int().min(0).nullable().optional(),
          time_seconds: z.number().int().min(0).nullable().optional(),
          rir: z.number().min(0).max(10).nullable().optional(),
          rpe: z.number().min(0).max(10).nullable().optional(),
        })).min(1).max(30).optional(),
        done: z.boolean().default(true).describe('Solo sin sets: false lo desmarca.'),
        client_id: z.string().uuid().optional().describe('En una sesión de grupo, la persona cuyas series se registran. Tiene que haber venido.'),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('record_studio_sets', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido registrar el ejercicio.',
    }, async ({ coachId, log }) => {
      const { data: owned, error: readError } = await db.from('studio_session_items')
        .select('id').eq('id', input.item_id).eq('coach_id', coachId).maybeSingle()
      if (readError || !owned) throw new Error('Ejercicio no encontrado en este espacio.')

      const { data, error } = input.sets && input.client_id
        ? await db.rpc('studio_save_person_sets', {
          p_item_id: input.item_id, p_client_id: input.client_id, p_version: input.version, p_sets: input.sets,
        })
        : input.sets
        ? await db.rpc('studio_save_sets', { p_item_id: input.item_id, p_version: input.version, p_sets: input.sets })
        : await db.rpc('studio_set_item_done', { p_item_id: input.item_id, p_version: input.version, p_done: input.done })
      if (error) throw studioError(error, 'No se ha podido registrar el ejercicio.')

      log.record_id = input.item_id
      return { recorded: true, item: { id: data.id, done: data.is_done, version: data.version } }
    }),
  )

  server.registerTool(
    'get_agenda',
    {
      title: 'Ver la agenda de un día',
      description: 'Citas de un día con su sesión de sala. Las citas conectadas se cambian en el software del centro, no aquí.',
      inputSchema: z.object({ date: isoDate.optional().describe('Por defecto, hoy.'), coach_id: optionalCoachId }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('get_agenda', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido consultar la agenda.',
    }, async ({ coachId, today, timeZone, log }) => {
      const date = input.date ?? today
      const result = await db.from('agenda_appointments')
        .select('id, starts_at, ends_at, status, attendance, client_id, professional_id, session_id, clients(full_name), agenda_services(name), external_patients(id, full_name)')
        .eq('coach_id', coachId)
        .is('deleted_at', null)
        .gte('starts_at', `${addDays(date, -1)}T12:00:00Z`)
        .lte('starts_at', `${addDays(date, 1)}T12:00:00Z`)
        .order('starts_at')
      // El rango es holgado y aquí se recorta al día del centro, en verano o en invierno.
      const inDay = new Intl.DateTimeFormat('en-CA', { timeZone })
      const appointments = rows(result, 'citas', 'No se ha podido consultar la agenda.')
        .filter((row) => inDay.format(new Date(row.starts_at)) === date)
      log.result_count = appointments.length
      return { date, appointments: appointments.map(agendaEntry) }
    }),
  )

  server.registerTool(
    'link_external_patient',
    {
      title: 'Vincular un paciente de la agenda',
      description: 'Asocia un paciente de la agenda externa con un cliente de NexTrain, o lo desvincula sin client_id.',
      inputSchema: z.object({
        external_patient_id: z.string().uuid().describe('ID de get_agenda.'),
        client_id: z.string().uuid().optional(),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('link_external_patient', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido vincular el paciente.',
    }, async ({ log }) => {
      const { error } = await db.rpc('agenda_link_patient', {
        p_patient_id: input.external_patient_id,
        p_client_id: input.client_id ?? null,
      })
      if (error) throw studioError(error, 'No se ha podido vincular el paciente.')
      log.record_id = input.external_patient_id
      return { linked: Boolean(input.client_id), external_patient_id: input.external_patient_id, client_id: input.client_id ?? null }
    }),
  )

  server.registerTool(
    'list_training_groups',
    {
      title: 'Ver los grupos de sala',
      description: 'Lista los grupos con su horario, sus integrantes y su próxima clase.',
      inputSchema: z.object({ include_archived: z.boolean().default(false), coach_id: optionalCoachId }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('list_training_groups', {
      coachId: input.coach_id,
      fallbackError: 'No se han podido consultar los grupos.',
    }, async ({ coachId, today, log }) => {
      const failed = 'No se han podido consultar los grupos.'
      let query = db.from('training_groups').select('id, name, kind, schedule, professional_ids, is_active').eq('coach_id', coachId).order('name')
      if (!input.include_archived) query = query.eq('is_active', true)
      const groups = rows(await query, 'grupos', failed)
      const ids = groups.map((group) => group.id)
      const [members, upcoming] = ids.length > 0
        ? await Promise.all([
          db.from('training_group_members').select('group_id, client_id, clients(full_name)').in('group_id', ids).is('left_on', null),
          db.from('studio_sessions').select('group_id, session_date').in('group_id', ids).gte('session_date', today).order('session_date'),
        ])
        : [{ data: [] }, { data: [] }]

      log.result_count = groups.length
      return { groups: groupSummaries(groups, rows(members, 'integrantes', failed), rows(upcoming, 'clases', failed)) }
    }),
  )

  server.registerTool(
    'create_training_group',
    {
      title: 'Crear un grupo de sala',
      description: 'Crea un grupo con su horario e integrantes.',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(120),
        schedule: z.array(groupSlot).max(14).default([]),
        professional_ids: z.array(z.string().uuid()).max(20).default([]),
        client_ids: z.array(z.string().uuid()).max(100).default([]),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('create_training_group', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido crear el grupo.',
    }, async ({ coachId, log }) => {
      const { data, error } = await db.rpc('studio_save_group', {
        p_coach_id: coachId, p_group_id: null, p_name: input.name, p_kind: 'schedule',
        p_schedule: input.schedule, p_professional_ids: input.professional_ids,
      })
      if (error) throw studioError(error, 'No se ha podido crear el grupo.')
      if (input.client_ids.length > 0) {
        const members = await db.rpc('studio_set_group_members', { p_group_id: data.id, p_client_ids: input.client_ids })
        if (members.error) throw studioError(members.error, 'El grupo se ha creado, pero sus integrantes no.')
      }
      log.record_id = data.id
      return { created: true, group: { id: data.id, name: data.name } }
    }),
  )

  server.registerTool(
    'update_training_group',
    {
      title: 'Cambiar un grupo de sala',
      description: 'Cambia nombre, horario, profesionales o integrantes de un grupo, lo archiva o lo une con otro. client_ids deja exactamente esos integrantes; quien sale conserva su historial.',
      inputSchema: z.object({
        group_id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        schedule: z.array(groupSlot).max(14).optional(),
        professional_ids: z.array(z.string().uuid()).max(20).optional(),
        client_ids: z.array(z.string().uuid()).max(100).optional(),
        archived: z.boolean().optional(),
        merge_into: z.string().uuid().optional().describe('Pasa sus sesiones e integrantes a este otro grupo y lo archiva.'),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('update_training_group', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido cambiar el grupo.',
    }, async ({ coachId, log }) => {
      const failed = 'No se ha podido cambiar el grupo.'
      const { data: group, error: readError } = await db.from('training_groups')
        .select('id, name, kind, schedule, professional_ids')
        .eq('id', input.group_id).eq('coach_id', coachId).maybeSingle()
      if (readError || !group) throw new Error('Grupo no encontrado en este espacio.')

      if (input.name !== undefined || input.schedule !== undefined || input.professional_ids !== undefined) {
        const { error } = await db.rpc('studio_save_group', {
          p_coach_id: coachId, p_group_id: group.id, p_name: input.name ?? group.name, p_kind: group.kind,
          p_schedule: input.schedule ?? group.schedule, p_professional_ids: input.professional_ids ?? group.professional_ids,
        })
        if (error) throw studioError(error, failed)
      }
      if (input.client_ids) {
        const { error } = await db.rpc('studio_set_group_members', { p_group_id: group.id, p_client_ids: input.client_ids })
        if (error) throw studioError(error, failed)
      }
      if (input.archived !== undefined) {
        const { error } = await db.rpc('studio_archive_group', { p_group_id: group.id, p_active: !input.archived })
        if (error) throw studioError(error, failed)
      }
      if (input.merge_into) {
        const { error } = await db.rpc('studio_merge_groups', { p_source_id: group.id, p_target_id: input.merge_into })
        if (error) throw studioError(error, failed)
      }

      log.record_id = group.id
      return { updated: true, group: { id: group.id } }
    }),
  )

  server.registerTool(
    'create_group_session',
    {
      title: 'Crear una clase de grupo',
      description: 'Crea una sesión de grupo prevista, con sus ejercicios. La asistencia nace con los integrantes, sin marcar.',
      inputSchema: z.object({
        group_id: z.string().uuid(),
        session_date: isoDate,
        start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Hora, HH:MM.'),
        name: z.string().trim().min(1).max(120).optional(),
        professional_id: z.string().uuid().optional(),
        exercises: z.array(newExercise).max(60).default([]),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('create_group_session', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido crear la clase.',
    }, async ({ log }) => {
      const resolved = await resolveExercises(db, input.exercises)
      const batch = crypto.randomUUID()
      const { data: session, error } = await db.rpc('studio_create_group_session', {
        p_group_id: input.group_id,
        p_session_date: input.session_date,
        p_start_time: input.start_time ?? null,
        p_professional_id: input.professional_id ?? null,
        p_name: input.name ?? null,
        p_batch_id: batch,
      })
      if (error) throw studioError(error, 'No se ha podido crear la clase.')
      if (resolved.length > 0) {
        const added = await db.rpc('studio_add_items', {
          p_session_id: session.id,
          p_items: resolved.map((exercise) => exercise.fields),
          p_batch_id: batch,
        })
        if (added.error) throw studioError(added.error, 'La clase se ha creado, pero sus ejercicios no.')
      }
      log.record_id = session.id
      return { created: true, session: { id: session.id, date: session.session_date, version: session.version }, exercises: resolved.length }
    }),
  )

  server.registerTool(
    'set_group_attendance',
    {
      title: 'Pasar lista en una clase',
      description: 'Marca quién vino a una sesión de grupo. Lo marcado aquí manda sobre la agenda y recoloca las series de los ejercicios hechos.',
      inputSchema: z.object({
        session_id: z.string().uuid(),
        attendance: z.array(z.object({
          client_id: z.string().uuid(),
          status: z.enum(['attended', 'absent', 'unmarked']),
        })).min(1).max(100),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('set_group_attendance', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido pasar lista.',
    }, async ({ coachId, log }) => {
      const session = await loadSession(db, coachId, input.session_id)
      for (const entry of input.attendance) {
        const { error } = await db.rpc('studio_set_attendance', {
          p_session_id: session.id, p_client_id: entry.client_id, p_status: entry.status,
        })
        if (error) throw studioError(error, 'No se ha podido pasar lista.')
      }
      log.record_id = session.id
      log.result_count = input.attendance.length
      return { updated: true, marked: input.attendance.length }
    }),
  )

  server.registerTool(
    'create_studio_request',
    {
      title: 'Dejar un encargo en sala',
      description: 'Deja un mensaje y, si hace falta, ejercicios para una sesión de otro profesional o para quien la dé.',
      inputSchema: z.object({
        session_id: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        message: z.string().trim().max(2000).optional(),
        to_user: z.string().uuid().optional().describe('Profesional del equipo. Sin indicar, es para cualquiera.'),
        exercises: z.array(newExercise).max(30).default([]),
        coach_id: optionalCoachId,
      }),
      annotations: writeAnnotations,
    },
    (input: any) => run('create_studio_request', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido dejar el encargo.',
    }, async ({ coachId, log }) => {
      const session = await loadSession(db, coachId, input.session_id)
      const resolved = await resolveExercises(db, input.exercises)
      const { data, error } = await db.rpc('studio_create_request', {
        p_session_id: session.id,
        p_to_user: input.to_user ?? null,
        p_title: input.title,
        p_message: input.message ?? null,
        p_items: resolved.map((exercise) => exercise.fields),
      })
      if (error) throw studioError(error, 'No se ha podido dejar el encargo.')

      log.record_id = data.id
      return { created: true, request: { id: data.id, status: data.status } }
    }),
  )
}
