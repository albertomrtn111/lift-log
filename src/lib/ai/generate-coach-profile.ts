import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import type { CoachAIProfile } from '@/data/coach-ai-profile'

// ─────────────────────────────────────────────
// Output schema — what Gemini must produce
// ─────────────────────────────────────────────

export const CoachAIProfileOutputSchema = z.object({
    professional_summary: z.string().min(1),
    methodology: z.object({
        training: z.string().min(1),
        nutrition: z.string().min(1),
        reviews: z.string().min(1),
    }),
    communication_style: z.string().min(1),
    master_rules: z.object({
        always_do: z.array(z.string()),
        never_do: z.array(z.string()),
        decision_criteria: z.array(z.string()),
    }),
    system_prompt: z.string().min(1),
})

export type CoachAIProfileOutput = z.infer<typeof CoachAIProfileOutputSchema>

// ─────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────

function buildPrompt(profile: CoachAIProfile): string {
    const specialty = profile.specialty?.join(', ') || 'No especificada'
    const clientTypes = profile.client_types?.join(', ') || 'No especificado'
    const athleteLevel = profile.athlete_level?.join(', ') || 'No especificado'
    const trainingPriorities = profile.training_priorities?.join(', ') || 'No especificadas'
    const responseStyle = profile.response_style?.join(', ') || 'No especificado'

    return `Eres un sistema de configuración de IA para entrenadores personales profesionales.

Tu tarea es analizar las respuestas del onboarding de este entrenador y generar un perfil IA consolidado y estructurado que sirva como base de personalización para todas las funcionalidades de IA del sistema (generación de entrenamientos, nutrición, análisis de revisiones, etc.).

━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPUESTAS DEL ONBOARDING
━━━━━━━━━━━━━━━━━━━━━━━━━━

**ESPECIALIDAD Y TIPO DE CLIENTE**
- Especialidad principal: ${specialty}
- Tipo de clientes: ${clientTypes}
- Nivel de atleta: ${athleteLevel}

**FILOSOFÍA DE ENTRENAMIENTO**
- Filosofía general: ${profile.training_philosophy || 'No especificada'}
- Prioridades al programar: ${trainingPriorities}
- Estilo de progresión de carga: ${profile.progression_style || 'No especificado'}
- Errores a evitar: ${profile.training_avoid || 'No especificado'}
- Preferencias de ejercicios: ${profile.exercise_preferences || 'No especificadas'}

**FILOSOFÍA DE NUTRICIÓN**
- Enfoque nutricional: ${profile.nutrition_approach || 'No especificado'}
- Preferencia macros/opciones: ${profile.macro_or_options || 'No especificada'}
- Prioridades en ajustes: ${profile.nutrition_adjustment_priority || 'No especificada'}
- Ante falta de progreso: ${profile.nutrition_no_progress_action || 'No especificado'}
- Reglas en nutrición: ${profile.nutrition_rules || 'No especificadas'}

**REVISIONES Y TOMA DE DECISIONES**
- Qué valora en revisiones: ${profile.checkin_priorities || 'No especificado'}
- Señales para ajustes: ${profile.adjustment_signals || 'No especificadas'}
- Métricas vs sensaciones: ${profile.metrics_vs_feelings || 'No especificado'}
- Estructura de propuestas preferida: ${profile.review_structure_preference || 'No especificada'}
- Alertas o flags que quiere detectar: ${profile.alert_types || 'No especificadas'}

**ESTILO DE COMUNICACIÓN**
- Tono deseado: ${profile.communication_tone || 'No especificado'}
- Estilo de respuesta: ${responseStyle}
- Notas adicionales: ${profile.free_notes || 'Ninguna'}
- Descripción libre del coach: ${profile.final_description || 'No proporcionada'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━

Genera un perfil IA completo con EXACTAMENTE esta estructura JSON (sin texto adicional fuera del JSON):

{
  "professional_summary": "Párrafo de 3-5 frases describiendo al coach: quién es, en qué se especializa, qué tipo de trabajo realiza, qué prioriza y cómo trabaja. Escrito en tercera persona. Basado solo en la información proporcionada, sin inventar datos.",

  "methodology": {
    "training": "Párrafo que sintetiza su metodología de entrenamiento: qué prioriza, cómo programa, cómo progresa la carga, qué ejercicios o enfoques usa o evita.",
    "nutrition": "Párrafo que sintetiza su enfoque nutricional: qué herramientas usa (macros/opciones/mixto), cómo ajusta, qué prioriza, cómo actúa ante estancamientos.",
    "reviews": "Párrafo que sintetiza cómo revisa a los atletas: qué valora, qué señales usa para decidir, cómo pondera métricas vs sensaciones, qué estructura prefiere."
  },

  "communication_style": "Párrafo que describe el tono y forma de comunicación que debe usar la IA: si es directo, motivador, técnico, empático, conciso o detallado.",

  "master_rules": {
    "always_do": ["Regla 1 que la IA debe respetar siempre", "Regla 2...", "Regla 3..."],
    "never_do": ["Cosa 1 que la IA debe evitar siempre", "Cosa 2...", "Cosa 3..."],
    "decision_criteria": ["Criterio 1 para tomar decisiones", "Criterio 2...", "Criterio 3..."]
  },

  "system_prompt": "Bloque de texto completo, en segunda persona (Eres un asistente IA...), que sirva como system prompt reutilizable para todas las IAs del sistema. Debe incluir: rol, especialidad del coach, metodología sintetizada, tono, reglas maestras y cómo debe actuar en cada área (entrenamiento, nutrición, revisiones). Entre 300 y 600 palabras. Directo, sin encabezados ni listas."
}

Responde ÚNICAMENTE con el JSON. Sin texto previo, sin markdown, sin \`\`\`json, sin explicaciones.`
}

// ─────────────────────────────────────────────
// JSON extraction helper
// ─────────────────────────────────────────────

function extractJson(raw: string): string {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()
    const firstBrace = raw.indexOf('{')
    const lastBrace = raw.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return raw.slice(firstBrace, lastBrace + 1)
    }
    return raw.trim()
}

// ─────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────

export async function generateCoachAIProfile(
    profile: CoachAIProfile
): Promise<{ success: true; output: CoachAIProfileOutput } | { success: false; error: string }> {
    try {
        const prompt = buildPrompt(profile)
        const raw = await callGemini(prompt, {
            maxOutputTokens: 8192,
            thinkingBudget: 0,
            temperature: 0.6,
        })

        const jsonStr = extractJson(raw)
        let parsed: unknown
        try {
            parsed = JSON.parse(jsonStr)
        } catch {
            console.error('[generate-coach-profile] JSON parse error. Raw:', raw.slice(0, 500))
            return { success: false, error: 'La IA devolvió un formato inesperado. Inténtalo de nuevo.' }
        }

        const validated = CoachAIProfileOutputSchema.safeParse(parsed)
        if (!validated.success) {
            console.error('[generate-coach-profile] Zod validation error:', validated.error.message)
            return { success: false, error: 'El perfil generado no es válido. Inténtalo de nuevo.' }
        }

        return { success: true, output: validated.data }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        console.error('[generate-coach-profile] Error:', message)
        return { success: false, error: message }
    }
}
