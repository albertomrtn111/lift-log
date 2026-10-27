import { z } from 'npm:zod@4.3.6'

// Esquemas de salida (outputSchema, MCP 2025-06-18). El SDK valida structuredContent
// contra ellos y convierte una discrepancia en error de la herramienta, así que solo
// fijan las claves de primer nivel y sus tipos. Los objetos anidados admiten campos
// extra (looseObject) para no romper respuestas cuando la base de datos añade columnas.

const record = z.looseObject({})
const records = z.array(record)
const maybe = <T extends z.ZodType>(schema: T) => schema.nullable().optional()
const day = z.string()
const text = maybe(z.string())
const page = { has_more: z.boolean(), next_offset: z.number().int().nullable() }
const range = { from_date: day, to_date: day, end_exclusive: z.string() }

const strengthSet = z.looseObject({ execution_status: z.string(), source: z.string() })
const strengthExercise = z.looseObject({ exercise_id: z.string(), sets: z.array(strengthSet) })
// Resultados agrupados: una entrada por sesión (programa, día y semana) con sus ejercicios.
export const strengthWorkoutSchema = z.looseObject({
  program_id: maybe(z.string()),
  day_id: maybe(z.string()),
  week_index: maybe(z.number()),
  scheduled_date: maybe(day),
  exercises: z.array(strengthExercise),
})
const strengthResults = {
  format: maybe(z.enum(['grouped', 'flat'])),
  workouts: maybe(z.array(strengthWorkoutSchema)),
  results: maybe(records),
  result_count: maybe(z.number().int()),
}

const inboxSection = z.looseObject({ items: records, has_more: z.boolean() })

const createdOrUpdated = { created: maybe(z.boolean()), updated: maybe(z.boolean()) }

