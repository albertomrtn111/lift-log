/**
 * Centralized Gemini API client.
 *
 * Environment variables:
 *   GEMINI_API_KEY          - required
 *   GEMINI_MODEL            - optional, defaults to gemini-3.5-flash
 *   GEMINI_FALLBACK_MODEL   - optional, defaults to gemini-3.1-flash-lite
 *   GEMINI_API_VER          - optional, defaults to v1beta
 *   GEMINI_RETRY_BASE_MS    - optional, defaults to 700
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const DEFAULT_MODEL = 'gemini-3.5-flash'
const DEFAULT_FALLBACK_MODEL = 'gemini-3.1-flash-lite'
const DEFAULT_API_VER = 'v1beta'
const DEFAULT_RETRY_BASE_MS = 700
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])

export interface GeminiCallOptions {
    temperature?: number
    maxOutputTokens?: number
    /** Only set if you are certain the model+version supports it. Defaults to omitted. */
    responseMimeType?: 'application/json' | 'text/plain'
    /** Set to 0 when visible output is more important than model reasoning. */
    thinkingBudget?: number
}

type GeminiAction = 'generateContent' | 'streamGenerateContent'

interface GeminiRequestInput {
    apiKey: string
    apiVer: string
    action: GeminiAction
    body: Record<string, unknown>
}

interface GeminiRequestResult {
    response: Response
    model: string
}

function getConfiguredModels() {
    const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
    const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL
    return fallback && fallback !== primary ? [primary, fallback] : [primary]
}

function getRetryBaseMs() {
    const configured = Number(process.env.GEMINI_RETRY_BASE_MS)
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_RETRY_BASE_MS
}

function buildGenerationConfig(options: GeminiCallOptions) {
    const generationConfig: Record<string, unknown> = {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
    }
    if (options.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType
    }
    if (options.thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget }
    }
    return generationConfig
}

function createGeminiHttpError(status: number, errorBody: string) {
    let providerMessage = ''
    try {
        const parsed = JSON.parse(errorBody)
        providerMessage = typeof parsed?.error?.message === 'string' ? parsed.error.message : ''
    } catch {
        providerMessage = ''
    }

    return new Error(providerMessage
        ? `Error de Gemini (${status}): ${providerMessage}`
        : `Error HTTP ${status} al llamar a la API de IA. Intentalo de nuevo.`)
}

async function waitBeforeRetry(attempt: number) {
    const baseMs = getRetryBaseMs()
    if (baseMs === 0) return
    const jitterMs = Math.floor(Math.random() * 250)
    const delayMs = baseMs * (2 ** attempt) + jitterMs
    await new Promise(resolve => setTimeout(resolve, delayMs))
}

async function requestGemini(input: GeminiRequestInput): Promise<GeminiRequestResult> {
    const models = getConfiguredModels()
    let lastError: Error | null = null

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
        const model = models[modelIndex]
        const attempts = modelIndex === 0 ? 2 : 1

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const query = input.action === 'streamGenerateContent' ? '&alt=sse' : ''
            const url = `${GEMINI_API_BASE}/${input.apiVer}/models/${model}:${input.action}?key=${input.apiKey}${query}`

            let response: Response
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input.body),
                })
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Error de red al llamar a Gemini.')
                console.error(`[Gemini] ${input.action} network error model=${model} attempt=${attempt + 1}: ${lastError.message}`)
                if (attempt < attempts - 1) {
                    await waitBeforeRetry(attempt)
                }
                continue
            }

            if (response.ok) {
                console.log(`[Gemini] ${input.action} model=${model} attempt=${attempt + 1}`)
                return { response, model }
            }

            const errorBody = await response.text().catch(() => '')
            const error = createGeminiHttpError(response.status, errorBody)
            console.error(`[Gemini] ${input.action} HTTP ${response.status} model=${model} attempt=${attempt + 1}: ${error.message}`)

            if (!RETRYABLE_STATUSES.has(response.status)) {
                throw error
            }

            lastError = error
            if (attempt < attempts - 1) {
                await waitBeforeRetry(attempt)
            }
        }

        if (modelIndex < models.length - 1) {
            console.warn(`[Gemini] Switching from ${model} to fallback model ${models[modelIndex + 1]}`)
        }
    }

    throw lastError || new Error('No se pudo obtener respuesta de la API de IA.')
}

/** Call Gemini generateContent and return the first candidate text. */
export async function callGemini(
    prompt: string,
    options: GeminiCallOptions = {}
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no esta configurada en las variables de entorno.')
    }

    const apiVer = process.env.GEMINI_API_VER ?? DEFAULT_API_VER
    const generationConfig = buildGenerationConfig(options)
    const { response, model } = await requestGemini({
        apiKey,
        apiVer,
        action: 'generateContent',
        body: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
        },
    })

    const data = await response.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
        console.error(`[Gemini] Empty response from model=${model}`)
        throw new Error('La IA no devolvio contenido. Intentalo de nuevo.')
    }

    return text
}

/** Stream Gemini SSE responses as plain text chunks. */
export async function streamGemini(
    prompt: string,
    options: GeminiCallOptions = {}
): Promise<ReadableStream<string>> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no esta configurada en las variables de entorno.')
    }

    const apiVer = process.env.GEMINI_API_VER ?? DEFAULT_API_VER
    const generationConfig = buildGenerationConfig(options)
    const { response, model } = await requestGemini({
        apiKey,
        apiVer,
        action: 'streamGenerateContent',
        body: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
        },
    })

    if (!response.body) {
        throw new Error(`La IA no devolvio un stream de contenido (model=${model}).`)
    }

    const decoder = new TextDecoder()
    let buffer = ''

    return response.body.pipeThrough(new TransformStream<Uint8Array, string>({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.slice(5).trim()
                if (!payload || payload === '[DONE]') continue
                try {
                    const parsed = JSON.parse(payload)
                    const text: string | undefined = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
                    if (text) controller.enqueue(text)
                } catch {
                    // Ignore malformed SSE lines; incomplete data remains in the buffer.
                }
            }
        },
    }))
}
