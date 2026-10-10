import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import { requireAICoach, requireAIClient } from '@/lib/ai/access'
import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'
import { getAthleteProfileContextForCoach } from '@/lib/ai/athlete-profile-context'
import type { AIMacrosProposal, AIDietProposal, AINutritionProposal } from '@/types/ai-nutrition'
import { buildDietFromAI, buildFoodCatalogPrompt, type AIDietRawMeal, type DailyTargets } from '@/lib/nutrition/ai-diet-builder'
import type { DietFoodRef } from '@/data/nutrition/types'

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
    clientId: z.string().uuid(),
    type: z.enum(['macros', 'options_diet']),
    mode: z.enum(['generate', 'modify']),
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

const AIMacrosProposalSchema = z.object({
    type: z.literal('macros'),
    mode: z.enum(['generate', 'modify']),
    kcal: z.number().int().min(800).max(8000),
    protein_g: z.number().int().min(50).max(600),
    carbs_g: z.number().int().min(0).max(1000),
    fat_g: z.number().int().min(20).max(500),
    steps: z.number().int().min(0).max(50000).nullable().optional(),
    notes: z.string().default(''),
    explanation: z.string().min(1),
    change_summary: z.array(z.string().min(1)).max(6).default([]),
})

// La IA referencia alimentos de la base de datos por código ("F12") y propone
// gramos orientativos; el cuadre final lo hace ai-diet-builder.
const DietItemSchema = z.object({
    food: z.string().nullable(),
    name: z.string().min(1),
    grams: z.number().nullable().optional(),
    free_quantity: z.string().nullable().optional(),
    alt_group: z.number().int().nullable().optional(),
    notes: z.string().default(''),
})

const DietOptionSchema = z.object({
    name: z.string().min(1),
    notes: z.string().default(''),
    items: z.array(DietItemSchema).min(1),
})

const MealTargetSchema = z.object({
    kcal: z.number().nullable().optional(),
    protein_g: z.number().nullable().optional(),
    carbs_g: z.number().nullable().optional(),
    fat_g: z.number().nullable().optional(),
}).nullable().optional()

const DietMealSchema = z.object({
    day_type: z.enum(['default', 'training', 'rest']),
    name: z.string().min(1),
    target: MealTargetSchema,
    options: z.array(DietOptionSchema).min(1),
})

const AIDietRawProposalSchema = z.object({
    type: z.literal('options_diet'),
    mode: z.enum(['generate', 'modify']),
    name: z.string().min(1),
    meals: z.array(DietMealSchema).min(1),
    explanation: z.string().min(1),
    change_summary: z.array(z.string().min(1)).max(8).default([]),
    structure_strategy: z.enum(['maintain', 'adjust', 'rebuild']),
})

type AIDietRawProposal = z.infer<typeof AIDietRawProposalSchema>

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
    mode: 'generate' | 'modify',
    objective: string,
    userPrompt: string,
    weightSummary: string,
    currentMacros: string,
    athleteContext: string,
): string {
    const modeInstruction = mode === 'modify'
        ? `Estás en modo MODIFICAR. Existe una configuración actual y debes AJUSTARLA, no rehacerla desde cero salvo que el contexto lo obligue claramente.

Prioridades:
- Parte de los macros actuales como base
- Haz cambios proporcionales y justificados
- Si el entrenador pide un cambio pequeño, mantenlo pequeño
- Explica qué cambias respecto a lo actual`
        : `Estás en modo GENERAR. Debes proponer una nueva configuración de macros coherente con el contexto del atleta, aunque puedes usar el plan actual como referencia si existe.`

    return `Eres un nutricionista deportivo experto. Genera una propuesta de macros nutricionales para un atleta basándote en el contexto real y las indicaciones del entrenador.

## Contexto del atleta

### Perfil del atleta
${athleteContext}

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

${modeInstruction}

Genera una propuesta de macros ajustada al contexto y objetivo.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin markdown):
{
  "type": "macros",
  "mode": "${mode}",
  "kcal": 2200,
  "protein_g": 160,
  "carbs_g": 240,
  "fat_g": 70,
  "steps": 8000,
  "notes": "Notas breves para el atleta (opcional, puede ser vacío)",
  "explanation": "Explicación clara de por qué propones estos valores y qué cambias respecto al plan actual. Máximo 3 frases.",
  "change_summary": ["Bajo 150 kcal", "Mantengo proteína alta", "Recorto carbohidratos de forma moderada"]
}

Reglas:
- "mode" debe ser "${mode}"
- "kcal": entero entre 800 y 8000
- "protein_g": entero, mínimo 50
- "carbs_g": entero, mínimo 0
- "fat_g": entero, mínimo 20
- "steps": entero o null
- "notes": string (puede ser vacío "")
- "explanation": obligatorio, en español, referenciando la evolución del peso si es relevante
- "change_summary": array breve de 2-5 cambios concretos. En modo modify debe comparar claramente con lo actual
- Usa español para todos los textos`
}

