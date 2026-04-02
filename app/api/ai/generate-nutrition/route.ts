import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'

// ============================================================================
// Request Schema
// ============================================================================

const WeightEntrySchema = z.object({
    date: z.string(),
    weight_kg: z.number(),
})

const MacroPlanContextSchema = z.object({
    kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    steps: z.number().nullable().optional(),
    notes: z.string().optional(),
    day_type_config: z.object({
        training: z.object({ kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() }),
        rest: z.object({ kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() }),
    }).nullable().optional(),
}).nullable()

const RequestSchema = z.object({
    type: z.enum(['macros', 'options_diet']),
    objective: z.string().min(2).max(200),
    prompt: z.string().min(5).max(800),
    context: z.object({
        weightHistory: z.array(WeightEntrySchema).default([]),
        activeMacroPlan: MacroPlanContextSchema.optional(),
        activeDietPlanText: z.string().nullable().optional(),
    }),
})

// ============================================================================
// Output Schemas (Zod)
// ============================================================================

export const AIMacrosProposalSchema = z.object({
    type: z.literal('macros'),
    kcal: z.number().int().min(800).max(8000),
    protein_g: z.number().int().min(50).max(600),
    carbs_g: z.number().int().min(0).max(1000),
    fat_g: z.number().int().min(20).max(500),
    steps: z.number().int().min(0).max(50000).nullable().optional(),
    notes: z.string().default(''),
    explanation: z.string().min(1),
})

const DietItemSchema = z.object({
    item_type: z.enum(['food', 'free_text']),
    name: z.string().min(1),
    quantity_value: z.number().nullable().optional(),
    quantity_unit: z.string().nullable().optional(),
    notes: z.string().default(''),
    order_index: z.number().int(),
})

const DietOptionSchema = z.object({
    name: z.string().min(1),
    order_index: z.number().int(),
    notes: z.string().default(''),
    items: z.array(DietItemSchema).min(1),
})

const DietMealSchema = z.object({
    day_type: z.enum(['default', 'training', 'rest']),
    name: z.string().min(1),
    order_index: z.number().int(),
    options: z.array(DietOptionSchema).min(1),
})

export const AIDietProposalSchema = z.object({
    type: z.literal('options_diet'),
    name: z.string().min(1),
    meals: z.array(DietMealSchema).min(1),
    explanation: z.string().min(1),
})

export type AIMacrosProposal = z.infer<typeof AIMacrosProposalSchema>
export type AIDietProposal = z.infer<typeof AIDietProposalSchema>
export type AINutritionProposal = AIMacrosProposal | AIDietProposal

// ============================================================================
// Context → text helpers
// ============================================================================

function buildWeightSummary(history: { date: string; weight_kg: number }[]): string {
    if (history.length === 0) return 'Sin datos de peso disponibles.'

    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const diff = last.weight_kg - first.weight_kg
    const trend = diff > 0.3 ? '↑ subiendo' : diff < -0.3 ? '↓ bajando' : '→ estable'

    const lines = [
        `Peso más reciente: ${last.weight_kg} kg (${last.date})`,
        `Tendencia (${sorted.length} registros): ${trend} (${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg)`,
        `Historial: ${sorted.map(e => `${e.date}: ${e.weight_kg}kg`).join(', ')}`,
    ]
    return lines.join('\n')
}

function buildCurrentMacrosSummary(plan: z.infer<typeof MacroPlanContextSchema>): string {
    if (!plan) return 'Sin plan de macros activo.'

    if (plan.day_type_config) {
        const { training: t, rest: r } = plan.day_type_config
        return [
            `Plan de macros actual (diferenciado por día):`,
            `  Día entreno: ${t.kcal} kcal | P: ${t.protein_g}g | C: ${t.carbs_g}g | G: ${t.fat_g}g`,
            `  Día descanso: ${r.kcal} kcal | P: ${r.protein_g}g | C: ${r.carbs_g}g | G: ${r.fat_g}g`,
            plan.steps ? `  Pasos: ${plan.steps}` : '',
            plan.notes ? `  Notas: ${plan.notes}` : '',
        ].filter(Boolean).join('\n')
    }

    return [
        `Plan de macros actual:`,
        `  ${plan.kcal} kcal | Proteína: ${plan.protein_g}g | Carbohidratos: ${plan.carbs_g}g | Grasas: ${plan.fat_g}g`,
        plan.steps ? `  Pasos: ${plan.steps}` : '',
        plan.notes ? `  Notas: ${plan.notes}` : '',
    ].filter(Boolean).join('\n')
}

// ============================================================================
// Prompt builders
// ============================================================================

function buildMacrosPrompt(
    objective: string,
    userPrompt: string,
    weightSummary: string,
    currentMacros: string,
): string {
    return `Eres un nutricionista deportivo experto. Genera una propuesta de macros nutricionales para un atleta basándote en el contexto real y las indicaciones del entrenador.

## Contexto del atleta

### Evolución del peso
${weightSummary}

### Plan de macros actual
${currentMacros}

## Indicaciones del entrenador

### Objetivo nutricional
${objective}

### Instrucciones adicionales
${userPrompt}

## Tu tarea

Genera una propuesta de macros ajustada al contexto y objetivo.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin markdown):
{
  "type": "macros",
  "kcal": 2200,
  "protein_g": 160,
  "carbs_g": 240,
  "fat_g": 70,
  "steps": 8000,
  "notes": "Notas breves para el atleta (opcional, puede ser vacío)",
  "explanation": "Explicación clara de por qué propones estos valores y qué cambias respecto al plan actual. Máximo 3 frases."
}

Reglas:
- "kcal": entero entre 800 y 8000
- "protein_g": entero, mínimo 50
- "carbs_g": entero, mínimo 0
- "fat_g": entero, mínimo 20
- "steps": entero o null
- "notes": string (puede ser vacío "")
- "explanation": obligatorio, en español, referenciando la evolución del peso si es relevante
- Usa español para todos los textos`
}

