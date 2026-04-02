import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'

// ============================================================================
// Request / Response Schemas (Zod)
// ============================================================================

const RequestSchema = z.object({
    type: z.enum(['strength', 'cardio']),
    prompt: z.string().min(5).max(600),
})

// Strength: mirrors CSV format (Dia, Ejercicio, Series, Reps, RIR, Rest, Notas)
const StrengthRowSchema = z.object({
    dia: z.string().min(1),
    ejercicio: z.string().min(1),
    series: z.number().int().min(1).max(10),
    reps: z.string().min(1),
    rir: z.string().default(''),
    rest: z.number().int().min(0).max(600),
    notas: z.string().default(''),
})

export const AIStrengthTemplateSchema = z.object({
    type: z.literal('strength'),
    name: z.string().min(1),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    rows: z.array(StrengthRowSchema).min(1),
})

// Cardio: mirrors CardioTemplateDialog form fields
export const AICardioTemplateSchema = z.object({
    type: z.literal('cardio'),
    name: z.string().min(1),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    trainingType: z.enum(['rodaje', 'series', 'tempo', 'hybrid', 'progressive', 'fartlek']),
    details: z.string().min(1),
    clientNotes: z.string().default(''),
})

export type AIStrengthTemplate = z.infer<typeof AIStrengthTemplateSchema>
export type AICardioTemplate = z.infer<typeof AICardioTemplateSchema>
export type AIGeneratedTemplate = AIStrengthTemplate | AICardioTemplate

// ============================================================================
// Prompt builders
// ============================================================================

function buildStrengthPrompt(userPrompt: string): string {
    return `Eres un entrenador personal experto en fuerza e hipertrofia. Genera una plantilla de entrenamiento de fuerza estructurada basándote en la solicitud del usuario.

Responde ÚNICAMENTE con JSON válido con esta estructura exacta (sin texto extra, sin bloques de código markdown):
{
  "type": "strength",
  "name": "Nombre descriptivo de la plantilla",
  "description": "Descripción breve del objetivo y enfoque",
  "tags": ["etiqueta1", "etiqueta2"],
  "rows": [
    {
      "dia": "Nombre del día (p.ej. 'Día 1 - Pecho y Tríceps', 'Lunes - Empuje')",
      "ejercicio": "Nombre del ejercicio en español",
      "series": 4,
      "reps": "8-10",
      "rir": "2",
      "rest": 90,
      "notas": "notas opcionales"
    }
  ]
}

Reglas estrictas:
- "series": entero entre 1 y 8
- "reps": string como "8-10", "5", "12-15", "6-8", "AMRAP"
- "rir": string como "2", "1-2", "0", o "" si no aplica
- "rest": entero en segundos (45 a 300)
- "notas": string, puede estar vacío ""
- "tags": máximo 4 etiquetas cortas en español
- Usa español para todos los textos
- Crea un programa realista y bien estructurado con la cantidad de días solicitada
- Organiza ejercicios de mayor a menor demanda neuromuscular dentro de cada día
- Incluye al menos 4 ejercicios por día

Solicitud del usuario: ${userPrompt}`
}

function buildCardioPrompt(userPrompt: string): string {
    return `Eres un entrenador de running y cardio experto. Genera una plantilla de entrenamiento cardiovascular estructurada basándote en la solicitud del usuario.

Responde ÚNICAMENTE con JSON válido con esta estructura exacta (sin texto extra, sin bloques de código markdown):
{
  "type": "cardio",
  "name": "Nombre descriptivo de la sesión",
  "description": "Descripción breve del objetivo",
  "tags": ["etiqueta1", "etiqueta2"],
  "trainingType": "rodaje",
  "details": "Descripción detallada del entrenamiento con calentamiento, bloques principales y vuelta a la calma",
  "clientNotes": "Notas adicionales para el atleta (opcional)"
}

Reglas estrictas:
- "trainingType": DEBE ser exactamente uno de: rodaje, series, tempo, hybrid, progressive, fartlek
- "details": descripción completa y estructurada (calentamiento → parte principal → enfriamiento). Incluye distancias, tiempos, ritmos o zonas de frecuencia cardíaca cuando sea relevante
- "tags": máximo 4 etiquetas cortas en español
- "clientNotes": consejos prácticos para el atleta (hidratación, calzado, etc.) o "" si no aplica
- Usa español para todos los textos

Tipos de sesión:
- rodaje: carrera continua a ritmo suave/moderado
- series: intervalos repetidos con recuperación
- tempo: carrera a ritmo umbral sostenido
- hybrid: combina rodaje + series u otros tipos
- progressive: ritmo que aumenta progresivamente
- fartlek: cambios de ritmo no estructurados

Solicitud del usuario: ${userPrompt}`
}

// ============================================================================
// Response parsing and validation
// ============================================================================

function extractJson(rawText: string): string {
    // 1. Strip ```json ... ``` or ``` ... ``` blocks
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()

    // 2. Find the first { ... } or [ ... ] block in the text (handles preamble/postamble)
    const objMatch = rawText.match(/(\{[\s\S]*\})/)
    if (objMatch) return objMatch[1].trim()

    // 3. Return as-is and let JSON.parse surface the error
    return rawText.trim()
}

function parseAndValidate(rawText: string, type: 'strength' | 'cardio'): AIGeneratedTemplate {
    console.log('[AI parse] raw length:', rawText.length)
    console.log('[AI parse] raw preview:', rawText.slice(0, 300))

    const cleaned = extractJson(rawText)

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch (e) {
        console.error('[AI parse] JSON.parse failed. cleaned text:', cleaned.slice(0, 500))
        throw new Error('La IA devolvió una respuesta con formato inválido. Inténtalo de nuevo.')
    }

    if (type === 'strength') {
        const result = AIStrengthTemplateSchema.safeParse(parsed)
        if (!result.success) {
            console.error('Validation error (strength):', result.error.flatten())
            throw new Error('La plantilla generada no tiene la estructura esperada. Inténtalo de nuevo.')
        }
        return result.data
    } else {
        const result = AICardioTemplateSchema.safeParse(parsed)
        if (!result.success) {
            console.error('Validation error (cardio):', result.error.flatten())
            throw new Error('La plantilla generada no tiene la estructura esperada. Inténtalo de nuevo.')
        }
        return result.data
    }
}

// ============================================================================
// Route handler
// ============================================================================

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const input = RequestSchema.safeParse(body)

        if (!input.success) {
            return NextResponse.json(
                { error: 'Parámetros inválidos: se requiere "type" (strength|cardio) y "prompt".' },
                { status: 400 }
            )
        }

        const { type, prompt } = input.data

        const fullPrompt = type === 'strength'
            ? buildStrengthPrompt(prompt)
            : buildCardioPrompt(prompt)

        const rawText = await callGemini(fullPrompt, {
            maxOutputTokens: 16384,
            thinkingBudget: 0,
        })
        const template = parseAndValidate(rawText, type)

        // Traceability hook — structure ready for future logging
        // TODO: persist { prompt, template, accepted: null, coachId } to ai_generations table
        return NextResponse.json({ success: true, template })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando la plantilla.'
        console.error('[AI generate-template]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
