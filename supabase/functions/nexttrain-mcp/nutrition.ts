import { z } from 'npm:zod@4.3.6'
import { buildLegacyDiet, describeMeals, historyEntry, legacyMeals, macroPayload, normalizeMacroPlan, prepareDiet } from './nutrition-model.js'
import {
  addDays,
  allRows as allRowsBase,
  createToolRunner,
  defaultHelpers,
  idempotentWriteAnnotations,
  isoDate as date,
  readOnlyAnnotations as annotations,
  type Row,
  rows as rowsBase,
  type ToolHelpers,
  writeAnnotations as write,
} from './shared.ts'

const FOOD_FIELDS = 'id, name, brand, kcal, protein_g, carbs_g, fat_g, serving_size_g, unit_weight_g, unit_label, food_group, is_generic'
const PLAN_FIELDS = 'id, name, type, status, effective_from, effective_to, notes, created_at, updated_at, meals'
const MACRO_FIELDS = 'id, name, kcal, protein_g, carbs_g, fat_g, steps, cardio_target, day_type_config, effective_from, effective_to, notes, archived_at, change_note, created_at'
const HISTORY_FIELDS = 'kind, id, name, status, effective_from, effective_to, days, archived_at, change_note, notes, kcal, protein_g, carbs_g, fat_g, steps, day_type_config, meals_count, start_weight_kg, end_weight_kg, created_at'
const scope = {
  client_id: z.string().uuid(), coach_id: z.string().uuid().optional(),
}
const target = z.strictObject({
  kcal: z.number().min(0).max(20000).optional(),
  protein_g: z.number().min(0).max(1000), carbs_g: z.number().min(0).max(3000), fat_g: z.number().min(0).max(1000),
})
const config = z.strictObject({
  training: target.describe('Objetivo de los días de entreno.'), rest: target.describe('Objetivo de los días de descanso.'),
})
const item = z.strictObject({
  id: z.string().uuid().optional(),
  food_id: z.string().uuid().nullable().optional().describe('ID del catálogo obtenido con search_foods. Necesario para calcular macros; los textos libres quedan sin contabilizar.'),
  name: z.string().trim().min(1).max(250).optional(),
  item_type: z.enum(['food', 'supplement', 'note']).default('food'),
  quantity_g: z.number().positive().max(10000).optional(),
  quantity_value: z.number().positive().max(10000).optional(), quantity_unit: z.string().trim().max(60).optional(),
  unit_based: z.boolean().optional(), locked: z.boolean().optional().describe('No ajustar esta cantidad.'),
  notes: z.string().trim().max(1000).optional(),
  alternative_group: z.number().int().positive().max(100).nullable().optional(),
  is_alternative: z.boolean().default(false), equivalence_basis: z.enum(['kcal', 'protein', 'carbs', 'fat']).optional(),
}).refine(value => value.food_id || value.name, 'Indica food_id o un nombre para el texto libre.')
const meals = z.array(z.strictObject({
  id: z.string().uuid().optional(), day_type: z.enum(['default', 'training', 'rest', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']).default('default'),
  name: z.string().trim().min(1).max(120), target: target.optional(),
  options: z.array(z.strictObject({
    id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), notes: z.string().trim().max(1000).optional(),
    items: z.array(item).min(1).max(20),
  })).min(1).max(10),
})).min(1).max(28)
const dietSettings = {
  daily_targets: z.strictObject({ default: target.optional(), training: target.optional(), rest: target.optional(),
    mon: target.optional(), tue: target.optional(), wed: target.optional(), thu: target.optional(), fri: target.optional(), sat: target.optional(), sun: target.optional(),
  }).optional().describe('Objetivo diario: se reparte entre comidas. No modifica automáticamente el plan de macros independiente.'),
  adjust_to_targets: z.boolean().default(true).describe('Ajusta gramos con el mismo motor que la app. Revisa desviaciones en la respuesta.'),
  strict_targets: z.boolean().default(false).describe('Si true, rechaza opciones fuera de tolerancia o con alimentos sin macros.'),
}

// Nutrición conserva sus mensajes y pagina de 500 en 500 (máximo 10 500 filas).
function rows(result: any, label: string): Row[] {
  return rowsBase(result, label, `No se ha podido cargar ${label}.`)
}

function allRows(query: () => any, label: string) {
  return allRowsBase(query, label, {
    pageSize: 500,
    maxRows: 10_500,
    loadError: `No se ha podido cargar ${label}.`,
    tooManyError: `Demasiados registros en ${label}; no se devuelve una dieta truncada.`,
  })
}

export async function loadDiet(db: any, coachId: string, clientId: string, plan: Row) {
  const scoped = (table: string, fields: string) => db.from(table).select(fields).eq('coach_id', coachId).eq('client_id', clientId)
  const mealRows = await allRows(() => scoped('diet_meals', 'id, name, day_type, order_index, target_kcal, target_protein_g, target_carbs_g, target_fat_g')
    .eq('diet_plan_id', plan.id).order('order_index').order('id'), 'las comidas')
  if (!mealRows.length) return { ...plan, ...describeMeals(legacyMeals(plan)), structure_source: 'legacy_json' }
  const mealIds = mealRows.map(meal => meal.id)
  const options = await allRows(() => scoped('diet_meal_options', 'id, meal_id, title, name, notes, order_index')
    .in('meal_id', mealIds).order('order_index').order('id'), 'las opciones de comida')
  const optionIds = options.map(option => option.id)
  const items = optionIds.length ? await allRows(() => scoped('diet_meal_items', `id, option_id, item_type, food_name, quantity, unit, quantity_g, details, order_index, food_id, kcal, protein_g, carbs_g, fat_g, alternative_group, is_alternative, equivalence_basis, food:foods(${FOOD_FIELDS})`)
    .in('option_id', optionIds).order('order_index').order('id'), 'los alimentos de la dieta') : []
  const nested = mealRows.map(meal => ({ ...meal, options: options.filter(option => option.meal_id === meal.id)
    .map(option => ({ ...option, items: items.filter(item => item.option_id === option.id) })) }))
  return { ...plan, ...describeMeals(nested), structure_source: 'normalized_tables' }
}

export function registerNutritionTools(server: any, db: any, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)
  // today es el día actual en la zona del espacio de trabajo, no en UTC.
  function scoped(tool: string, input: Row, action: (coachId: string, today: string) => Promise<unknown>) {
    return run(tool, { coachId: input.coach_id, clientId: input.client_id ?? null, fallbackError: 'No se ha podido gestionar la nutrición.' },
      ({ coachId, today }) => action(coachId, today))
  }

  async function planById(coachId: string, clientId: string, planId: string) {
    const plans = rows(await db.from('diet_plans').select(PLAN_FIELDS).eq('coach_id', coachId).eq('client_id', clientId).eq('id', planId), 'el plan de dieta')
    if (!plans.length) throw new Error('Dieta no encontrada en el espacio del entrenador y cliente indicados.')
    return plans[0]
  }

  // Antes la app creaba planes de macros sin cerrar el anterior, así que puede haber varios abiertos a la vez.
  // Vigente es el de effective_from más reciente; los anteriores solapados se pueden cerrar sin cambiar nada.
  // Los sustituidos el mismo día (effective_to < effective_from) no ocupan ninguna fecha.
  async function otherMacroPlans(coachId: string, clientId: string, exceptId?: string) {
    const plans = rows(await db.from('macro_plans').select('id, effective_from, effective_to, archived_at').eq('coach_id', coachId).eq('client_id', clientId), 'los planes de macros')
    return plans.filter(plan => plan.id !== exceptId && (!plan.effective_to || plan.effective_to >= plan.effective_from))
  }
  const overlaps = (plan: Row, from: string, to: string | null) => plan.effective_from <= (to ?? '9999-12-31') && (plan.effective_to ?? '9999-12-31') >= from
  async function closePlans(coachId: string, clientId: string, plans: Row[], from: string) {
    for (const plan of plans) {
      const { error } = await db.from('macro_plans').update({ effective_to: addDays(from, -1), archived_at: plan.archived_at ?? new Date().toISOString() })
        .eq('coach_id', coachId).eq('client_id', clientId).eq('id', plan.id)
      if (error) throw new Error('No se ha podido cerrar el plan de macros anterior. No se guardó ningún cambio en el nuevo plan.')
    }
    return plans.map(plan => plan.id)
  }
  function conflictError(plan: Row) {
    return new Error(`Ya hay un plan de macros desde ${plan.effective_from} (plan_id ${plan.id}). Para cambiar sus objetivos usa update_macro_plan con ese plan_id, o elige otra fecha de inicio.`)
  }

  async function prepare(input: Row) {
    const ids = [...new Set<string>(input.meals.flatMap((meal: Row) => meal.options.flatMap((option: Row) => option.items.map((item: Row) => item.food_id))).filter(Boolean))]
    const foods: Row[] = []
    for (let i = 0; i < ids.length; i += 100) foods.push(...rows(await db.from('foods').select(FOOD_FIELDS).in('id', ids.slice(i, i + 100)), 'el catálogo de alimentos'))
    const prepared = prepareDiet(input, new Map(foods.map(food => [food.id, food])))
    const legacy = buildLegacyDiet(prepared.meals)
    return { ...prepared, legacy }
  }

  async function save(kind: string, coachId: string, input: Row, payload: Row) {
    const { data, error } = await db.rpc('save_nexttrain_nutrition_plan', {
      p_kind: kind, p_coach_id: coachId, p_client_id: input.client_id,
      p_plan_id: input.plan_id ?? null, p_payload: payload,
      p_expected_updated_at: input.expected_updated_at ?? null,
    })
    if (error) throw new Error(error.message || 'No se ha podido guardar el plan. No se aplicó ningún cambio parcial.')
    if (!data?.id) throw new Error('El guardado no devolvió un plan verificable.')
    return data
  }

  server.registerTool('get_current_nutrition', {
    title: 'Nutrición vigente completa',
    description: 'Objetivos nutricionales vigentes (kcal, proteína, hidratos y grasas; distintos en entreno y descanso si los hay) con el ID del plan de macros, y dieta completa con comidas, opciones, cantidades, alternativas y totales. Los alimentos sin macros se señalan, no se inventan.',
    inputSchema: z.strictObject({ ...scope, on_date: date.optional(), day_type: z.enum(['default', 'training', 'rest']).optional() }), annotations,
  }, (input: Row) => scoped('get_current_nutrition', input, async (coachId, today) => {
    const onDate = input.on_date ?? today
    const [macrosResult, dietsResult] = await Promise.all([
      db.from('macro_plans').select(MACRO_FIELDS).eq('coach_id', coachId).eq('client_id', input.client_id)
        .lte('effective_from', onDate).or(`effective_to.is.null,effective_to.gte.${onDate}`).order('effective_from', { ascending: false }).order('created_at', { ascending: false }).limit(1),
      db.from('diet_plans').select(PLAN_FIELDS).eq('coach_id', coachId).eq('client_id', input.client_id).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1),
    ])
    const macro = normalizeMacroPlan(rows(macrosResult, 'los macros')[0] ?? null)
    const appActive = rows(dietsResult, 'la dieta activa')[0] ?? null
    const dietHeader = appActive && appActive.effective_from <= onDate && (!appActive.effective_to || appActive.effective_to >= onDate) ? appActive : null
    const diet = dietHeader ? await loadDiet(db, coachId, input.client_id, dietHeader) : null
    const targets = macro?.day_type_config ?? (macro ? { default: macro } : {})
    if (diet) Object.assign(diet, describeMeals(diet.meals, targets))
    return { client_id: input.client_id, on_date: onDate, macro_target: macro, active_diet_plan: diet,
      selected_day_type: input.day_type ?? null,
      selected_macro_target: input.day_type ? (macro?.day_type_config?.[input.day_type] ?? (macro?.mode === 'simple' ? macro : null)) : null,
      app_active_diet_plan: appActive ? { id: appActive.id, name: appActive.name, effective_from: appActive.effective_from, effective_to: appActive.effective_to } : null,
      note: appActive && !dietHeader ? 'La app tiene una dieta activa por estado, pero no está vigente en la fecha consultada. Usa get_diet_plan para leerla.'
        : !macro ? 'No hay un objetivo de macros vigente. Los totales de alimentos se muestran sin inferir un objetivo.' : null }
  }))

  server.registerTool('get_diet_plan', {
    title: 'Leer dieta completa', description: 'Lee una dieta activa, archivada o borrador por ID con todas sus comidas y opciones. Devuelve updated_at para editar sin sobrescribir cambios recientes.',
    inputSchema: z.strictObject({ ...scope, plan_id: z.string().uuid() }), annotations,
  }, (input: Row) => scoped('get_diet_plan', input, async coachId => ({ client_id: input.client_id,
    diet_plan: await loadDiet(db, coachId, input.client_id, await planById(coachId, input.client_id, input.plan_id)) })))

  server.registerTool('get_nutrition_history', {
    title: 'Histórico de macros y dietas', description: 'Historial de cada cambio de nutrición del atleta. timeline mezcla macros y dietas por fecha de inicio, con duración, motivo del cambio (change_note) y peso al empezar y al terminar (start_weight_kg, end_weight_kg). macro_plans y diet_plans dan el detalle; usa get_diet_plan para el contenido completo de una dieta.',
    inputSchema: z.strictObject({ ...scope, limit: z.number().int().min(1).max(50).default(10), offset: z.number().int().min(0).max(5000).default(0) }), annotations,
  }, (input: Row) => scoped('get_nutrition_history', input, async coachId => {
    const [timelineResult, macroResult, dietResult] = await Promise.all([
      db.from('nutrition_plan_history').select(HISTORY_FIELDS).eq('coach_id', coachId).eq('client_id', input.client_id).order('effective_from', { ascending: false }).order('created_at', { ascending: false }).order('id').range(input.offset, input.offset + input.limit),
      db.from('macro_plans').select(MACRO_FIELDS).eq('coach_id', coachId).eq('client_id', input.client_id).order('effective_from', { ascending: false }).order('id').range(input.offset, input.offset + input.limit),
      db.from('diet_plans').select('id, name, type, status, effective_from, effective_to, notes, archived_at, change_note, created_at, updated_at').eq('coach_id', coachId).eq('client_id', input.client_id).order('created_at', { ascending: false }).order('id').range(input.offset, input.offset + input.limit),
    ])
    const timeline = rows(timelineResult, 'el historial de nutrición')
    const macros = rows(macroResult, 'el histórico de macros'), diets = rows(dietResult, 'el histórico de dietas')
    const hasMore = timeline.length > input.limit || macros.length > input.limit || diets.length > input.limit
    return { client_id: input.client_id, timeline: timeline.slice(0, input.limit).map(historyEntry),
      macro_plans: macros.slice(0, input.limit).map(normalizeMacroPlan), diet_plans: diets.slice(0, input.limit),
      has_more: hasMore, next_offset: hasMore ? input.offset + input.limit : null }
  }))

  server.registerTool('search_foods', {
    title: 'Buscar alimentos y macros', description: 'Busca alimentos accesibles por nombre. Devuelve ID, macros por serving_size_g y peso por unidad para construir dietas con cantidades reales.',
    inputSchema: z.strictObject({ coach_id: scope.coach_id, search: z.string().trim().min(2).max(100), limit: z.number().int().min(1).max(50).default(15) }), annotations,
  }, (input: Row) => scoped('search_foods', input, async () => ({ foods: rows(await db.from('foods').select(FOOD_FIELDS)
    .ilike('name', `%${input.search.replace(/[%_]/g, '')}%`).order('is_generic', { ascending: false }).order('name').limit(input.limit), 'los alimentos') })))

  server.registerTool('preview_diet_plan', {
    title: 'Calcular dieta sin guardar', description: 'Calcula cantidades, macros de cada opción, alternativas y desviaciones. Busca primero food_id con search_foods. No modifica datos; strict_targets rechaza opciones que no encajan.',
    inputSchema: z.strictObject({ ...scope, meals, ...dietSettings }), annotations,
  }, (input: Row) => scoped('preview_diet_plan', input, async () => {
    const prepared = await prepare(input)
    return { client_id: input.client_id, preview: prepared.summary, warnings: prepared.warnings, saved: false }
  }))

  const macroSettings = {
    name: z.string().trim().min(1).max(160).optional().describe('Nombre del bloque, p. ej. «Volumen controlado».'),
    target: target.optional().describe('Objetivo único para todos los días (modo simple). No lo uses si hay entreno y descanso.'),
    day_type_config: config.nullable().optional().describe('Objetivos distintos para días de entreno (training) y de descanso (rest), como en la app. null pasa a modo simple y requiere target.'),
    steps: z.number().int().min(0).max(100000).nullable().optional().describe('Pasos diarios objetivo.'),
    notes: z.string().trim().max(3000).nullable().optional().describe('Notas del plan: fase, criterios y fecha de la próxima revisión.'),
    effective_from: date.describe('Fecha de inicio (YYYY-MM-DD).'),
    effective_to: date.nullable().optional().describe('Fecha de fin; vacío = sin fin.'),
  }
  const changeNote = z.string().trim().max(500).nullable().optional()
    .describe('Motivo del cambio respecto al plan anterior, p. ej. «+150 kcal: peso estancado 3 semanas». Se ve en el historial del coach.')
  server.registerTool('create_macro_plan', {
    title: 'Fijar objetivos nutricionales (macros y calorías)',
    description: 'Pone nuevos objetivos nutricionales a un atleta: calorías (kcal), proteína, hidratos/carbohidratos y grasas, iguales todos los días (target) o distintos en días de entreno y de descanso (day_type_config), con fecha de inicio, pasos y notas. Úsala para subir o bajar calorías, empezar volumen o definición, o cambiar los macros. Las kcal omitidas salen de 4P+4HC+9G. El plan anterior se cierra el día previo y queda en el histórico. Si ya hay un plan que empieza ese día, el error da su plan_id para editarlo con update_macro_plan.',
    inputSchema: z.strictObject({ ...scope, ...macroSettings, change_note: changeNote }), annotations: write,
  }, (input: Row) => scoped('create_macro_plan', input, async coachId => {
    const payload = macroPayload(input)
    const to = input.effective_to ?? null
    const others = (await otherMacroPlans(coachId, input.client_id)).filter(plan => overlaps(plan, input.effective_from, to))
    const conflict = others.find(plan => plan.effective_from >= input.effective_from)
    if (conflict) throw conflictError(conflict)
    return { created: true, macro_plan: normalizeMacroPlan(await save('macros', coachId, input, payload)) }
  }))

  server.registerTool('update_macro_plan', {
    title: 'Editar objetivos nutricionales (macros y calorías)',
    description: 'Cambia un plan de macros existente por plan_id (lo da get_current_nutrition en macro_target.id): calorías, proteína, hidratos y grasas de entreno y descanso, fechas, pasos o notas. Los campos omitidos se conservan. target edita un plan simple; day_type_config edita los dos tipos de día a la vez. Para un nuevo bloque con fecha de inicio distinta, mejor create_macro_plan: conserva el histórico.',
    inputSchema: z.strictObject({ ...scope, plan_id: z.string().uuid(), ...macroSettings, effective_from: macroSettings.effective_from.optional() }),
    annotations: idempotentWriteAnnotations,
  }, (input: Row) => scoped('update_macro_plan', input, async coachId => {
    const raw = rows(await db.from('macro_plans').select(MACRO_FIELDS).eq('coach_id', coachId).eq('client_id', input.client_id).eq('id', input.plan_id), 'el plan de macros')[0]
    const current = normalizeMacroPlan(raw)
    if (!current) throw new Error('Plan de macros no encontrado en este cliente.')
    if (input.target && current.day_type_config && input.day_type_config === undefined) throw new Error('Este plan diferencia entreno y descanso: envía day_type_config completo o null para convertirlo en simple.')
    const from = input.effective_from ?? current.effective_from
    let to = input.effective_to !== undefined ? input.effective_to : current.effective_to
    const others = await otherMacroPlans(coachId, input.client_id, input.plan_id)
    // Un plan antiguo que sigue abierto termina donde empieza el siguiente, como lo ve la app.
    const later = others.filter(plan => plan.effective_from >= from && overlaps(plan, from, to)).sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0]
    if (later && (later.effective_from === from || input.effective_to !== undefined)) throw conflictError(later)
    if (later) to = addDays(later.effective_from, -1)
    const payload = { ...macroPayload({ ...current, ...input, effective_from: from, effective_to: to, target: input.target ?? current }), expected_macro: raw }
    const closed = await closePlans(coachId, input.client_id, others.filter(plan => plan.effective_from < from && overlaps(plan, from, to)), from)
    return { updated: true, macro_plan: normalizeMacroPlan(await save('macros', coachId, input, payload)), closed_previous_plan_ids: closed }
  }))

  const dietHeader = { name: z.string().trim().min(1).max(160), status: z.enum(['draft', 'active', 'archived']).default('draft'),
    effective_from: date, effective_to: date.nullable().optional(), notes: z.string().trim().max(3000).nullable().optional() }
  server.registerTool('create_diet_plan', {
    title: 'Crear dieta por opciones', description: 'Crea comidas con varias opciones para default, training y rest. Calcula macros desde alimentos del catálogo; permite ajuste a objetivos y validación estricta. Por defecto es borrador; active sustituye la dieta activa conservando la anterior archivada. No crea un plan de macros independiente.',
    inputSchema: z.strictObject({ ...scope, ...dietHeader, change_note: changeNote, meals, ...dietSettings }), annotations: write,
  }, (input: Row) => scoped('create_diet_plan', input, async coachId => {
    const prepared = await prepare(input)
    const saved = await save('options', coachId, input, { ...input, meals: prepared.meals, legacy_meals: prepared.legacy })
    return { created: true, diet_plan: await loadDiet(db, coachId, input.client_id, saved), warnings: prepared.warnings }
  }))

  server.registerTool('update_diet_plan', {
    title: 'Editar dieta por opciones', description: 'Edita cabecera o estructura completa. Lee antes get_diet_plan y envía expected_updated_at. Conserva IDs existentes; meals reemplaza la estructura completa. Se rechaza quitar comidas/opciones con registros del atleta: crea una nueva dieta para cambiar ese histórico.',
    inputSchema: z.strictObject({ ...scope, plan_id: z.string().uuid(), expected_updated_at: z.string().datetime({ offset: true }),
      name: dietHeader.name.optional(), status: z.enum(['draft', 'active', 'archived']).optional(), effective_from: date.optional(),
      effective_to: date.nullable().optional(), notes: dietHeader.notes, meals: meals.optional(), ...dietSettings }),
    annotations: { ...write, destructiveHint: true },
  }, (input: Row) => scoped('update_diet_plan', input, async coachId => {
    const current = await planById(coachId, input.client_id, input.plan_id)
    if (current.updated_at !== input.expected_updated_at && Date.parse(current.updated_at) !== Date.parse(input.expected_updated_at)) throw new Error('La dieta cambió desde la última lectura. Vuelve a leer get_diet_plan.')
    if (!input.meals && (input.daily_targets || input.strict_targets)) throw new Error('Para ajustar objetivos o validarlos, envía meals con la estructura completa.')
    const prepared = input.meals ? await prepare(input) : null
    const payload = { ...current, ...input, meals: prepared?.meals, legacy_meals: prepared?.legacy }
    const saved = await save('options', coachId, input, payload)
    return { updated: true, diet_plan: await loadDiet(db, coachId, input.client_id, saved), warnings: prepared?.warnings ?? [] }
  }))
}
