import type { Db, Row } from './shared.ts'

/** Quién llama: la cuenta, el asistente (cliente OAuth) y la sesión, sacados del token ya verificado. */
export type Caller = {
  userId: string | null
  oauthClientId: string | null
  sessionId: string | null
  role: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null
}

export function callerFromClaims(claims: Row | null | undefined): Caller {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
  return {
    userId: uuidOrNull(claims?.sub),
    oauthClientId: text(claims?.client_id),
    sessionId: uuidOrNull(claims?.session_id),
    role: text(claims?.role),
  }
}

export type SessionState = 'ok' | 'closed' | 'unavailable'

// La firma del token sigue valiendo hasta que caduca. Por eso, en cada petición se
// comprueba en la base de datos que la sesión sigue abierta: al desconectar un
// asistente en Ajustes se cierra su sesión y deja de entrar en ese momento.
export async function checkSession(db: Db, caller: Caller): Promise<SessionState> {
  if (caller.role !== 'authenticated' || !caller.userId || !caller.sessionId) return 'closed'
  try {
    const { data, error } = await db.rpc('mcp_session_active')
    if (error) {
      // PGRST202: la función aún no existe (migración sin aplicar). Se sigue como antes.
      if (error.code === 'PGRST202') return 'ok'
      return 'unavailable'
    }
    return data === true ? 'ok' : 'closed'
  } catch {
    return 'unavailable'
  }
}

export function closedSessionResponse() {
  // Sin cabecera WWW-Authenticate: la añade withOAuthProtectedResource con la URL de metadatos.
  return new Response(JSON.stringify({
    error: 'invalid_token',
    error_description: 'La conexión con NexTrain se ha cerrado. Vuelve a conectar el asistente.',
  }), { status: 401, headers: { 'Content-Type': 'application/json' } })
}

export function unavailableResponse() {
  return new Response(JSON.stringify({
    error: 'temporarily_unavailable',
    error_description: 'No se ha podido comprobar la conexión. Inténtalo de nuevo en unos segundos.',
  }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '5' } })
}

/**
 * Registro de uso: una línea en los logs de la función y una fila en mcp_tool_calls.
 * Solo se guardan identificadores y el resultado, nunca los datos de la petición.
 * Nunca hace fallar la herramienta.
 */
export function createAudit(db: Db, caller: Caller) {
  return async (tool: string, details: Record<string, unknown>) => {
    console.error(JSON.stringify({
      event: 'nexttrain_mcp_tool',
      tool,
      user_id: caller.userId,
      oauth_client_id: caller.oauthClientId,
      ...details,
    }))
    try {
      const { error } = await db.rpc('mcp_log_call', {
        p_tool: tool,
        p_status: details.status === 'ok' ? 'ok' : 'error',
        p_coach_id: uuidOrNull(details.coach_id),
        p_client_id: uuidOrNull(details.client_id),
        p_record_id: uuidOrNull(details.record_id),
        p_error: typeof details.error === 'string' ? details.error.slice(0, 200) : null,
      })
      if (error && error.code !== 'PGRST202') console.error(JSON.stringify({ event: 'nexttrain_mcp_log_failed', tool }))
    } catch {
      // El registro es secundario: la herramienta ya ha respondido.
    }
  }
}