function buildDietPrompt(
    mode: 'generate' | 'modify',
    objective: string,
    userPrompt: string,
    weightSummary: string,
    currentMacros: string,
    currentDietText: string | null | undefined,
    athleteContext: string,
    foodCatalog: string,
): string {
    const dietContext = currentDietText
        ? `### Dieta por opciones actual\n${currentDietText}`
        : '### Dieta por opciones actual\nNo existe dieta por opciones configurada. Crea una desde cero.'

    const modeInstruction = mode === 'modify'
        ? `Estás en modo MODIFICAR. Debes ajustar la dieta actual usando su estructura como base siempre que tenga sentido.

Prioridades:
- Mantén la estructura actual si el entrenador no pide rehacerla
- Aclara qué bloques/comidas mantienes y cuáles ajustas
- Si haces cambios parciales, deben ser realmente parciales
- Solo usa "rebuild" si el cambio necesita rehacer la dieta`
        : `Estás en modo GENERAR. Debes crear una dieta por opciones coherente con el objetivo y el contexto del atleta.`

    return `Eres un nutricionista deportivo experto. Genera una dieta por opciones estructurada para un atleta basándote en el contexto real y las indicaciones del entrenador.

## Contexto del atleta

### Perfil del atleta
${athleteContext}

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

${modeInstruction}

Genera una dieta por opciones completa, estructurada en comidas del día, construida con alimentos de la BASE DE ALIMENTOS de abajo.

## Base de alimentos (código | nombre | grupo | macros)
Los macros son por 100 g del alimento tal como está descrito (p. ej. "Arroz blanco seco" es en crudo/seco; "Arroz cocido" ya cocido).
${foodCatalog}

## Cómo construir la dieta
1. Reparte el plan de macros diario entre las comidas: pon en cada comida un "target" (kcal, protein_g, carbs_g, fat_g). La suma de las comidas debe ser el plan diario. Si no hay plan de macros, propón tú unos objetivos coherentes con el objetivo del entrenador.
2. Cada opción de una comida debe aportar aproximadamente el "target" de esa comida. Elige combinaciones realistas (fuente de proteína + hidrato + grasa/verdura) y gramos orientativos: el sistema afinará los gramos exactos después, así que prioriza buenas combinaciones de alimentos.
3. Todo alimento que aporte macros DEBE usar un código de la base ("food": "F12"). No inventes códigos. Usa "food": null solo para cosas sin macros relevantes (verdura libre, café, infusiones, especias) y pon la cantidad en "free_quantity" (p. ej. "libre", "1 taza").
4. "grams": gramos del alimento tal como está en la base (para alimentos por unidad, gramos totales: 2 huevos = 120).
5. Alternativas: si en una opción un alimento puede cambiarse por otro (arroz o pasta o patata), ponlos seguidos con el mismo "alt_group" (1, 2…). El primero es el de referencia; el sistema calcula los gramos equivalentes del resto. No sumes alternativas como si se comieran juntas.

Responde ÚNICAMENTE con JSON válido (sin texto extra, sin markdown):
{
  "type": "options_diet",
  "mode": "${mode}",
  "name": "Nombre descriptivo de la dieta",
  "structure_strategy": "adjust",
  "change_summary": ["Mantengo desayuno y cena", "Bajo hidratos en la comida", "Refuerzo proteína en la merienda"],
  "meals": [
    {
      "day_type": "default",
      "name": "Comida",
      "target": { "kcal": 700, "protein_g": 45, "carbs_g": 85, "fat_g": 18 },
      "options": [
        {
          "name": "Opción 1",
          "notes": "",
          "items": [
            { "food": "F31", "name": "Arroz blanco seco", "grams": 90, "alt_group": 1, "notes": "" },
            { "food": "F35", "name": "Pasta seca", "grams": 90, "alt_group": 1, "notes": "" },
            { "food": "F7", "name": "Pollo pechuga", "grams": 150, "notes": "" },
            { "food": "F64", "name": "Aceite de oliva", "grams": 10, "notes": "" },
            { "food": null, "name": "Verdura", "free_quantity": "libre", "notes": "" }
          ]
        }
      ]
    }
  ],
  "explanation": "Resumen del razonamiento nutricional. 2-3 frases."
}

Reglas estrictas:
- "mode" debe ser "${mode}"
- "structure_strategy" solo puede ser "maintain", "adjust" o "rebuild"
- "day_type": solo "default", "training" o "rest". Usa "default" para el día estándar (y "training"/"rest" solo si el plan de macros distingue tipos de día)
- Genera las comidas habituales (desayuno, media mañana, comida, merienda, cena) salvo que el entrenador indique otra estructura
- Cada comida debe tener al menos 2 opciones para dar variedad
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

function parseAndValidate(rawText: string, type: 'macros' | 'options_diet'): AIMacrosProposal | AIDietRawProposal {
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
        const result = AIDietRawProposalSchema.safeParse(parsed)
        if (!result.success) {
            console.error('[AI nutrition parse] Diet validation error:', result.error.flatten())
            throw new Error('La propuesta de dieta no tiene la estructura esperada. Inténtalo de nuevo.')
        }
        return result.data
    }
}

// ============================================================================
// Alimentos y objetivos diarios
// ============================================================================

function toFoodRef(row: any): DietFoodRef {
    return {
        id: row.id,
        name: row.name,
        brand: row.brand,
        kcal: Number(row.kcal),
        protein_g: Number(row.protein_g),
        carbs_g: Number(row.carbs_g),
        fat_g: Number(row.fat_g),
        serving_size_g: Number(row.serving_size_g) || 100,
        unit_weight_g: row.unit_weight_g != null ? Number(row.unit_weight_g) : null,
        unit_label: row.unit_label,
        food_group: row.food_group,
        is_generic: Boolean(row.is_generic),
    }
}

/** Un alimento por nombre: menos ruido en el prompt y menos dudas para la IA */
function dedupeFoods(foods: DietFoodRef[]) {
    const seen = new Set<string>()
    return foods.filter(food => {
        const key = food.name.trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function dailyTargetsFrom(plan: z.infer<typeof MacroPlanContextSchema> | null): DailyTargets {
    if (!plan) return {}
    const base = { kcal: plan.kcal, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fat_g: plan.fat_g }
    return {
        default: base,
        training: plan.day_type_config?.training ?? base,
        rest: plan.day_type_config?.rest ?? base,
    }
}

// ============================================================================
// Route handler
// ============================================================================

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAICoach().catch(() => null)
        if (!auth) return NextResponse.json({ error: 'Inicia sesión con una cuenta de entrenador.' }, { status: 401 })
        const { supabase, coachId } = auth
        const coachContext = await getCoachAIProfileContext(coachId)

        const body = await req.json()
        const input = RequestSchema.safeParse(body)

        if (!input.success) {
            return NextResponse.json(
                { error: 'Parámetros inválidos: ' + JSON.stringify(input.error.flatten().fieldErrors) },
                { status: 400 }
            )
        }

        const { clientId, type, mode, objective, prompt, context } = input.data
        if (!await requireAIClient(clientId, coachId).catch(() => null)) {
            return NextResponse.json({ error: 'No tienes acceso a este atleta.' }, { status: 403 })
        }

        const weightSummary = buildWeightSummary(context.weightHistory)
        const macrosSummary = buildCurrentMacrosSummary(context.activeMacroPlan ?? null)
        const athleteContext = await getAthleteProfileContextForCoach(coachId, clientId)

        let catalog: ReturnType<typeof buildFoodCatalogPrompt> | null = null
        if (type === 'options_diet') {
            const { data: foodRows, error: foodsError } = await supabase
                .from('foods')
                .select('id, name, brand, kcal, protein_g, carbs_g, fat_g, serving_size_g, unit_weight_g, unit_label, food_group, is_generic')
                .eq('is_public', true)
                .limit(2000)
            if (foodsError) throw new Error('No se pudo cargar la base de alimentos.')
            catalog = buildFoodCatalogPrompt(dedupeFoods((foodRows ?? []).map(toFoodRef)))
        }

        const taskPrompt = type === 'macros'
            ? buildMacrosPrompt(mode, objective, prompt, weightSummary, macrosSummary, athleteContext)
            : buildDietPrompt(mode, objective, prompt, weightSummary, macrosSummary, context.activeDietPlanText, athleteContext, catalog!.text)

        const fullPrompt = coachContext + taskPrompt

        const rawText = await callGemini(fullPrompt, {
            maxOutputTokens: 16384,
            thinkingLevel: 'medium',
            responseMimeType: 'application/json',
        })
        const parsed = parseAndValidate(rawText, type)

        let proposal: AINutritionProposal
        if (parsed.type === 'options_diet') {
            const built = buildDietFromAI(parsed.meals as AIDietRawMeal[], catalog!.codeToFood, dailyTargetsFrom(context.activeMacroPlan ?? null))
            if (built.unknownFoods.length > 0) {
                console.warn('[AI generate-nutrition] Códigos de alimento desconocidos:', built.unknownFoods)
            }
            const dietProposal: AIDietProposal = {
                type: 'options_diet',
                mode: parsed.mode,
                name: parsed.name,
                meals: built.meals,
                explanation: parsed.explanation,
                change_summary: parsed.change_summary,
                structure_strategy: parsed.structure_strategy,
                fit: built.fit,
            }
            proposal = dietProposal
        } else {
            proposal = parsed
        }

        // TODO: persist { objective, prompt, proposal, accepted: null, coachId, clientId } to ai_generations table
        return NextResponse.json({ success: true, proposal })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error inesperado generando la propuesta nutricional.'
        console.error('[AI generate-nutrition]', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
