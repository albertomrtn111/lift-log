import { z } from 'npm:zod@4.3.6'
import { createToolRunner, type Db, defaultHelpers, idempotentWriteAnnotations, isoDate, type Row, type ToolHelpers } from './shared.ts'

type Server = any

const optionalCoachId = z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.')
const reviewText = z.string().max(10000).nullable().optional()

// Mismos grupos que create_strength_program. Si la biblioteca de ejercicios está instalada, manda el grupo del catálogo.
const muscleGroup = z.enum(['hombro', 'pecho', 'espalda', 'abdomen', 'cuádriceps', 'femorales', 'gemelos', 'tríceps', 'bíceps', 'glúteo', 'aductores', 'otros'])

// Omitir un campo de un ejercicio existente lo conserva; null lo vacía.
const programExercise = z.strictObject({
  id: z.string().uuid().optional().describe('ID del ejercicio existente (get_program_history). Sin id se crea uno nuevo.'),
  catalog_exercise_id: z.string().uuid().optional().describe('ID de la biblioteca de ejercicios, si está disponible.'),
  name: z.string().trim().min(1).max(160).optional().describe('Obligatorio en ejercicios nuevos. En uno existente, cambiarlo lo sustituye por otro ejercicio.'),
  sets: z.number().int().min(1).max(20).nullable().optional(),
  reps: z.string().trim().max(80).nullable().optional(),
  rir: z.number().min(0).max(10).nullable().optional(),
  rest_seconds: z.number().int().min(0).max(1800).nullable().optional(),
  notes: z.string().trim().max(800).nullable().optional(),
  muscle_group: muscleGroup.nullable().optional(),
}).refine((exercise) => exercise.id || exercise.name, 'Un ejercicio nuevo necesita name.')

const programDay = z.strictObject({
  id: z.string().uuid().optional().describe('ID del día existente. Sin id se crea uno nuevo.'),
  name: z.string().trim().min(1).max(120),
  weekday: z.number().int().min(1).max(7).describe('1=lunes, 7=domingo'),
  exercises: z.array(programExercise).min(1).max(30),
})

// P0001 y 42501 son los mensajes propios de las funciones SQL; el resto se oculta.
function rpcError(error: any, fallback: string) {
  return new Error(error && ['P0001', '42501'].includes(error.code) ? error.message : fallback)
}