export const outputSchemas: Record<string, z.ZodType> = {
  who_am_i: z.looseObject({ trainer_access: records }),
  list_clients: z.looseObject({ coach_id: z.string(), today: day, clients: records, ...page }),
  get_client_overview: z.looseObject({
    client: record.nullable(), today: day, attention_flags: z.array(z.string()), latest_checkin: record.nullable(),
    recent_trend: record, recent_checkins: records, current_goal: record.nullable(),
    cardio_window: records, upcoming_events: records, training_programs: records,
  }),
  get_athlete_goal: z.looseObject({ client_id: z.string(), current_goal: record.nullable() }),
  set_athlete_goal: z.looseObject({ saved: z.boolean(), current_goal: record }),
  list_client_schedule: z.looseObject({
    client_id: z.string(), start_date: day, end_date: day,
    items: z.array(z.looseObject({ kind: z.enum(['cardio', 'event', 'strength']), date: day })),
  }),
  list_exercise_catalog: z.looseObject({ exercises: z.array(z.looseObject({ id: z.string(), name: z.string() })) }),
  create_strength_program: z.looseObject({ created: z.boolean(), program: record, archived_program_ids: z.array(z.string()) }),
  create_coach_task: z.looseObject({ created: z.boolean(), task: record }),

  get_body_history: z.looseObject({ client_id: z.string(), ...range, daily_weights: records, calculated_weekly_averages: records, checkin_measurements: records, note: text }),
  get_checkins: z.looseObject({ client_id: z.string(), checkins: records, ...page }),
  get_recovery_history: z.looseObject({ client_id: z.string(), ...range, daily_progress: records, checkin_recovery: records, note: text }),
  list_client_events: z.looseObject({ client_id: z.string(), ...range, events: records, ...page }),
  get_strength_results: z.looseObject({
    client_id: z.string(), ...range, program_id: z.string().nullable(), ...strengthResults,
    completed_sessions: records, ...page, programs_scanned: records, older_programs_available: z.boolean(),
    source_counts: record, data_quality: record, note: text,
  }),
  get_cardio_results: z.looseObject({ client_id: z.string(), ...range, activities: records, ...page, note: text }),
  // Sin program_id devuelve la lista de bloques; con program_id, el detalle de uno.
  get_program_history: z.looseObject({
    client_id: z.string(), as_of_date: day,
    programs: maybe(records), program: maybe(record), days: maybe(records), sessions: maybe(records),
    program_changes: records, ...strengthResults,
    has_more_results: maybe(z.boolean()), next_result_offset: maybe(z.number().int()),
    older_programs_available: maybe(z.boolean()), next_program_offset: maybe(z.number().int()), note: text,
  }),

  get_current_nutrition: z.looseObject({
    client_id: z.string(), on_date: day, macro_target: maybe(record), active_diet_plan: maybe(record),
    selected_day_type: maybe(z.string()), selected_macro_target: maybe(record), app_active_diet_plan: maybe(record), note: text,
  }),
  get_diet_plan: z.looseObject({ client_id: z.string(), diet_plan: record }),
  get_nutrition_history: z.looseObject({ client_id: z.string(), macro_plans: records, diet_plans: records, ...page }),
  search_foods: z.looseObject({ foods: records }),
  preview_diet_plan: z.looseObject({ client_id: z.string(), preview: z.unknown(), warnings: maybe(z.array(z.unknown())), saved: z.literal(false) }),
  create_macro_plan: z.looseObject({ ...createdOrUpdated, macro_plan: record }),
  update_macro_plan: z.looseObject({ ...createdOrUpdated, macro_plan: record }),
  create_diet_plan: z.looseObject({ ...createdOrUpdated, diet_plan: record, warnings: maybe(z.array(z.unknown())) }),
  update_diet_plan: z.looseObject({ ...createdOrUpdated, diet_plan: record, warnings: maybe(z.array(z.unknown())) }),

  list_coach_tasks: z.looseObject({ coach_id: z.string(), today: day, tasks: records, ...page }),
  update_coach_task: z.looseObject({ updated: z.boolean(), task: record }),
  create_client_event: z.looseObject({ created: z.boolean(), event: record }),
  update_client_event: z.looseObject({ updated: z.boolean(), event: record }),
  get_coach_inbox: z.looseObject({
    coach_id: z.string(), today: day,
    checkins_to_review: inboxSection, unlinked_strava_activities: inboxSection.extend({ since: day }), pending_tasks: inboxSection, note: text,
  }),

  save_review_draft: z.looseObject({ saved: z.boolean(), review: z.looseObject({ id: z.string(), status: z.string() }), note: text }),
  update_strength_program: z.looseObject({
    updated: z.boolean(), program: z.looseObject({ id: z.string(), status: z.string() }),
    archived_program_ids: z.array(z.string()), removed_scheduled_sessions: z.number().int(),
  }),

  update_strength_program_days: z.looseObject({
    updated: z.boolean(), program: z.looseObject({ id: z.string() }), day_count: z.number().int(), exercise_count: z.number().int(),
    removed_day_count: z.number().int(), removed_exercise_count: z.number().int(), removed_scheduled_sessions: z.number().int(),
    catalog_enforced: z.boolean(), note: text,
  }),

  preview_cardio_session: z.looseObject({ saved: z.literal(false), normalized: record }),
  schedule_cardio_session: z.looseObject({ created: z.boolean(), session: record, normalized: record }),
  get_cardio_session: z.looseObject({ session: record, editable_plan: record, legacy_recovery_types_missing: z.boolean(), expected_updated_at: maybe(z.string()), note: text }),
  update_cardio_session: z.looseObject({ updated: z.boolean(), session: record, editable_plan: record, normalized: record.nullable() }),

  // Sin temporada activa, season es null y solo llegan el historial y los eventos.
  get_season_plan: z.looseObject({
    client_id: z.string(), today: day, season: record.nullable(), seasons: records, upcoming_events: records,
    measures: maybe(record), phases: maybe(records), weeks: maybe(records), totals: maybe(record), note: text,
  }),
  // Con dry_run devuelve la vista de la temporada (saved false); al guardar, el resumen.
  create_season_plan: z.looseObject({
    ...createdOrUpdated, saved: maybe(z.boolean()), season: record, weeks: maybe(records), phases: maybe(records),
    totals: maybe(record), warnings: maybe(z.array(z.string())), archived_season_ids: maybe(z.array(z.string())), note: text,
  }),
  update_season_plan: z.looseObject({
    ...createdOrUpdated, saved: maybe(z.boolean()), season: maybe(record), changes: maybe(record), effects: maybe(record),
    archived_season_ids: maybe(z.array(z.string())),
  }),
  update_season_weeks: z.looseObject({
    ...createdOrUpdated, saved: maybe(z.boolean()), season: maybe(record), before: maybe(records), after: maybe(records),
    changed_weeks: maybe(z.array(z.number().int())), note: text,
  }),
}

type ToolServer = { registerTool: (name: string, config: any, handler: any) => unknown }

// Añade a cada herramienta su outputSchema sin repetirlo en cada registro.
export function withOutputSchemas<T extends ToolServer>(server: T): T {
  const register = server.registerTool.bind(server)
  ;(server as any).registerTool = (name: string, config: any, handler: any) =>
    register(name, outputSchemas[name] && !config.outputSchema ? { ...config, outputSchema: outputSchemas[name] } : config, handler)
  return server
}
