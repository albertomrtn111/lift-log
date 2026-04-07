import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'
import type { AthleteAIProfile } from '@/types/athlete-profile'

export const AthleteAIProfileOutputSchema = z.object({
    athlete_summary: z.string().min(1),
    goals_and_calendar: z.string().min(1),
    health_and_constraints: z.string().min(1),
    training_profile: z.string().min(1),
    nutrition_and_body_context: z.string().min(1),
    key_points_and_working_rules: z.string().min(1),
    system_prompt: z.string().min(1),
})

export type AthleteAIProfileOutput = z.infer<typeof AthleteAIProfileOutputSchema>

function buildGoalsBlock(profile: AthleteAIProfile): string {
    if (!profile.answers_json.annualGoals.length) {
        return '- Sin hitos fechados definidos'
    }

    return profile.answers_json.annualGoals
        .map(goal => `- [${goal.priority}] ${goal.title || 'Sin título'} — ${goal.targetDate || 'Sin fecha'}`)
        .join('\n')
}

function buildPrompt(profile: AthleteAIProfile, coachContext: string): string {
    const disciplines = profile.answers_json.athleteDisciplines.join(', ') || 'No especificado'

    return `${coachContext}Eres un sistema de configuración de perfiles IA para atletas dentro de una plataforma de coaching.

Tu trabajo es transformar las respuestas del entrenador sobre este atleta en un perfil estructurado, claro, profesional y útil para futuras decisiones de entrenamiento, nutrición, planificación y revisiones.

Debes redactar el perfil como un documento operativo interno para el coach. No escribas como si hablaras al atleta. No inventes datos que no estén soportados por las respuestas.

━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPUESTAS DEL PERFIL DEL ATLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━

**IDENTIDAD Y CONTEXTO**
- Perfil / disciplina: ${disciplines}
- Nivel: ${profile.answers_json.athleteLevel || 'No especificado'}
- Experiencia y contexto: ${profile.answers_json.experienceContext || 'No especificado'}
- Situación actual: ${profile.answers_json.currentSituation || 'No especificada'}
- Contexto semanal general: ${profile.answers_json.weeklyContext || 'No especificado'}

**OBJETIVOS DEL AÑO**
- Objetivo principal: ${profile.answers_json.primaryAnnualGoal || 'No especificado'}
- Objetivos secundarios: ${profile.answers_json.secondaryAnnualGoals || 'No especificados'}
- Hitos / objetivos con fecha:
${buildGoalsBlock(profile)}

**SALUD, LIMITACIONES Y CONDICIONANTES**
- Lesiones previas / historial: ${profile.answers_json.injuryHistory || 'No especificado'}
- Molestias o problemas actuales: ${profile.answers_json.currentIssues || 'No especificado'}
- Restricciones: ${profile.answers_json.restrictions || 'No especificadas'}
- Puntos a vigilar: ${profile.answers_json.monitoringPoints || 'No especificados'}

**PERFIL DE ENTRENAMIENTO Y HÁBITOS**
- Fortalezas: ${profile.answers_json.strengths || 'No especificadas'}
- Debilidades: ${profile.answers_json.weaknesses || 'No especificadas'}
- Adherencia: ${profile.answers_json.adherenceProfile || 'No especificada'}
- Disponibilidad semanal: ${profile.answers_json.weeklyAvailability || 'No especificada'}
- Tolerancia a carga: ${profile.answers_json.loadTolerance || 'No especificada'}
- Historial de entrenamiento: ${profile.answers_json.trainingHistory || 'No especificado'}

**NUTRICIÓN, COMPOSICIÓN Y CONTEXTO FÍSICO**
- Objetivo corporal: ${profile.answers_json.bodyCompositionGoal || 'No especificado'}
- Contexto nutricional: ${profile.answers_json.nutritionContext || 'No especificado'}
- Recuperación / sueño / contexto físico: ${profile.answers_json.recoveryContext || 'No especificado'}
- Notas prácticas del coach: ${profile.answers_json.coachNotes || 'Sin notas adicionales'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCCIONES DE SALIDA
━━━━━━━━━━━━━━━━━━━━━━━━━━

Devuelve EXCLUSIVAMENTE un JSON válido, sin markdown ni texto fuera del JSON, con esta estructura exacta:

{
  "athlete_summary": "Párrafo de 4-6 frases que sitúe quién es el atleta, su contexto, nivel actual y situación general.",
  "goals_and_calendar": "Párrafo claro que sintetice objetivos principales, secundarios y calendario del año. Si hay hitos fechados, intégralos explícitamente.",
  "health_and_constraints": "Párrafo que resuma lesiones, molestias, restricciones y focos de vigilancia para programar con criterio.",
  "training_profile": "Párrafo que describa fortalezas, debilidades, adherencia, disponibilidad, tolerancia a carga e historial relevante.",
  "nutrition_and_body_context": "Párrafo que resuma objetivo corporal, contexto nutricional, recuperación y condicionantes físicos.",
  "key_points_and_working_rules": "Párrafo operativo con puntos clave, reglas prácticas y observaciones que el coach debería tener presentes al trabajar con este atleta.",
  "system_prompt": "Bloque de 220-450 palabras, en segunda persona, reutilizable como contexto IA futuro sobre este atleta. Debe condensar objetivos, limitaciones, contexto, prioridades y reglas prácticas."
}

El tono debe ser profesional, concreto y útil.`
}

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

export async function generateAthleteAIProfile(
    coachId: string,
    profile: AthleteAIProfile
): Promise<{ success: true; output: AthleteAIProfileOutput } | { success: false; error: string }> {
    try {
        const coachContext = await getCoachAIProfileContext(coachId)
        const prompt = buildPrompt(profile, coachContext)
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
            console.error('[generate-athlete-profile] JSON parse error. Raw:', raw.slice(0, 500))
            return { success: false, error: 'La IA devolvió un formato inesperado. Inténtalo de nuevo.' }
        }

        const validated = AthleteAIProfileOutputSchema.safeParse(parsed)
        if (!validated.success) {
            console.error('[generate-athlete-profile] Zod validation error:', validated.error.message)
            return { success: false, error: 'El perfil generado no es válido. Inténtalo de nuevo.' }
        }

        return { success: true, output: validated.data }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        console.error('[generate-athlete-profile] Error:', message)
        return { success: false, error: message }
    }
}
