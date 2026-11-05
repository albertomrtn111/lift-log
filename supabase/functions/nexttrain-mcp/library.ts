import { z } from 'npm:zod@4.3.6'
import {
  createToolRunner,
  type Db,
  defaultHelpers,
  idempotentWriteAnnotations,
  readOnlyAnnotations,
  type Row,
  rows,
  type ToolHelpers,
} from './shared.ts'

type Server = any

const optionalCoachId = z.string().uuid().optional().describe('Solo si la cuenta pertenece a varios espacios.')

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  coach: 'Profesional',
}

// Lo que puede hacer cada rol en un espacio. Las políticas de la base de datos lo aplican igualmente.
export function rolePermissions(role: string) {
  const manager = role === 'owner' || role === 'admin'
  return {
    role_label: ROLE_LABELS[role] ?? role,
    can_manage_team: manager,
    can_manage_library: manager,
    can_edit_branding: manager,
    can_add_to_library: true,
    can_manage_plan: role === 'owner',
  }
}

export function exerciseNameKey(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

type CatalogFilters = { search?: string; primaryGroup?: string; block?: string; onlyLibrary?: boolean }

// Catálogo común con el bloque y el nombre que usa el espacio.
export function buildCatalogView(
  exercises: Row[],
  blocks: Row[],
  blockOverrides: Row[],
  entries: Row[],
  aliases: Row[],
  filters: CatalogFilters = {},
) {
  const overrideByKey = new Map(blockOverrides.map((row) => [row.block_key, row]))
  const blockName = new Map(blocks.map((block) => [block.key, overrideByKey.get(block.key)?.display_name ?? block.name]))
  const entryById = new Map(entries.map((entry) => [entry.catalog_exercise_id, entry]))
  const aliasKeys = new Map<string, string[]>()
  for (const alias of aliases) {
    const keys = aliasKeys.get(alias.catalog_exercise_id) ?? []
    keys.push(alias.alias_key)
    aliasKeys.set(alias.catalog_exercise_id, keys)
  }

  const query = filters.search ? exerciseNameKey(filters.search) : ''
  const group = filters.primaryGroup ? exerciseNameKey(filters.primaryGroup) : ''
  const blockQuery = filters.block ? exerciseNameKey(filters.block) : ''

  return exercises.flatMap((exercise) => {
    const entry = entryById.get(exercise.id)
    const block = blockName.get(exercise.block_key) ?? null
    const equipment: string[] = exercise.equipment ?? []
    if (filters.onlyLibrary && !entry) return []
    if (group && exerciseNameKey(exercise.primary_group) !== group) return []
    if (blockQuery && (!block || !exerciseNameKey(block).includes(blockQuery))) return []
    if (query) {
      const found = [exercise.name, exercise.primary_group, block ?? '', entry?.short_name ?? '', ...equipment]
        .some((text) => exerciseNameKey(text).includes(query))
        || (aliasKeys.get(exercise.id) ?? []).some((key) => key.includes(query))
      if (!found) return []
    }
    return [{
      id: exercise.id,
      name: exercise.name,
      primary_group: exercise.primary_group,
      block,
      laterality: exercise.laterality,
      equipment,
      metrics: exercise.metrics,
      in_library: !!entry,
      ...(entry?.short_name ? { workspace_name: entry.short_name } : {}),
    }]
  })
}

export async function loadCatalogView(db: Db, coachId: string, filters: CatalogFilters) {
  const [exercises, aliases, blocks, overrides, entries] = await Promise.all([
    db.from('exercise_catalog')
      .select('id, name, primary_group, block_key, laterality, equipment, metrics')
      .eq('is_active', true)
      .order('name'),
    db.from('exercise_catalog_aliases').select('alias_key, catalog_exercise_id'),
    db.from('exercise_blocks').select('key, name'),
    db.from('workspace_blocks').select('block_key, display_name').eq('coach_id', coachId),
    db.from('workspace_exercises').select('catalog_exercise_id, short_name').eq('coach_id', coachId),
  ])
  const loadError = 'No se ha podido consultar la biblioteca de ejercicios.'
  return buildCatalogView(
    rows(exercises, 'ejercicios', loadError),
    rows(blocks, 'bloques', loadError),
    rows(overrides, 'bloques', loadError),
    rows(entries, 'biblioteca', loadError),
    // Los alias son una ayuda: sin ellos se busca por nombre.
    aliases.data ?? [],
    filters,
  )
}

export function registerLibraryTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'list_workspace_library',
    {
      title: 'Ver la biblioteca del espacio',
      description: 'Lista los ejercicios que usa este espacio, con su nombre corto, bloque, series y repeticiones por defecto y si están ocultos. El catálogo común completo está en list_exercise_catalog.',
      inputSchema: z.object({
        search: z.string().trim().max(80).optional().describe('Texto en el nombre, el nombre corto, el bloque o el material.'),
        block: z.string().trim().max(60).optional().describe('Nombre del bloque, por ejemplo Empuje horizontal.'),
        include_hidden: z.boolean().default(false),
        coach_id: optionalCoachId,
      }),
      annotations: readOnlyAnnotations,
    },
    (input: any) => run('list_workspace_library', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido consultar la biblioteca del espacio.',
    }, async ({ coachId, log }) => {
      const result = await db.from('workspace_exercises')
        .select('catalog_exercise_id, short_name, group_title, default_sets, default_reps, sort_order, is_hidden')
        .eq('coach_id', coachId)
      const settings = rows(result, 'biblioteca', 'No se ha podido consultar la biblioteca del espacio.')
      const settingsById = new Map(settings.map((row) => [row.catalog_exercise_id, row]))

      const exercises = (await loadCatalogView(db, coachId, {
        search: input.search,
        block: input.block,
        onlyLibrary: true,
      })).flatMap((exercise) => {
        const entry = settingsById.get(exercise.id)
        if (!entry || (entry.is_hidden && !input.include_hidden)) return []
        return [{
          ...exercise,
          group_title: entry.group_title,
          default_sets: entry.default_sets,
          default_reps: entry.default_reps,
          sort_order: entry.sort_order,
          hidden: entry.is_hidden,
        }]
      })

      log.result_count = exercises.length
      return { exercises }
    }),
  )

  server.registerTool(
    'add_to_library',
    {
      title: 'Añadir ejercicio a la biblioteca',
      description: 'Añade un ejercicio del catálogo común a la biblioteca del espacio. Si ya estaba, no cambia nada.',
      inputSchema: z.object({
        catalog_exercise_id: z.string().uuid().optional().describe('ID de list_exercise_catalog.'),
        name: z.string().trim().min(1).max(160).optional().describe('Nombre o alias, si no tienes el ID.'),
        coach_id: optionalCoachId,
      }).refine((input) => input.catalog_exercise_id || input.name, 'Indica catalog_exercise_id o name.'),
      annotations: idempotentWriteAnnotations,
    },
    (input: any) => run('add_to_library', {
      coachId: input.coach_id,
      fallbackError: 'No se ha podido añadir el ejercicio a la biblioteca.',
    }, async ({ coachId, log }) => {
      const { data: exercise } = await db.rpc('resolve_catalog_exercise', {
        p_catalog_exercise_id: input.catalog_exercise_id ?? null,
        p_name: input.name ?? null,
      })
      if (!exercise?.id) throw new Error('Ese ejercicio no está en el catálogo. Búscalo con list_exercise_catalog.')

      const { data: existing, error: readError } = await db.from('workspace_exercises')
        .select('id')
        .eq('coach_id', coachId)
        .eq('catalog_exercise_id', exercise.id)
        .maybeSingle()
      if (readError) throw new Error('No se ha podido consultar la biblioteca del espacio.')

      if (!existing) {
        const { error } = await db.from('workspace_exercises').upsert(
          { coach_id: coachId, catalog_exercise_id: exercise.id },
          { onConflict: 'coach_id,catalog_exercise_id', ignoreDuplicates: true },
        )
        if (error) throw new Error('No se ha podido añadir el ejercicio a la biblioteca.')
      }

      log.record_id = exercise.id
      return { added: !existing, exercise: { id: exercise.id, name: exercise.name } }
    }),
  )
}
