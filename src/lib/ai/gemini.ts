/**
 * Centralized Gemini API client.
 *
 * To change model or API version, update the env vars — never touch this file:
 *   GEMINI_API_KEY   — required
 *   GEMINI_MODEL     — optional, defaults to gemini-2.0-flash
 *   GEMINI_API_VER   — optional, defaults to v1beta
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'
const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_API_VER = 'v1beta'

export interface GeminiCallOptions {
    temperature?: number
    maxOutputTokens?: number
    /** Only set if you are certain the model+version supports it. Defaults to omitted. */
    responseMimeType?: 'application/json' | 'text/plain'
    /**
     * For gemini-2.5-x thinking models, set to 0 to disable thinking tokens
     * and reserve the full output budget for visible content.
     * Useful for structured JSON generation where reasoning is not needed.
     */
    thinkingBudget?: number
}

/**
 * Call the Gemini generateContent endpoint with a single user prompt.
 * Returns the raw text from the first candidate.
 */
export async function callGemini(
    prompt: string,
    options: GeminiCallOptions = {}
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.')
    }

    const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
    const apiVer = process.env.GEMINI_API_VER ?? DEFAULT_API_VER
    const url = `${GEMINI_API_BASE}/${apiVer}/models/${model}:generateContent?key=${apiKey}`

    console.log(`[Gemini] model=${model} apiVer=${apiVer} endpoint=${GEMINI_API_BASE}/${apiVer}/models/${model}:generateContent`)

    const generationConfig: Record<string, unknown> = {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
    }
    // Only include responseMimeType when explicitly requested — not all models support it
    if (options.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType
    }
    // For gemini-2.5-x thinking models: control thinking token budget
    // thinkingBudget: 0 disables thinking entirely, freeing the full output budget for visible tokens
    if (options.thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget }
    }

    console.log(`[Gemini] generationConfig: maxOutputTokens=${generationConfig.maxOutputTokens} thinkingBudget=${(generationConfig.thinkingConfig as any)?.thinkingBudget ?? 'default'}`)

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const errorBody = await res.text()
        console.error(`[Gemini] HTTP ${res.status} — model=${model} apiVer=${apiVer}`)
        console.error(`[Gemini] Response body: ${errorBody}`)

        // Extract Gemini's own error message when available
        try {
            const parsed = JSON.parse(errorBody)
            const geminiMsg: string | undefined = parsed?.error?.message
            if (geminiMsg) {
                throw new Error(`Error de Gemini (${res.status}): ${geminiMsg}`)
            }
        } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.startsWith('Error de Gemini')) {
                throw parseErr
            }
        }

        throw new Error(`Error HTTP ${res.status} al llamar a la API de IA. Inténtalo de nuevo.`)
    }

    const data = await res.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
        console.error('[Gemini] Empty response:', JSON.stringify(data))
        throw new Error('La IA no devolvió contenido. Inténtalo de nuevo.')
    }

    return text
}
