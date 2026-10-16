import { z } from 'npm:zod@4.3.6'

export type Db = any
export type Row = Record<string, any>

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Fecha inválida; usa YYYY-MM-DD')

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}

export const idempotentWriteAnnotations = {
  ...writeAnnotations,
  idempotentHint: true,
}

export function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function day(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10)
}

export function addDays(value: string, days: number) {
  const date = toUtcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return day(date)
}

export function jsonResult(data: unknown) {
  return {
    // Sin sangría: el resultado lo lee un modelo y los espacios solo suman tokens.
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  }
}

export function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  }
}

export function audit(tool: string, details: Record<string, unknown>) {
  console.error(JSON.stringify({ event: 'nexttrain_mcp_tool', tool, ...details }))
}

export function rows(
  result: { data: Row[] | null; error: unknown },
  label: string,
  message = `No se han podido cargar ${label}.`,
): Row[] {
  if (result.error) throw new Error(message)
  return result.data ?? []
}

type AllRowsOptions = {
  pageSize?: number
  maxRows?: number
  loadError?: string
  tooManyError?: string
}

export async function allRows(makeQuery: () => any, label: string, options: AllRowsOptions = {}) {
  const { pageSize = 1000, maxRows = 50_000 } = options
  const result: Row[] = []
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = rows(await makeQuery().range(offset, offset + pageSize - 1), label, options.loadError)
    result.push(...page)
    if (page.length < pageSize) return result
  }
  throw new Error(options.tooManyError ?? `La consulta de ${label} es demasiado amplia. Acota el rango de fechas o el programa.`)
}

export async function inBatches(db: Db, table: string, select: string, field: string, ids: string[], configure?: (query: any) => any) {
  const result: Row[] = []
  for (let index = 0; index < ids.length; index += 60) {
    const batch = ids.slice(index, index + 60)
    result.push(...await allRows(() => {
      let query = db.from(table).select(select).in(field, batch)
      if (configure) query = configure(query)
      return query.order('id', { ascending: true })
    }, table))
  }
  return result
}

export async function resolveCoach(db: Db, requestedCoachId?: string) {
  let query = db
    .from('coach_memberships')
    .select('coach_id, role, status, created_at')
    .eq('status', 'active')
    .in('role', ['owner', 'coach'])
    .order('created_at', { ascending: true })

  if (requestedCoachId) query = query.eq('coach_id', requestedCoachId)

  const { data, error } = await query
  if (error) throw new Error('No se ha podido comprobar el acceso del entrenador.')
  if (!data?.length) throw new Error('La cuenta no tiene una membresía activa de entrenador.')
  if (!requestedCoachId && data.length > 1) {
    throw new Error('La cuenta pertenece a varios espacios. Indica coach_id para elegir uno.')
  }

  return { coachId: data[0].coach_id as string, role: data[0].role as string }
}

export async function requireClient(db: Db, coachId: string, clientId: string): Promise<Row> {
  const { data, error } = await db
    .from('clients')
    .select('id, coach_id, full_name, status, start_date, next_checkin_date')
    .eq('id', clientId)
    .eq('coach_id', coachId)
    .maybeSingle()

  if (error || !data) throw new Error('Cliente no encontrado en el espacio del entrenador.')
  return data
}

// Las pruebas sustituyen estas funciones para no depender de Supabase.
export type ToolHelpers = {
  resolveCoach: (db: Db, coachId?: string) => Promise<{ coachId: string }>
  requireClient: (db: Db, coachId: string, clientId: string) => Promise<unknown>
  jsonResult: (data: unknown) => any
  toolError: (message: string) => any
  audit: (tool: string, details: Record<string, unknown>) => void
}

export const defaultHelpers: ToolHelpers = { resolveCoach, requireClient, jsonResult, toolError, audit }

type RunOptions = {
  coachId?: string
  // undefined: la herramienta no trabaja con clientes y la auditoría no incluye client_id.
  // null: client_id opcional sin indicar; se audita como null.
  clientId?: string | null
  fallbackError: string
}

type RunContext = {
  coachId: string
  client: Row | null
  // Campos extra para la auditoría de éxito (record_id, result_count...).
  log: Record<string, unknown>
}

export function createToolRunner(db: Db, helpers: ToolHelpers = defaultHelpers) {
  const { resolveCoach, requireClient, jsonResult, toolError, audit } = helpers
  return async (tool: string, options: RunOptions, action: (context: RunContext) => Promise<unknown>) => {
    const scope = options.clientId === undefined ? {} : { client_id: options.clientId }
    try {
      const { coachId } = await resolveCoach(db, options.coachId)
      const client = options.clientId ? await requireClient(db, coachId, options.clientId) as Row : null
      const log: Record<string, unknown> = {}
      const result = await action({ coachId, client, log })
      audit(tool, { coach_id: coachId, ...scope, ...log, status: 'ok' })
      return jsonResult(result)
    } catch (error) {
      audit(tool, { ...scope, status: 'error' })
      return toolError(error instanceof Error ? error.message : options.fallbackError)
    }
  }
}