export function registerCoachWriteTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool('save_review_draft', {
    title: 'Guardar borrador de revisión',
    description: 'Guarda el resumen interno y el mensaje para el cliente de la revisión de un check-in, siempre en borrador. No aprueba la revisión ni envía nada al cliente: eso se hace desde la app. Lee antes get_checkins y envía en expected_summary y expected_message_to_client los valores actuales de review (null si no hay revisión).',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      checkin_id: z.string().uuid(),
      summary: reviewText.describe('Resumen interno para el entrenador. Omitir lo conserva; null lo vacía.'),
      message_to_client: reviewText.describe('Borrador del mensaje para el cliente. Omitir lo conserva; null lo vacía.'),
      expected_summary: z.string().nullable().describe('review.summary tal como lo devolvió get_checkins.'),
      expected_message_to_client: z.string().nullable().describe('review.message_to_client tal como lo devolvió get_checkins.'),
    }).refine((input) => input.summary !== undefined || input.message_to_client !== undefined, 'Indica summary o message_to_client.'),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('save_review_draft', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido guardar el borrador.' },
    async ({ coachId, log }) => {
      const payload: Row = { expected_summary: input.expected_summary, expected_message_to_client: input.expected_message_to_client }
      if (input.summary !== undefined) payload.summary = input.summary
      if (input.message_to_client !== undefined) payload.message_to_client = input.message_to_client
      const { data, error } = await db.rpc('save_nexttrain_review_draft', {
        p_coach_id: coachId, p_client_id: input.client_id, p_checkin_id: input.checkin_id, p_payload: payload,
      })
      if (error || !data?.id) throw rpcError(error, 'No se ha podido guardar el borrador de la revisión. No se guardó ningún cambio.')
      log.record_id = data.id
      return { saved: true, review: data, note: 'Borrador guardado. Aprobar y enviar al cliente se hace desde la app.' }
    }))

  server.registerTool('update_strength_program', {
    title: 'Editar o archivar programa de fuerza',
    description: 'Cambia nombre, duración, fecha de inicio o estado (draft, active, archived) de un programa de fuerza. Activar archiva el programa activo anterior y, si no se indica fecha, empieza hoy, como en la app. Cambiar fecha o semanas borra las sesiones programadas no completadas de ese programa (la plantilla las sustituye). Lee antes get_program_history y envía expected_updated_at. No edita días ni ejercicios.',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      program_id: z.string().uuid(),
      expected_updated_at: z.string().datetime({ offset: true }).describe('updated_at del programa leído con get_program_history.'),
      name: z.string().trim().min(1).max(160).optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
      weeks: z.number().int().min(1).max(52).optional(),
      effective_from: isoDate.optional(),
    }).refine((input) => ['name', 'status', 'weeks', 'effective_from'].some((key) => (input as Row)[key] !== undefined), 'No hay cambios que guardar.'),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_strength_program', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido editar el programa.' },
    async ({ coachId, today, log }) => {
      log.record_id = input.program_id
      const payload: Row = { expected_updated_at: input.expected_updated_at, today }
      for (const key of ['name', 'status', 'weeks', 'effective_from']) if (input[key] !== undefined) payload[key] = input[key]
      const { data, error } = await db.rpc('update_nexttrain_strength_program', {
        p_coach_id: coachId, p_client_id: input.client_id, p_program_id: input.program_id, p_payload: payload,
      })
      if (error || !data?.id) throw rpcError(error, 'No se ha podido editar el programa. No se guardó ningún cambio.')
      const { archived_program_ids, removed_scheduled_sessions, ...program } = data
      return {
        updated: true,
        program: {
          id: program.id, client_id: program.client_id, name: program.name, status: program.status, weeks: program.weeks,
          effective_from: program.effective_from, effective_to: program.effective_to, updated_at: program.updated_at,
        },
        archived_program_ids: archived_program_ids ?? [],
        removed_scheduled_sessions: removed_scheduled_sessions ?? 0,
      }
    }))

  server.registerTool('update_strength_program_days', {
    title: 'Editar días y ejercicios de un programa',
    description: 'Reemplaza los días y ejercicios de un programa de fuerza en una sola transacción. Lee antes get_program_history con program_id y envía expected_updated_at y la estructura completa: los días y ejercicios con id se actualizan y conservan sus resultados; sin id se crean; los que no se envían se eliminan. No se puede quitar un ejercicio con resultados del atleta ni un día con sesiones completadas o resultados. Cambiar el día de la semana borra las sesiones programadas no completadas de ese día. Si la biblioteca de ejercicios está instalada, los ejercicios nuevos o cambiados deben estar en ella (list_exercise_catalog).',
    inputSchema: z.strictObject({
      coach_id: optionalCoachId,
      client_id: z.string().uuid(),
      program_id: z.string().uuid(),
      expected_updated_at: z.string().datetime({ offset: true }).describe('updated_at del programa leído con get_program_history.'),
      days: z.array(programDay).min(1).max(7),
    }),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('update_strength_program_days', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido editar el programa.' },
    async ({ coachId, log }) => {
      log.record_id = input.program_id
      const { data, error } = await db.rpc('update_nexttrain_strength_program_days', {
        p_coach_id: coachId, p_client_id: input.client_id, p_program_id: input.program_id,
        p_payload: { expected_updated_at: input.expected_updated_at, days: input.days },
      })
      if (error || !data?.id) throw rpcError(error, 'No se han podido editar los días del programa. No se guardó ningún cambio.')
      return {
        updated: true,
        program: { id: data.id, client_id: data.client_id, name: data.name, status: data.status, updated_at: data.updated_at },
        day_count: data.day_count, exercise_count: data.exercise_count,
        removed_day_count: data.removed_day_count ?? 0, removed_exercise_count: data.removed_exercise_count ?? 0,
        removed_scheduled_sessions: data.removed_scheduled_sessions ?? 0,
        catalog_enforced: data.catalog_enforced === true,
        note: 'Usa get_program_history con program_id para ver la estructura guardada.',
      }
    }))
}
