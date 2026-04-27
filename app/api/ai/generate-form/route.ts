import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'

const RequestSchema = z.object({
    type: z.enum(['onboarding', 'checkin']),
    prompt: z.string().min(5).max(1200),
})

// Coerce a value that might be a number, a numeric string, null or undefined → number | null
function coerceNullableNum(v: unknown): number | null | undefined {
    if (v === null || v === undefined) return v as null | undefined
    if (typeof v === 'number') return isNaN(v) ? null : v
    if (typeof v === 'string') {
        const n = parseFloat(v)
        return isNaN(n) ? null : n
    }
    return null
}

const GeneratedFieldSchema = z
    .object({
        label: z.string().min(3).max(220),
        type: z.enum([
            'short_text',
            'long_text',
            'number',
            'scale',
            'single_choice',
            'multi_choice',
            'date',
        ]),
        // Gemini may return required as boolean or as string "true"/"false"
        required: z.preprocess(
            (v) => (typeof v === 'string' ? v === 'true' || v === '1' : Boolean(v)),
            z.boolean()
        ).default(false),
        // Empty string is normalised to null
        helpText: z.preprocess(
            (v) => (v === '' || v === undefined ? null : v),
            z.string().max(240).nullable()
        ).default(null),
        // min / max / step may arrive as numeric strings
        min: z.preprocess(coerceNullableNum, z.number().nullable().optional()),
        max: z.preprocess(coerceNullableNum, z.number().nullable().optional()),
        step: z.preprocess(coerceNullableNum, z.number().nullable().optional()),
        options: z.array(z.string().min(1).max(80)).max(8).optional(),
    })
    .superRefine((field, ctx) => {
        if ((field.type === 'single_choice' || field.type === 'multi_choice') && (field.options?.length ?? 0) < 2) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Los campos de selección deben incluir al menos 2 opciones.',
                path: ['options'],
            })
        }

        if (field.type === 'scale') {
            const min = field.min ?? 1
            const max = field.max ?? 5
            const step = field.step ?? 1

            if (min >= max) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Las escalas deben tener un mínimo menor que el máximo.',
                    path: ['min'],
                })
            }

            if (step <= 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Las escalas deben tener un paso mayor que 0.',
                    path: ['step'],
                })
            }
        }

        if (field.type === 'number' && field.min != null && field.max != null && field.min > field.max) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Los campos numéricos no pueden tener min mayor que max.',
                path: ['min'],
            })
        }
    })

const GeneratedFormSchema = z.object({
    // Tolerate minor case/spacing variations from the model
    formType: z.preprocess(
        (v) => (typeof v === 'string' ? v.toLowerCase().trim().replace(/[^a-z]/g, '') : v),
        z.enum(['onboarding', 'checkin'])
    ),
    title: z.string().min(3).max(120),
    fields: z.array(GeneratedFieldSchema).min(3).max(20),
})

function buildFormPrompt(type: 'onboarding' | 'checkin', userPrompt: string): string {
    const typeLabel = type === 'onboarding' ? 'onboarding' : 'revisión'
    const defaultTopics = type === 'onboarding'
        ? [
            'objetivos',
            'experiencia previa',
            'lesiones o limitaciones',
            'disponibilidad semanal',
            'hábitos de sueño',
            'alimentación o contexto nutricional',
        ]
        : [
            'adherencia al plan',
            'energía y recuperación',
            'sueño y estrés',
            'rendimiento',
            'peso u otras métricas relevantes',
            'sensaciones generales',
        ]

    return `Eres un coach experto en entrenamiento y nutrición. Debes crear la estructura de un formulario ${typeLabel} para una app de coaching.

Responde SOLO con JSON válido, sin texto adicional, sin markdown y sin bloques de código.

Estructura exacta:
{
  "formType": "${type}",
  "title": "Título breve y claro del formulario",
  "fields": [
    {
      "label": "Pregunta visible para el cliente",
      "type": "short_text | long_text | number | scale | single_choice | multi_choice | date",
      "required": true,
      "helpText": "Texto corto opcional para aclarar la pregunta o null",
      "min": null,
      "max": null,
      "step": null,
      "options": ["Solo si el tipo es single_choice o multi_choice"]
    }
  ]
}

Reglas estrictas:
- Usa español en todos los textos.
- NO generes un campo de fotos de progreso. La aplicación lo añade automáticamente al final y no se puede editar.
- Crea solo preguntas útiles y no duplicadas.
- Si el usuario no especifica suficientes detalles, completa el formulario con criterio profesional.
- Para ${typeLabel}, prioriza estas áreas cuando aporten valor: ${defaultTopics.join(', ')}.
- Usa "short_text" para respuestas cortas, "long_text" para respuestas desarrolladas, "number" para datos numéricos, "scale" para valoraciones, "single_choice" para una sola opción, "multi_choice" para varias opciones y "date" para fechas.
- Para "single_choice" y "multi_choice" incluye entre 2 y 6 opciones claras.
- Para "scale" define min, max y step. Usa escalas simples como 1-5 o 1-10.
- Para "number" puedes incluir min, max y step solo si ayudan.
- "helpText" debe ser breve y puede ser null.
- El título debe sonar natural para un coach y un cliente.
- Genera un formulario realista: normalmente entre 6 y 12 preguntas, salvo que la petición del usuario justifique otra cantidad.

Solicitud del usuario: ${userPrompt}`
}

