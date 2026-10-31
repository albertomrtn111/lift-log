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

// Lunes (YYYY-MM-DD) de la semana de una fecha.
export function mondayOf(value: string) {
  const date = toUtcDate(value)
  return addDays(value, -((date.getUTCDay() + 6) % 7))
}

// Igual que la app (src/data/billing.ts): sin zona guardada, el espacio trabaja en hora de Madrid.
export const DEFAULT_TIME_ZONE = 'Europe/Madrid'

function dateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
}

// Devuelve una zona IANA válida; una vacía o desconocida cae en la zona por defecto.
export function resolveTimeZone(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIME_ZONE
  try {
    dateFormatter(value.trim())
    return value.trim()
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

// «Hoy» (YYYY-MM-DD) en la zona del espacio de trabajo, no en UTC.
export function todayIn(timeZone: string, now: Date = new Date()) {
  return dateFormatter(resolveTimeZone(timeZone)).format(now)
}

export function jsonResult(data: unknown) {
  // Sin sangría: el resultado lo lee un modelo y los espacios solo suman tokens.
  const text = JSON.stringify(data)
  return {
    // El texto se mantiene para los clientes que no leen structuredContent (MCP 2025-06-18).
    content: [{ type: 'text' as const, text }],
    // Misma información ya serializada: sin undefined ni fechas como objetos, igual que el texto.
    structuredContent: JSON.parse(text) as Record<string, unknown>,
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

/**
 * ¿El espacio tiene suscripción activa o prueba en curso? Misma regla que
 * subscriptionAccess() en src/lib/subscription/access.js (la app web).
 */
export function subscriptionAllows(
  sub: { status?: string; trial_ends_at?: string | null; stripe_subscription_id?: string | null } | null | undefined,
  now = new Date(),
) {
  if (!sub?.status) return false
  if (['comped', 'active', 'past_due'].includes(sub.status)) return true
  if (sub.status !== 'trialing') return false
  if (sub.stripe_subscription_id) return true
  return Boolean(sub.trial_ends_at) && new Date(sub.trial_ends_at as string).getTime() > now.getTime()
}

export async function resolveCoach(db: Db, requestedCoachId?: string) {
  let query = db
    .from('coach_memberships')
    // La zona y la suscripción del espacio vienen en la misma consulta para no añadir una por herramienta.
    .select('coach_id, role, status, created_at, coaches(timezone, coach_subscriptions(status, trial_ends_at, stripe_subscription_id))')
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

  const coach = Array.isArray(data[0].coaches) ? data[0].coaches[0] : data[0].coaches
  const subscription = Array.isArray(coach?.coach_subscriptions) ? coach.coach_subscriptions[0] : coach?.coach_subscriptions
  if (!subscriptionAllows(subscription)) {
    throw new Error('La prueba gratis de este espacio ha terminado. Elige un plan en NexTrain (menú Suscripción) para seguir usándolo.')
  }
  return { coachId: data[0].coach_id as string, role: data[0].role as string, timeZone: resolveTimeZone(coach?.timezone) }
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
  resolveCoach: (db: Db, coachId?: string) => Promise<{ coachId: string; timeZone?: string }>
  requireClient: (db: Db, coachId: string, clientId: string) => Promise<unknown>
  jsonResult: (data: unknown) => any
  toolError: (message: string) => any
  audit: (tool: string, details: Record<string, unknown>) => void
  // Reloj de la petición; las pruebas lo fijan para comprobar el cambio de día.
  now?: () => Date
}

export const defaultHelpers: ToolHelpers = { resolveCoach, requireClient, jsonResult, toolError, audit }

type RunOptions = {
  coachId?: string
  // undefined: la herramienta no trabaja con clientes y la auditoría no incluye client_id.
  // null: client_id opcional sin indicar; se audita como null.
  clientId?: string | null
  fallbackError: string
}

export type RunContext = {
  coachId: string
  // Zona del espacio de trabajo y «hoy» en esa zona, resueltos una vez por petición.
  timeZone: string
  today: string
  client: Row | null
  // Campos extra para la auditoría de éxito (record_id, result_count...).
  log: Record<string, unknown>
}

export function createToolRunner(db: Db, helpers: ToolHelpers = defaultHelpers) {
  const { resolveCoach, requireClient, jsonResult, toolError, audit, now = () => new Date() } = helpers
  return async (tool: string, options: RunOptions, action: (context: RunContext) => Promise<unknown>) => {
    const scope = options.clientId === undefined ? {} : { client_id: options.clientId }
    try {
      const resolved = await resolveCoach(db, options.coachId)
      const coachId = resolved.coachId
      const timeZone = resolveTimeZone(resolved.timeZone)
      const client = options.clientId ? await requireClient(db, coachId, options.clientId) as Row : null
      const log: Record<string, unknown> = {}
      const result = await action({ coachId, timeZone, today: todayIn(timeZone, now()), client, log })
      audit(tool, { coach_id: coachId, ...scope, ...log, status: 'ok' })
      return jsonResult(result)
    } catch (error) {
      audit(tool, { ...scope, status: 'error' })
      return toolError(error instanceof Error ? error.message : options.fallbackError)
    }
  }
}
