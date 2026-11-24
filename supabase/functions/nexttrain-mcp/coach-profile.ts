import { z } from 'npm:zod@4.3.6'
import { createToolRunner, type Db, defaultHelpers, readOnlyAnnotations, type Row, type ToolHelpers } from './shared.ts'

type Server = any

// Perfil del coach del espacio (coach_ai_profiles): cómo trabaja, sus reglas y su tono.
// Es lo mismo que NextIA usa dentro de la app. El prompt de sistema generado no se devuelve.

const COACH_PROFILE_COLUMNS = [
  'profile_status', 'approved_at', 'updated_at',
  'specialty', 'client_types', 'athlete_level',
  'training_philosophy', 'training_priorities', 'progression_style', 'training_avoid', 'exercise_preferences',
  'nutrition_approach', 'macro_or_options', 'nutrition_adjustment_priority', 'nutrition_no_progress_action', 'nutrition_rules',
  'checkin_priorities', 'adjustment_signals', 'metrics_vs_feelings', 'review_structure_preference', 'alert_types',
  'communication_tone', 'response_style', 'free_notes', 'final_description',
  'generated_profile_summary', 'generated_methodology', 'generated_communication_style', 'generated_master_rules', 'generated_profile_json',
].join(', ')

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Row).length === 0
  return false
}

/** Objeto sin los campos vacíos: el asistente solo ve lo que el coach ha contestado. */
function compact(entries: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => !isEmpty(value)))
}

export function buildCoachProfile(row: Row | null) {
  if (!row) return null
  const generated = (row.generated_profile_json ?? {}) as Row
  const pick = (column: string, key: string) => (isEmpty(row[column]) ? generated[key] : row[column]) ?? null
  return {
    status: row.profile_status ?? null,
    approved_at: row.approved_at ?? null,
    updated_at: row.updated_at ?? null,
    // Lo que la IA de NexTrain ha redactado a partir de las respuestas y el coach ha aprobado.
    summary: pick('generated_profile_summary', 'professional_summary'),
    methodology: pick('generated_methodology', 'methodology'),
    master_rules: pick('generated_master_rules', 'master_rules'),
    communication_style: pick('generated_communication_style', 'communication_style'),
    // Respuestas originales del coach, agrupadas como en el cuestionario.
    answers: {
      profile: compact({ specialty: row.specialty, client_types: row.client_types, athlete_level: row.athlete_level }),
      training: compact({
        philosophy: row.training_philosophy, priorities: row.training_priorities, progression_style: row.progression_style,
        avoid: row.training_avoid, exercise_preferences: row.exercise_preferences,
      }),
      nutrition: compact({
        approach: row.nutrition_approach, macros_or_options: row.macro_or_options, adjustment_priority: row.nutrition_adjustment_priority,
        no_progress_action: row.nutrition_no_progress_action, rules: row.nutrition_rules,
      }),
      reviews: compact({
        checkin_priorities: row.checkin_priorities, adjustment_signals: row.adjustment_signals, metrics_vs_feelings: row.metrics_vs_feelings,
        review_structure: row.review_structure_preference, alert_types: row.alert_types,
      }),
      communication: compact({ tone: row.communication_tone, response_style: row.response_style }),
      notes: compact({ free_notes: row.free_notes, final_description: row.final_description }),
    },
  }
}

export function registerCoachProfileTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'get_coach_profile',
    {
      title: 'Ver cómo trabaja el entrenador',
      description: 'Perfil del entrenador del espacio: metodología, reglas maestras, prioridades de entrenamiento y nutrición, qué mira en un check-in, cuándo ajusta y su tono al hablar con los atletas. Consúltalo antes de planificar, revisar un check-in o redactar un mensaje, y respétalo.',
      inputSchema: z.object({
        coach_id: z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.'),
      }),
      annotations: readOnlyAnnotations,
    },
    ({ coach_id }: Row) => run('get_coach_profile', {
      coachId: coach_id,
      fallbackError: 'No se ha podido cargar el perfil del entrenador.',
    }, async ({ coachId }) => {
      const { data, error } = await db.from('coach_ai_profiles').select(COACH_PROFILE_COLUMNS).eq('coach_id', coachId).maybeSingle()
      if (error) throw new Error('No se ha podido cargar el perfil del entrenador.')
      const profile = buildCoachProfile(data ?? null)
      return {
        coach_id: coachId,
        profile,
        note: profile
          ? (profile.status === 'approved' ? null : 'El perfil aún no está aprobado por el entrenador; úsalo con cautela.')
          : 'El entrenador no ha rellenado su «Perfil IA del coach» en la app. Pregúntale cómo prefiere trabajar.',
      }
    }),
  )
}