/**
 * Extract the first valid JSON object from a raw string.
 * Strategy: find the first '{', then walk forward counting braces to find the
 * matching closing '}'. This is more reliable than greedy regex when there is
 * trailing text after the JSON.
 */
function extractJson(rawText: string): string {
    // 1. Try fenced code block first (```json ... ``` or ``` ... ```)
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()

    // 2. Walk the string to find the outermost balanced JSON object
    const start = rawText.indexOf('{')
    if (start !== -1) {
        let depth = 0
        let inString = false
        let escape = false
        for (let i = start; i < rawText.length; i++) {
            const ch = rawText[i]
            if (escape) { escape = false; continue }
            if (ch === '\\' && inString) { escape = true; continue }
            if (ch === '"') { inString = !inString; continue }
            if (inString) continue
            if (ch === '{') depth++
            else if (ch === '}') {
                depth--
                if (depth === 0) return rawText.slice(start, i + 1).trim()
            }
        }
    }

    return rawText.trim()
}

function parseAndValidate(rawText: string, expectedType: 'onboarding' | 'checkin') {
    // Always log the raw response to make debugging easier
    console.log('[AI generate-form] Raw response length:', rawText.length)
    console.log('[AI generate-form] Raw response (first 600 chars):', rawText.slice(0, 600))

    const cleaned = extractJson(rawText)

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch (jsonErr) {
        console.error('[AI generate-form] JSON.parse failed')
        console.error('[AI generate-form] Cleaned string (first 400 chars):', cleaned.slice(0, 400))
        throw new Error('La IA devolvió un JSON malformado. Inténtalo de nuevo.')
    }

    const result = GeneratedFormSchema.safeParse(parsed)
    if (!result.success) {
        const flat = result.error.flatten()
        console.error('[AI generate-form] Validation failed — field errors:', JSON.stringify(flat.fieldErrors, null, 2))
        console.error('[AI generate-form] Validation failed — form errors:', flat.formErrors)
        console.error('[AI generate-form] Parsed top-level keys:', Object.keys((parsed as Record<string, unknown>) ?? {}))

        // Surface a specific, actionable error when possible
        const parsedObj = parsed as Record<string, unknown> | null
        const fieldCount = Array.isArray(parsedObj?.fields) ? (parsedObj!.fields as unknown[]).length : 0
        if (fieldCount < 3) {
            throw new Error(`La IA generó muy pocas preguntas (${fieldCount}). Describe mejor el formulario e inténtalo de nuevo.`)
        }
        if (flat.fieldErrors.formType) {
            throw new Error(`La IA devolvió un tipo de formulario no reconocido: "${parsedObj?.formType}".`)
        }
        if (flat.fieldErrors.fields) {
            throw new Error('Alguna pregunta generada tiene un formato incorrecto. Inténtalo de nuevo.')
        }
        throw new Error('La IA devolvió una estructura de formulario incompleta. Inténtalo de nuevo.')
    }

    if (result.data.formType !== expectedType) {
        throw new Error(`La IA devolvió tipo "${result.data.formType}" pero se esperaba "${expectedType}". Inténtalo de nuevo.`)
    }

    return result.data
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const coachId = user ? await getCoachIdForUser(user.id) : null
        const coachContext = await getCoachAIProfileContext(coachId)

        const body = await req.json()
        const input = RequestSchema.safeParse(body)

        if (!input.success) {
            return NextResponse.json(
                { error: 'Parámetros inválidos: se requiere "type" (onboarding|checkin) y "prompt".' },
                { status: 400 }
            )
        }

        const { type, prompt } = input.data
        const rawText = await callGemini(coachContext + buildFormPrompt(type, prompt), {
            maxOutputTokens: 8192,
            thinkingBudget: 0,
            responseMimeType: 'application/json',
        })
        const form = parseAndValidate(rawText, type)

        return NextResponse.json({ success: true, form })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando el formulario.'
        console.error('[AI generate-form]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
