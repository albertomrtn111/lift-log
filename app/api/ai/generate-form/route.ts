import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'

const RequestSchema = z.object({
    type: z.enum(['onboarding', 'checkin']),
    prompt: z.string().min(5).max(1200),
})

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
        required: z.boolean().default(false),
        helpText: z.string().max(240).nullish().default(null),
        min: z.number().nullable().optional(),
        max: z.number().nullable().optional(),
        step: z.number().nullable().optional(),
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
    formType: z.enum(['onboarding', 'checkin']),
    title: z.string().min(3).max(120),
    fields: z.array(GeneratedFieldSchema).min(4).max(20),
})

function buildFormPrompt(type: 'onboarding' | 'checkin', userPrompt: string): string {
    const typeLabel = type === 'onboarding' ? 'onboarding' : 'check-in'
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

function extractJson(rawText: string): string {
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()

    const objMatch = rawText.match(/(\{[\s\S]*\})/)
    if (objMatch) return objMatch[1].trim()

    return rawText.trim()
}

function parseAndValidate(rawText: string, expectedType: 'onboarding' | 'checkin') {
    const cleaned = extractJson(rawText)

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch {
        throw new Error('La IA devolvió un JSON inválido. Inténtalo de nuevo.')
    }

    const result = GeneratedFormSchema.safeParse(parsed)
    if (!result.success) {
        console.error('[AI generate-form] Validation error:', result.error.flatten())
        throw new Error('La IA devolvió un formulario con una estructura no válida. Inténtalo de nuevo.')
    }

    if (result.data.formType !== expectedType) {
        throw new Error('La IA devolvió un tipo de formulario distinto al solicitado. Inténtalo de nuevo.')
    }

    return result.data
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const input = RequestSchema.safeParse(body)

        if (!input.success) {
            return NextResponse.json(
                { error: 'Parámetros inválidos: se requiere "type" (onboarding|checkin) y "prompt".' },
                { status: 400 }
            )
        }

        const { type, prompt } = input.data
        const rawText = await callGemini(buildFormPrompt(type, prompt), {
            maxOutputTokens: 8192,
            thinkingBudget: 0,
        })
        const form = parseAndValidate(rawText, type)

        return NextResponse.json({ success: true, form })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando el formulario.'
        console.error('[AI generate-form]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