function buildDietPrompt(
    objective: string,
    userPrompt: string,
    weightSummary: string,
    currentMacros: string,
    currentDietText: string | null | undefined,
): string {
    const dietContext = currentDietText
        ? `### Dieta por opciones actual\n${currentDietText}`
        : '### Dieta por opciones actual\nNo existe dieta por opciones configurada. Crea una desde cero.'

    return `Eres un nutricionista deportivo experto. Genera una dieta por opciones estructurada para un atleta basándote en el contexto real y las indicaciones del entrenador.

## Contexto del atleta

### Evolución del peso
${weightSummary}

### Plan de macros de referencia
${currentMacros}

${dietContext}

## Indicaciones del entrenador

### Objetivo nutricional
${objective}

### Instrucciones adicionales
${userPrompt}

## Tu tarea

Genera una dieta por opciones completa, estructurada en comidas del día.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin markdown):
{
  "type": "options_diet",
  "name": "Nombre descriptivo de la dieta",
  "meals": [
    {
      "day_type": "default",
      "name": "Desayuno",
      "order_index": 1,
      "options": [
        {
          "name": "Opción A",
          "order_index": 1,
          "notes": "",
          "items": [
            { "item_type": "food", "name": "Huevos revueltos", "quantity_value": 3, "quantity_unit": "uds", "notes": "", "order_index": 1 },
            { "item_type": "food", "name": "Tostadas integrales", "quantity_value": 2, "quantity_unit": "rbn", "notes": "", "order_index": 2 }
          ]
        },
        {
          "name": "Opción B",
          "order_index": 2,
          "notes": "",
          "items": [
            { "item_type": "food", "name": "Yogur griego", "quantity_value": 200, "quantity_unit": "g", "notes": "", "order_index": 1 }
          ]
        }
      ]
    }
  ],
  "explanation": "Resumen del razonamiento nutricional. 2-3 frases."
}

Reglas estrictas:
- "day_type": solo puede ser "default", "training" o "rest". Usa "default" para el día estándar
- Genera al menos 4-5 comidas principales (desayuno, media mañana, almuerzo, merienda, cena)
- Cada comida debe tener al menos 2 opciones (Opción A y Opción B) para dar variedad
- "item_type": usa "food" para alimentos concretos, "free_text" para reglas o explicaciones libres
- "quantity_value": número (puede ser null si no aplica)
- "quantity_unit": "g", "ml", "uds", "rbn" (rebanadas), "cdas" (cucharadas), etc.
- Usa español para todos los textos
- La dieta debe ser coherente con el objetivo nutricional indicado`
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

function parseAndValidate(rawText: string, type: 'macros' | 'options_diet'): AINutritionProposal {
    console.log('[AI nutrition parse] raw length:', rawText.length)
    console.log('[AI nutrition parse] preview:', rawText.slice(0, 200))

    const cleaned = extractJson(rawText)

    let parsed: unknown
    try {
        parsed = JSON.parse(cleaned)
    } catch {
        console.error('[AI nutrition parse] JSON.parse failed:', cleaned.slice(0, 400))
        throw new Error('La IA devolvió una respuesta con formato inválido. Inténtalo de nuevo.')
    }

    if (type === 'macros') {
        const result = AIMacrosProposalSchema.safeParse(parsed)
        if (!result.success) {
            console.error('[AI nutrition parse] Macros validation error:', result.error.flatten())
            throw new Error('La propuesta de macros no tiene la estructura esperada. Inténtalo de nuevo.')
        }
        return result.data
    } else {
        const result = AIDietProposalSchema.safeParse(parsed)
        if (!result.success) {
            console.error('[AI nutrition parse] Diet validation error:', result.error.flatten())
            throw new Error('La propuesta de dieta no tiene la estructura esperada. Inténtalo de nuevo.')
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
                { error: 'Parámetros inválidos: ' + JSON.stringify(input.error.flatten().fieldErrors) },
                { status: 400 }
            )
        }

        const { type, objective, prompt, context } = input.data

        const weightSummary = buildWeightSummary(context.weightHistory)
        const macrosSummary = buildCurrentMacrosSummary(context.activeMacroPlan ?? null)

        const fullPrompt = type === 'macros'
            ? buildMacrosPrompt(objective, prompt, weightSummary, macrosSummary)
            : buildDietPrompt(objective, prompt, weightSummary, macrosSummary, context.activeDietPlanText)

        const rawText = await callGemini(fullPrompt, {
            maxOutputTokens: 16384,
            thinkingBudget: 0,   // disable thinking tokens — reserved for JSON formatting tasks
        })
        const proposal = parseAndValidate(rawText, type)

        // TODO: persist { objective, prompt, proposal, accepted: null, coachId, clientId } to ai_generations table
        return NextResponse.json({ success: true, proposal })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando la propuesta nutricional.'
        console.error('[AI generate-nutrition]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
