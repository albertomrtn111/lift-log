import test from 'node:test'
import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch
const originalEnv = {
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
  retryBaseMs: process.env.GEMINI_RETRY_BASE_MS,
}

process.env.GEMINI_API_KEY = 'test-key'
process.env.GEMINI_MODEL = 'gemini-3.7-flash'
process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite'
process.env.GEMINI_RETRY_BASE_MS = '0'

const { callGemini, streamGemini } = await import('../src/lib/ai/gemini.ts')

test.after(() => {
  globalThis.fetch = originalFetch
  restoreEnv('GEMINI_API_KEY', originalEnv.apiKey)
  restoreEnv('GEMINI_MODEL', originalEnv.model)
  restoreEnv('GEMINI_FALLBACK_MODEL', originalEnv.fallbackModel)
  restoreEnv('GEMINI_RETRY_BASE_MS', originalEnv.retryBaseMs)
})

test('callGemini retries a transient primary failure and falls back to Flash-Lite', async () => {
  const urls = []
  const responses = [
    errorResponse(503, 'High demand'),
    errorResponse(503, 'High demand'),
    successResponse('OK'),
  ]

  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return responses.shift()
  }

  const result = await callGemini('Hola', { maxOutputTokens: 16, thinkingBudget: 0 })

  assert.equal(result, 'OK')
  assert.equal(urls.length, 3)
  assert.match(urls[0], /models\/gemini-3\.7-flash:generateContent/)
  assert.match(urls[1], /models\/gemini-3\.7-flash:generateContent/)
  assert.match(urls[2], /models\/gemini-3\.1-flash-lite:generateContent/)
})

test('callGemini does not retry or fall back on a non-transient request error', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return errorResponse(400, 'Invalid request')
  }

  await assert.rejects(
    () => callGemini('Hola'),
    /Error de Gemini \(400\): Invalid request/
  )
  assert.equal(calls, 1)
})

test('streamGemini falls back and returns parsed SSE text', async () => {
  const urls = []
  const responses = [
    errorResponse(503, 'High demand'),
    errorResponse(503, 'High demand'),
    new Response('data: {"candidates":[{"content":{"parts":[{"text":"Hola"}]}}]}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  ]

  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return responses.shift()
  }

  const stream = await streamGemini('Hola', { maxOutputTokens: 16, thinkingBudget: 0 })
  const text = await readTextStream(stream)

  assert.equal(text, 'Hola')
  assert.equal(urls.length, 3)
  assert.match(urls[2], /models\/gemini-3\.1-flash-lite:streamGenerateContent/)
  assert.match(urls[2], /alt=sse/)
})

test('Gemini 3.7 uses supported reasoning levels and keeps credentials out of the URL', async () => {
  globalThis.fetch = async (url, init) => {
    assert.ok(!String(url).includes('test-key'))
    assert.equal(init.headers['x-goog-api-key'], 'test-key')
    const body = JSON.parse(init.body)
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'high' })
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.ok(body.systemInstruction.parts[0].text.includes('entrenador'))
    assert.ok(init.signal)
    return successResponse('{}')
  }
  await callGemini('JSON', { thinkingLevel: 'high', responseMimeType: 'application/json' })
})

test('text joins all non-thought parts, and a truncated candidate is not accepted', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'reasoning', thought: true }, { text: 'Hola ' }, { text: 'coach' }] } }] }))
  assert.equal(await callGemini('Hola'), 'Hola coach')
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"incomplete":' }] } }] }))
  await assert.rejects(() => callGemini('Hola'), /incompleta/)
})

test('streaming flushes a final event without newline and filters thought parts', async () => {
  const encoded = new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"secret"},{"text":"Hola "},{"text":"éxito"}]}}]}')
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < encoded.length; i += 3) controller.enqueue(encoded.slice(i, i + 3)); controller.close() } }))
  assert.equal(await readTextStream(await streamGemini('Hola')), 'Hola éxito')
})

test('provider errors in an SSE stream fail rather than silently persisting a partial reply', async () => {
  globalThis.fetch = async () => new Response('data: {"error":{"code":503}}\n\n')
  await assert.rejects(async () => readTextStream(await streamGemini('Hola')), /interrumpió/)
})

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function successResponse(text) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

async function readTextStream(stream) {
  const reader = stream.getReader()
  let output = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return output
    output += value
  }
}
