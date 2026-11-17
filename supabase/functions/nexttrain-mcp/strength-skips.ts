import { z } from 'npm:zod@4.3.6'
import { programDayDate, programWeekOfDate, programWeekRange } from '../../../src/lib/training/strength-week-skips.js'
import { createToolRunner, type Db, defaultHelpers, idempotentWriteAnnotations, isoDate, type Row, type ToolHelpers } from './shared.ts'

type Server = any

// Días de fuerza que el coach quita solo en una semana del programa (strength_day_week_skips).
// El programa, sus series y las demás semanas no cambian; restaurar borra la fila.
// Mismas reglas que la app del coach (src/app/(coach)/coach/workspace/strength-skip-actions.ts).

/** Filas de días quitados de un cliente. Sin tabla o si falla la lectura: [] (el plan se ve como siempre). */
export async function loadSkippedDays(db: Db, coachId: string, clientId: string, programIds?: string[]): Promise<Row[]> {
  if (programIds && programIds.length === 0) return []
  let query = db
    .from('strength_day_week_skips')
    .select('id, program_id, day_id, week_index, reason, created_at')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
  if (programIds) query = query.in('program_id', programIds)
  const { data, error } = await query
  return error ? [] : data ?? []
}

const optionalCoachId = z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.')

const target = {
  coach_id: optionalCoachId,
  client_id: z.string().uuid(),
  program_id: z.string().uuid().describe('Programa de fuerza (get_program_history o list_client_schedule).'),
  day_id: z.string().uuid().describe('Día del programa (days[].id en get_program_history o day_id en list_client_schedule).'),
  week: z.number().int().min(1).max(52).optional().describe('Semana del programa: la 1 es la semana (lunes a domingo) de su fecha de inicio.'),
  date: isoDate.optional().describe('Cualquier fecha de esa semana, en lugar de week.'),
}
const oneOfWeekOrDate = (input: Row) => (input.week === undefined) !== (input.date === undefined)
const weekOrDateMessage = 'Indica week o date (una de las dos).'

async function loadTarget(db: Db, coachId: string, input: Row) {
  const { data: program, error } = await db
    .from('training_programs')
    .select('id, name, status, weeks, effective_from')
    .eq('id', input.program_id)
    .eq('coach_id', coachId)
    .eq('client_id', input.client_id)
    .maybeSingle()
  if (error) throw new Error('No se ha podido leer el programa.')
  if (!program) throw new Error('No se ha encontrado ese programa de fuerza en este cliente.')

  const weeks = Number(program.weeks) || 4
  const week = input.week ?? programWeekOfDate(program.effective_from, input.date)
  if (!week || week > weeks) throw new Error(`Esa semana no está en el programa: va de la semana 1 a la ${weeks}.`)

  const { data: trainingDay, error: dayError } = await db
    .from('training_days')
    .select('id, name, default_weekday')
    .eq('id', input.day_id)
    .eq('program_id', program.id)
    .maybeSingle()
  if (dayError) throw new Error('No se ha podido leer el día del programa.')
  if (!trainingDay) throw new Error('Ese día no pertenece a este programa.')

  const range = programWeekRange(program.effective_from, week)
  return {
    program,
    trainingDay,
    week,
    summary: {
      program: { id: program.id, name: program.name },
      day: { id: trainingDay.id, name: trainingDay.name },
      week,
      planned_date: programDayDate(program.effective_from, week, trainingDay.default_weekday),
      week_start: range.start,
      week_end: range.end,
    },
  }
}

/** ¿El atleta ya entrenó ese día esa semana (sesión completada o series confirmadas)? */
async function trainedThatWeek(db: Db, coachId: string, clientId: string, programId: string, dayId: string, week: number, range: { week_start: string; week_end: string }) {
  const [{ data: sessions }, { data: exercises }] = await Promise.all([
    db.from('scheduled_strength_sessions').select('id')
      .eq('coach_id', coachId).eq('client_id', clientId).eq('program_id', programId).eq('day_id', dayId)
      .eq('is_completed', true).gte('scheduled_date', range.week_start).lte('scheduled_date', range.week_end).limit(1),
    db.from('training_exercises').select('id').eq('program_id', programId).eq('day_id', dayId),
  ])
  if ((sessions ?? []).length > 0) return true
  const ids = (exercises ?? []).map((exercise: Row) => exercise.id)
  if (ids.length === 0) return false
  const { data: sets } = await db.from('training_exercise_sets').select('id')
    .in('exercise_id', ids).eq('week_index', week).eq('completed', true).limit(1)
  return (sets ?? []).length > 0
}

export function registerStrengthSkipTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool('skip_strength_day_week', {
    title: 'Quitar un día de fuerza en una semana',
    description: 'Quita un día del programa de fuerza solo en una semana: el atleta no lo ve esa semana (Fuerza, Plan ni avisos), en el cuadrante sale como quitado por el coach y no cuenta como sesión fallada ni en la adherencia. Las demás semanas y el programa no cambian. Indica la semana del programa (week) o cualquier fecha de esa semana (date). No se puede quitar un día que el atleta ya entrenó esa semana. Se deshace con restore_strength_day_week.',
    inputSchema: z.strictObject({
      ...target,
      reason: z.string().trim().max(300).optional().describe('Motivo interno para el coach (no se enseña al atleta).'),
    }).refine(oneOfWeekOrDate, weekOrDateMessage),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('skip_strength_day_week', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido quitar el día.' },
    async ({ coachId, log }) => {
      const { program, trainingDay, week, summary } = await loadTarget(db, coachId, input)
      log.record_id = program.id
      if (await trainedThatWeek(db, coachId, input.client_id, program.id, trainingDay.id, week, summary)) {
        throw new Error(`El atleta ya ha registrado «${trainingDay.name}» en la semana ${week}. No se puede quitar.`)
      }
      const { data, error } = await db
        .from('strength_day_week_skips')
        .insert({
          coach_id: coachId, client_id: input.client_id, program_id: program.id, day_id: trainingDay.id,
          week_index: week, reason: input.reason || null,
        })
        .select('id, created_at')
        .single()
      if (error && error.code !== '23505') throw new Error('No se ha podido quitar el día. No se guardó ningún cambio.')
      return {
        skipped: true,
        already_skipped: Boolean(error),
        ...summary,
        skip_id: data?.id ?? null,
        note: 'El atleta deja de verlo esa semana. Para deshacerlo, usa restore_strength_day_week con los mismos datos.',
      }
    }))

  server.registerTool('restore_strength_day_week', {
    title: 'Restaurar un día de fuerza quitado',
    description: 'Deshace skip_strength_day_week: el día vuelve a aparecer en esa semana tal como estaba. Indica la semana del programa (week) o cualquier fecha de esa semana (date).',
    inputSchema: z.strictObject(target).refine(oneOfWeekOrDate, weekOrDateMessage),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => run('restore_strength_day_week', { coachId: input.coach_id, clientId: input.client_id, fallbackError: 'No se ha podido restaurar el día.' },
    async ({ coachId, log }) => {
      const { program, trainingDay, week, summary } = await loadTarget(db, coachId, input)
      log.record_id = program.id
      const { data, error } = await db
        .from('strength_day_week_skips')
        .delete()
        .eq('coach_id', coachId)
        .eq('client_id', input.client_id)
        .eq('program_id', program.id)
        .eq('day_id', trainingDay.id)
        .eq('week_index', week)
        .select('id')
      if (error) throw new Error('No se ha podido restaurar el día. No se guardó ningún cambio.')
      return { restored: true, was_skipped: (data ?? []).length > 0, ...summary }
    }))
}
