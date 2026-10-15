import { z } from 'npm:zod@4.3.6'
import { cardioPlanInputFromSession, mergeCardioPlanEdit, normalizeCardioPlan } from './cardio-plan.js'
import { cardioActivityType } from '../../../src/lib/cardio/structure.js'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Fecha inválida; usa YYYY-MM-DD')
const scope = { client_id: z.string().uuid(), coach_id: z.string().uuid().optional() }
const mode = z.enum(['quick', 'structured']).describe('Elegir explícitamente: quick guarda solo texto; structured guarda bloques ejecutables.')
const block = z.strictObject({
  id: z.string().trim().min(1).max(160).optional(), label: z.string().trim().max(160).optional(),
  type: z.enum(['warmup', 'continuous', 'intervals', 'cooldown', 'station']),
  description: z.string().trim().min(1).max(800), notes: z.string().trim().max(800).optional(),
  distance_m: z.number().positive().max(300000).optional().describe('Distancia total del bloque sin repeticiones, en metros.'),
  duration_min: z.number().positive().max(1440).optional(),
  repetitions: z.number().int().min(1).max(100).optional(),
  distance_per_rep_m: z.number().positive().max(100000).optional().describe('Distancia de CADA repetición en metros.'),
  duration_per_rep_seconds: z.number().positive().max(86400).optional(),
  recovery_seconds: z.number().min(0).max(3600).optional().describe('Segundos por recuperación, nunca el total acumulado.'),
  recovery_distance_m: z.number().min(0).max(100000).optional().describe('Metros por recuperación activa. Se incluyen en la distancia total.'),
  recovery_type: z.enum(['active', 'passive']).optional().describe('passive: parado, suma tiempo y cero metros. active: desplazamiento; requiere distancia o ritmo para calcular sus metros.'),
  recovery_after_last_rep: z.boolean().optional().describe('Por defecto false: N repeticiones tienen N−1 recuperaciones. true añade la pausa tras la última.'),
  recovery_target_pace: z.string().trim().max(80).optional(),
  target_pace: z.string().trim().max(80).optional(), target_hr: z.string().trim().max(80).optional(), target_rpe: z.string().trim().max(40).optional(),
})
const plan = {
  planning_mode: mode,
  description: z.string().trim().max(6000).optional(),
  activity_type: z.string().trim().min(1).max(80).optional(), training_type: z.string().trim().max(120).optional(),
  target_distance_km: z.number().positive().max(300).optional(),
  target_distance_m: z.number().positive().max(300000).optional().describe('Alternativa en metros al objetivo en km, útil en natación. No enviar ambos.'),
  target_duration_min: z.number().positive().max(1440).optional(), target_pace: z.string().trim().max(80).optional(),
  coach_notes: z.string().trim().max(3000).optional(), blocks: z.array(block).max(30).optional(),
}
const fields = 'id, client_id, coach_id, scheduled_date, name, activity_type, training_type, description, target_distance_km, target_duration_min, target_pace, structure, planned_structure, coach_notes, notes, is_completed, actual_distance_km, actual_duration_min, created_at, updated_at'
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

function activityFor(normalized: any, requested?: string) {
  return cardioActivityType(normalized.structure.trainingType, requested)
}

function normalizedResult(value: any) {
  return { planning_mode: value.planning_mode, distance_validation: value.distance_validation,
    duration_validation: value.duration_validation, totals: value.totals,
    target_distance_km: value.target_distance_km, target_duration_min: value.target_duration_min,
    structure: value.structure, planned_structure: value.planned_structure }
}

