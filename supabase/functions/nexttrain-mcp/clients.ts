import { z } from 'npm:zod@4.3.6'
import { createToolRunner, type Db, defaultHelpers, readOnlyAnnotations, type Row, type ToolHelpers } from './shared.ts'

type Server = any

// today es el día actual en la zona del espacio de trabajo.
export function clientAttentionFlags(client: Row, latest: Row | null, today: string) {
  const flags: string[] = []
  if (!latest) flags.push('sin_checkin')
  if (latest?.training_adherence_pct != null && latest.training_adherence_pct < 70) flags.push('adherencia_entreno_baja')
  if (latest?.nutrition_adherence_pct != null && latest.nutrition_adherence_pct < 70) flags.push('adherencia_nutricion_baja')
  if (latest?.energy != null && latest.energy <= 4) flags.push('energia_baja')
  if (latest?.stress != null && latest.stress >= 7) flags.push('estres_alto')
  if (latest?.injuries?.trim()) flags.push('lesion_o_molestia')
  if (client.next_checkin_date && client.next_checkin_date < today) flags.push('checkin_atrasado')
  return flags
}

export function registerClientTools(server: Server, db: Db, helpers: ToolHelpers = defaultHelpers) {
  const run = createToolRunner(db, helpers)

  server.registerTool(
    'list_clients',
    {
      title: 'Listar clientes',
      description: 'Lista clientes del entrenador con señales breves de seguimiento y su último check-in.',
      inputSchema: z.object({
        coach_id: z.string().uuid().optional().describe('Solo hace falta si el entrenador pertenece a más de un espacio de trabajo.'),
        status: z.enum(['active', 'inactive', 'all']).default('active'),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(5000).default(0),
      }),
      annotations: readOnlyAnnotations,
    },
    ({ coach_id, status, search, limit, offset }: Row) => run('list_clients', {
      coachId: coach_id,
      fallbackError: 'No se han podido listar los clientes.',
    }, async ({ coachId, today, log }) => {
      let query = db
        .from('clients')
        .select('id, full_name, status, start_date, next_checkin_date, checkin_frequency_days')
        .eq('coach_id', coachId)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        // Se pide una fila extra para saber si hay más páginas sin contar toda la cartera.
        .range(offset, offset + limit)

      if (status !== 'all') query = query.eq('status', status)
      if (search) query = query.ilike('full_name', `%${search.replaceAll('%', '')}%`)

      const { data, error } = await query
      if (error) throw new Error('No se ha podido cargar la cartera de clientes.')
      const hasMore = (data ?? []).length > limit
      const clients = (data ?? []).slice(0, limit)

      const clientIds = clients.map((client: Row) => client.id)
      let checkins: Row[] = []
      if (clientIds.length) {
        // Un límite global dejaba fuera a clientes con check-ins antiguos y los marcaba sin_checkin.
        const response = await db.rpc('nexttrain_latest_checkins', {
          p_coach_id: coachId,
          p_client_ids: clientIds,
        })
        if (response.error) throw new Error('No se han podido cargar los últimos check-ins.')
        checkins = response.data ?? []
      }

      const latestByClient = new Map<string, Row>(checkins.map((checkin) => [checkin.client_id, checkin]))

      const result = clients.map((client: Row) => {
        const latest = latestByClient.get(client.id) ?? null
        return {
          ...client,
          latest_checkin: latest,
          attention_flags: clientAttentionFlags(client, latest, today),
        }
      })

      log.result_count = result.length
      return { coach_id: coachId, today, clients: result, has_more: hasMore, next_offset: hasMore ? offset + limit : null }
    }),
  )
}
