import { z } from 'npm:zod@4.3.6'

type Server = any

// Los argumentos de un prompt MCP siempre son texto.
const clientArg = z.string().trim().min(1).max(160).describe('Nombre o ID del cliente.')

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

const findClient = (client: string) =>
  `Cliente: «${client}». Si no es un UUID, búscalo con list_clients (search) y, si hay varios resultados, pregúntame cuál es antes de seguir.`

// Guías de trabajo: indican al modelo qué herramientas usar y en qué orden. No modifican datos por sí mismas.
export const promptTexts = {
  weeklyReview: (client: string, checkinId?: string) => [
    `Prepara la revisión semanal de un cliente de NexTrain. ${findClient(client)}`,
    '',
    'Pasos:',
    `1. get_checkins${checkinId ? ` con checkin_id=${checkinId}` : ' (el más reciente)'}: respuestas del formulario y estado de la revisión.`,
    '2. get_client_overview: tendencias, alertas, objetivo actual y próximos eventos.',
    '3. get_body_history y get_recovery_history para el periodo del check-in.',
    '4. get_strength_results y get_cardio_results del mismo periodo; list_client_schedule para ver lo programado y lo completado.',
    '5. get_current_nutrition si el check-in menciona dieta, hambre o peso.',
    '',
    'Después redacta:',
    '- Un resumen interno para mí: adherencia, evolución, alertas y qué cambiarías.',
    '- Un mensaje para el cliente en segunda persona, cercano y concreto, con 2-4 ajustes accionables.',
    '',
    'Separa los datos medidos de tus interpretaciones y no inventes valores que no estén en las herramientas.',
    'Cuando te confirme el texto, guárdalo con save_review_draft (queda en borrador; aprobar y enviar al cliente lo hago yo desde la app). No guardes cambios sin mi confirmación.',
  ].join('\n'),

  nextBlock: (client: string, weeks?: string) => [
    `Prepara el siguiente bloque de fuerza de un cliente de NexTrain. ${findClient(client)}`,
    '',
    'Pasos:',
    '1. get_program_history: bloques anteriores y progreso del actual; con program_id del bloque actual, sus ejercicios y resultados.',
    '2. get_strength_results del bloque actual (formato agrupado) para ver cargas, repeticiones y RIR por ejercicio.',
    '3. get_athlete_goal y list_client_events: objetivo, plazo y competiciones próximas.',
    '4. get_checkins recientes: molestias, energía y adherencia.',
    '',
    `Propón un bloque${weeks ? ` de ${weeks} semanas` : ''} con días, ejercicios, series, repeticiones, RIR y descansos, justificando la progresión con los datos reales.`,
    'Usa solo ejercicios de la biblioteca: búscalos con list_exercise_catalog y envía su nombre exacto o catalog_exercise_id.',
    'Espera mi confirmación. Después créalo con create_strength_program en borrador (status draft) y no lo actives sin que te lo pida; para activarlo o archivar el actual usa update_strength_program. Si solo hay que ajustar el bloque actual, usa update_strength_program_days conservando los id.',
  ].join('\n'),

  dailyInbox: () => [
    'Repasa mi bandeja de NexTrain de hoy.',
    '',
    '1. get_coach_inbox: check-ins por revisar, actividades de Strava sin enlazar y tareas pendientes.',
    '2. Ordena por prioridad: check-ins más antiguos o con alertas (molestias, energía baja, adherencia baja), tareas vencidas y actividades sin enlazar.',
    '3. Para cada elemento importante indica el siguiente paso y la herramienta que usarías (por ejemplo get_checkins o update_coach_task).',
    '',
    'No completes tareas ni cambies datos sin mi confirmación.',
  ].join('\n'),
}

export function registerPrompts(server: Server) {
  server.registerPrompt('revision_semanal', {
    title: 'Revisión semanal de un cliente',
    description: 'Reúne check-in, evolución, entrenamiento y nutrición de un cliente y redacta el resumen interno y el mensaje para el cliente.',
    argsSchema: z.object({
      cliente: clientArg,
      checkin_id: z.string().trim().uuid().optional().describe('Check-in concreto; por defecto, el más reciente.'),
    }),
  }, ({ cliente, checkin_id }: { cliente: string; checkin_id?: string }) => ({
    description: `Revisión semanal de ${cliente}`,
    ...userMessage(promptTexts.weeklyReview(cliente, checkin_id)),
  }))

  server.registerPrompt('preparar_bloque_siguiente', {
    title: 'Preparar el siguiente bloque de fuerza',
    description: 'Analiza el bloque actual, los resultados y el objetivo del cliente y propone el siguiente programa de fuerza en borrador.',
    argsSchema: z.object({
      cliente: clientArg,
      semanas: z.string().trim().regex(/^\d{1,2}$/, 'Número de semanas').optional().describe('Duración deseada en semanas.'),
    }),
  }, ({ cliente, semanas }: { cliente: string; semanas?: string }) => ({
    description: `Siguiente bloque de fuerza de ${cliente}`,
    ...userMessage(promptTexts.nextBlock(cliente, semanas)),
  }))

  server.registerPrompt('bandeja_del_dia', {
    title: 'Bandeja del día',
    description: 'Repasa lo pendiente de todos los clientes y lo ordena por prioridad.',
  }, () => ({
    description: 'Bandeja del día',
    ...userMessage(promptTexts.dailyInbox()),
  }))
}
