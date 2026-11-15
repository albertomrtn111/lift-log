import assert from 'node:assert/strict'
import { callerFromClaims, checkSession, closedSessionResponse, createAudit } from './access.ts'
import { createToolRunner, jsonResult, toolError } from './shared.ts'

const user = '11111111-1111-4111-8111-111111111111'
const session = '22222222-2222-4222-8222-222222222222'
const coach = '33333333-3333-4333-8333-333333333333'
const client = '44444444-4444-4444-8444-444444444444'

function dbReturning(result: { data?: unknown; error?: unknown }, calls: unknown[] = []) {
  return {
    rpc(name: string, args?: unknown) {
      calls.push({ name, args })
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
  }
}

Deno.test('callerFromClaims saca cuenta, asistente y sesión del token', () => {
  const caller = callerFromClaims({ sub: user, client_id: 'cliente-oauth', session_id: session, role: 'authenticated' })
  assert.deepEqual(caller, { userId: user, oauthClientId: 'cliente-oauth', sessionId: session, role: 'authenticated' })
  assert.equal(callerFromClaims({ sub: 'no-es-uuid' }).userId, null)
  assert.equal(callerFromClaims(null).role, null)
})

Deno.test('checkSession solo deja pasar tokens de usuario con la sesión abierta', async () => {
  const ok = callerFromClaims({ sub: user, session_id: session, role: 'authenticated' })
  assert.equal(await checkSession(dbReturning({ data: true }), ok), 'ok')
  assert.equal(await checkSession(dbReturning({ data: false }), ok), 'closed')
  assert.equal(await checkSession(dbReturning({ error: { code: 'PGRST301' } }), ok), 'unavailable')
  // Migración sin aplicar: se mantiene el comportamiento anterior.
  assert.equal(await checkSession(dbReturning({ error: { code: 'PGRST202' } }), ok), 'ok')

  // Ni la clave de servicio ni el rol anónimo, aunque la función dijera que sí.
  for (const role of ['service_role', 'anon', null]) {
    const caller = callerFromClaims({ sub: user, session_id: session, role })
    assert.equal(await checkSession(dbReturning({ data: true }), caller), 'closed')
  }
  assert.equal(await checkSession(dbReturning({ data: true }), callerFromClaims({ sub: user, role: 'authenticated' })), 'closed')
})

Deno.test('la respuesta de sesión cerrada es un 401 sin datos', async () => {
  const response = closedSessionResponse()
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error, 'invalid_token')
})

Deno.test('el registro guarda solo identificadores y no rompe la herramienta', async () => {
  const calls: any[] = []
  const caller = callerFromClaims({ sub: user, client_id: 'cliente-oauth', session_id: session, role: 'authenticated' })
  const original = console.error
  console.error = () => {}
  try {
    await createAudit(dbReturning({}, calls), caller)('get_checkins', { coach_id: coach, client_id: client, status: 'ok', result_count: 3 })
    await createAudit({ rpc: () => Promise.reject(new Error('caída')) }, caller)('get_checkins', { status: 'ok' })
  } finally {
    console.error = original
  }
  assert.deepEqual(calls, [{
    name: 'mcp_log_call',
    args: { p_tool: 'get_checkins', p_status: 'ok', p_coach_id: coach, p_client_id: client, p_record_id: null, p_error: null },
  }])
})

Deno.test('los intentos rechazados quedan registrados con el espacio pedido', async () => {
  const entries: any[] = []
  const run = createToolRunner({}, {
    resolveCoach: () => Promise.reject(new Error('La cuenta no tiene una membresía activa de entrenador.')),
    requireClient: async () => ({}),
    jsonResult,
    toolError,
    audit: (tool, details) => { entries.push({ tool, ...details }) },
  })
  const result = await run('get_client_overview', { coachId: coach, clientId: client, fallbackError: 'x' }, async () => ({}))
  assert.equal(result.isError, true)
  assert.deepEqual(entries, [{
    tool: 'get_client_overview',
    coach_id: coach,
    client_id: client,
    status: 'error',
    error: 'La cuenta no tiene una membresía activa de entrenador.',
  }])
})
