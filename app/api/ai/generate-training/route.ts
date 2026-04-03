import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import type { AITrainingProposal } from '@/types/ai-training'

// ============================================================================
// Request Schema
// ============================================================================

const ExistingExerciseSchema = z.object({
    dayName: z.string(),
    exerciseName: z.string(),
    sets: z.number().nullable().optional(),
    reps: z.string().nullable().optional(),
    rir: z.string().nullable().optional(),
    restSeconds: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
})

const RequestSchema = z.object({
    mode: z.enum(['generate', 'modify']),
    prompt: z.string().min(5).max(800),
    existingProgram: z.object({
        name: z.string(),
        weeks: z.number(),
        exercises: z.array(ExistingExerciseSchema),
    }).nullable().optional(),
})

// ============================================================================
// Output Schema
// ============================================================================

const AIExerciseSchema = z.object({
    exercise_name: z.string().min(1),
    sets: z.number().int().min(1).max(10),
    reps: z.string().min(1),
    rir: z.string().default(''),
    rest_seconds: z.number().int().min(0).max(600),
    notes: z.string().default(''),
})

const AIDaySchema = z.object({
    name: z.string().min(1),
    exercises: z.array(AIExerciseSchema).min(1),
})

const AITrainingProposalSchema = z.object({
    name: z.string().min(1),
    weeks: z.number().int().min(1).max(52),
    days: z.array(AIDaySchema).min(1),
    explanation: z.string().min(1),
    changes: z.array(z.string()).default([]),  // list of change descriptions (used in modify mode)
})

// ============================================================================
// Prompt builders
// ============================================================================

function buildGeneratePrompt(userPrompt: string): string {
    return `Eres un entrenador personal experto en fuerza e hipertrofia. Genera un programa de entrenamiento personalizado para un atleta basándote en las instrucciones del entrenador.

## Instrucciones del entrenador
${userPrompt}

## Tu tarea

Genera un programa de entrenamiento estructurado completo.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin bloques markdown):
{
  "name": "Nombre descriptivo del programa",
  "weeks": 4,
  "days": [
    {
      "name": "Día 1 - Pecho y Tríceps",
      "exercises": [
        {
          "exercise_name": "Press Banca",
          "sets": 4,
          "reps": "6-8",
          "rir": "2",
          "rest_seconds": 120,
          "notes": ""
        }
      ]
    }
  ],
  "explanation": "Explicación breve del programa: enfoque, distribución y razonamiento. Máximo 3 frases.",
  "changes": []
}

Reglas estrictas:
- "weeks": entero entre 1 y 52
- "sets": entero entre 1 y 8
- "reps": string como "6-8", "10-12", "5", "AMRAP"
- "rir": string como "2", "1-2", "0", o "" si no aplica
- "rest_seconds": entero en segundos (45 a 300)
- "notes": string, puede ser vacío ""
- "changes": array vacío [] para generación nueva
- Organiza ejercicios de mayor a menor demanda neuromuscular dentro de cada día
- Incluye al menos 4 ejercicios por día
- Usa español para todos los textos`
}

function buildModifyPrompt(userPrompt: string, existing: NonNullable<z.infer<typeof RequestSchema>['existingProgram']>): string {
    // Serialize existing program as readable text
    const dayMap = new Map<string, typeof existing.exercises>()
    for (const ex of existing.exercises) {
        const list = dayMap.get(ex.dayName) ?? []
        list.push(ex)
        dayMap.set(ex.dayName, list)
    }

    const programText = Array.from(dayMap.entries()).map(([dayName, exs]) => {
        const exerciseLines = exs.map(e =>
            `    - ${e.exerciseName}: ${e.sets ?? '?'} series × ${e.reps ?? '?'} reps | RIR ${e.rir ?? '-'} | Descanso ${e.restSeconds ?? '?'}s${e.notes ? ` | Notas: ${e.notes}` : ''}`
        ).join('\n')
        return `  ${dayName}:\n${exerciseLines}`
    }).join('\n\n')

    return `Eres un entrenador personal experto en fuerza e hipertrofia. Modifica el programa de entrenamiento existente de un atleta según las instrucciones del entrenador.

## Programa actual: "${existing.name}" (${existing.weeks} semanas)

${programText}

## Instrucciones del entrenador
${userPrompt}

## Tu tarea

Devuelve el programa COMPLETO modificado según las instrucciones. Mantén todo lo que no haya que cambiar. Si se solicita añadir ejercicios, añádelos en la posición lógica. Si se solicita eliminar o sustituir, hazlo.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin bloques markdown):
{
  "name": "Nombre del programa (puede ser el mismo o uno nuevo)",
  "weeks": 4,
  "days": [
    {
      "name": "Día 1 - Pecho y Tríceps",
      "exercises": [
        {
          "exercise_name": "Press Banca",
          "sets": 4,
          "reps": "6-8",
          "rir": "2",
          "rest_seconds": 120,
          "notes": ""
        }
      ]
    }
  ],
  "explanation": "Resumen de los cambios realizados y por qué. Máximo 3 frases.",
  "changes": [
    "Añadido Curl de Bíceps en Día 2 tras solicitud de más trabajo de bíceps",
    "Aumentadas las series de Press Banca de 3 a 4"
  ]
}

Reglas estrictas:
- Devuelve el programa COMPLETO, no solo los cambios
- "changes": lista de strings describiendo cada cambio realizado (qué cambió y por qué). Imprescindible para que el entrenador pueda revisar las diferencias.
- Si no hay cambios en un día, inclúyelo igualmente sin modificaciones
- Usa español para todos los textos`
}

// ============================================================================
// Parse + validate
// ============================================================================

function extractJson(rawText: string): string {
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()
    const objMatch = rawText.match(/(\{[\s\S]*\})/)
    if (objMatch) return objMatch[1].trim()
    return rawText.trim()
}

function parseAndValidate(rawText: string): AITrainingProposal {
    console.log('[AI training parse] raw length:', rawText.length)
    console.log('[AI training parse] preview:', rawText.slice(0, 200))

    const cleaned = extractJson(rawText)

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch {
        console.error('[AI training parse] JSON.parse failed:', cleaned.slice(0, 400))
        throw new Error('La IA devolvió una respuesta con formato inválido. Inténtalo de nuevo.')
    }

    const result = AITrainingProposalSchema.safeParse(parsed)
    if (!result.success) {
        console.error('[AI training parse] Validation error:', result.error.flatten())
        throw new Error('El programa generado no tiene la estructura esperada. Inténtalo de nuevo.')
    }
    return result.data
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
                { error: 'Parámetros inválidos: ' + JSON.stringify(input.error.flatten().fieldErrors) },
                { status: 400 }
            )
        }

        const { mode, prompt, existingProgram } = input.data

        const fullPrompt = mode === 'modify' && existingProgram
            ? buildModifyPrompt(prompt, existingProgram)
            : buildGeneratePrompt(prompt)

        const rawText = await callGemini(fullPrompt, {
            maxOutputTokens: 16384,
            thinkingBudget: 0,
        })

        const proposal = parseAndValidate(rawText)

        // TODO: persist { mode, prompt, proposal, accepted: null, coachId, clientId } to ai_generations table
        return NextResponse.json({ success: true, proposal })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando el programa.'
        console.error('[AI generate-training]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