export function registerCardioTools(server: any, db: any, helpers: any) {
  const { resolveCoach, requireClient, jsonResult, toolError, audit, annotations } = helpers
  async function scoped(tool: string, input: any, action: (coach: string) => Promise<unknown>) {
    try {
      const { coachId } = await resolveCoach(db, input.coach_id)
      await requireClient(db, coachId, input.client_id)
      const result = await action(coachId)
      audit(tool, { coach_id: coachId, client_id: input.client_id, record_id: input.session_id ?? null, status: 'ok' })
      return jsonResult(result)
    } catch (error) {
      audit(tool, { client_id: input.client_id, status: 'error' })
      return toolError(error instanceof Error ? error.message : 'No se ha podido gestionar la sesión de cardio.')
    }
  }
  async function read(coachId: string, input: any) {
    const { data, error } = await db.from('cardio_sessions').select(fields)
      .eq('coach_id', coachId).eq('client_id', input.client_id).eq('id', input.session_id).maybeSingle()
    if (error || !data) throw new Error('Sesión de cardio no encontrada en este cliente y espacio.')
    return data
  }

  server.registerTool('preview_cardio_session', {
    title: 'Comprobar sesión de cardio sin guardar',
    description: 'Elige quick o structured. Calcula trabajo, recuperaciones, calentamiento y vuelta a la calma con el motor de la app. Distingue totales completos, estimados y parciales. No modifica el calendario.',
    inputSchema: z.strictObject({ ...scope, ...plan }), annotations,
  }, (input: any) => scoped('preview_cardio_session', input, async () => ({ saved: false, normalized: normalizedResult(normalizeCardioPlan(input)) })))

  server.registerTool('schedule_cardio_session', {
    title: 'Programar sesión de cardio',
    description: 'Añade cardio por petición explícita. planning_mode es obligatorio: quick para texto y objetivos; structured para bloques ejecutables. La distancia incluye recuperaciones activas; los descansos parados solo suman tiempo. Usa preview_cardio_session para comprobar antes.',
    inputSchema: z.strictObject({ ...scope, ...plan, name: z.string().trim().min(1).max(160), scheduled_date: date }), annotations: write,
  }, (input: any) => scoped('schedule_cardio_session', input, async coachId => {
    const normalized = normalizeCardioPlan(input)
    const { data, error } = await db.from('cardio_sessions').insert({
      coach_id: coachId, client_id: input.client_id, name: input.name,
      scheduled_date: input.scheduled_date, date: input.scheduled_date,
      activity_type: activityFor(normalized, input.activity_type), training_type: normalized.structure.trainingType,
      description: normalized.description, structure: normalized.structure, planned_structure: normalized.planned_structure,
      target_distance_km: normalized.target_distance_km, target_duration_min: normalized.target_duration_min, target_pace: normalized.target_pace,
      coach_notes: input.coach_notes ?? null, notes: input.coach_notes ?? null, is_completed: false,
    }).select(fields).single()
    if (error || !data) throw new Error('No se ha podido guardar la sesión de cardio.')
    return { created: true, session: data, normalized: normalizedResult(normalized) }
  }))

  server.registerTool('get_cardio_session', {
    title: 'Leer cardio para editar',
    description: 'Lee una sesión del cliente, su configuración rápida/estructurada, bloques editables y updated_at. Úsala antes de update_cardio_session. Las series usan metros por repetición y segundos por pausa.',
    inputSchema: z.strictObject({ ...scope, session_id: z.string().uuid() }), annotations,
  }, (input: any) => scoped('get_cardio_session', input, async coachId => {
    const session = await read(coachId, input)
    const editable = cardioPlanInputFromSession(session)
    const missingRecoveryType = editable.blocks?.some((block: any) => block.recovery_seconds > 0 && !block.recovery_type) ?? false
    return { session, editable_plan: editable, legacy_recovery_types_missing: missingRecoveryType,
      expected_updated_at: session.updated_at, note: 'La edición de planificación no modifica resultados reales, finalización ni datos de Strava.' }
  }))

  server.registerTool('update_cardio_session', {
    title: 'Editar sesión de cardio',
    description: 'Edita una sesión existente, sin duplicarla. Lee antes get_cardio_session y envía expected_updated_at. Omitir planning_mode mantiene el modo; cambiarlo permite pasar a quick o structured. blocks reemplaza todos los bloques. Los totales se recalculan al cambiar bloques; los resultados reales nunca se modifican.',
    inputSchema: z.strictObject({ ...scope, ...plan, planning_mode: mode.optional(),
      session_id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }).nullable(),
      name: z.string().trim().min(1).max(160).optional(), scheduled_date: date.optional(),
    }), annotations: { ...write, idempotentHint: true },
  }, (input: any) => scoped('update_cardio_session', input, async coachId => {
    const current = await read(coachId, input)
    if (current.updated_at !== input.expected_updated_at && Date.parse(current.updated_at) !== Date.parse(input.expected_updated_at)) throw new Error('La sesión cambió; vuelve a leer get_cardio_session.')
    const payload: any = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) payload.name = input.name
    if (input.scheduled_date !== undefined) { payload.scheduled_date = input.scheduled_date; payload.date = input.scheduled_date }
    const planChanged = Object.keys(plan).filter(key => key !== 'coach_notes').some(key => input[key] !== undefined)
    let normalized: any = null
    if (planChanged) {
      normalized = mergeCardioPlanEdit(current, input)
      Object.assign(payload, { description: normalized.description, structure: normalized.structure, planned_structure: normalized.planned_structure,
        target_distance_km: normalized.target_distance_km, target_duration_min: normalized.target_duration_min, target_pace: normalized.target_pace,
        activity_type: activityFor(normalized, input.activity_type ?? current.activity_type), training_type: normalized.structure.trainingType })
    }
    if (input.coach_notes !== undefined) {
      payload.coach_notes = input.coach_notes; payload.notes = input.coach_notes
      const structure = payload.structure ?? current.structure
      const planned = payload.planned_structure !== undefined ? payload.planned_structure : current.planned_structure
      if (structure && !Array.isArray(structure)) payload.structure = { ...structure, notes: input.coach_notes }
      if (planned && !Array.isArray(planned)) payload.planned_structure = { ...planned, notes: input.coach_notes }
    }
    let query = db.from('cardio_sessions').update(payload).eq('coach_id', coachId).eq('client_id', input.client_id).eq('id', input.session_id)
    query = input.expected_updated_at === null ? query.is('updated_at', null) : query.eq('updated_at', input.expected_updated_at)
    const { data, error } = await query.select(fields).maybeSingle()
    if (error || !data) throw new Error('No se ha podido editar la sesión o cambió durante el guardado. Vuelve a leer get_cardio_session.')
    return { updated: true, session: data, editable_plan: cardioPlanInputFromSession(data), normalized: normalized ? normalizedResult(normalized) : null }
  }))
}
