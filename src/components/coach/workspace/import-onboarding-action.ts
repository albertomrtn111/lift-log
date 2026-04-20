'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'
import { callGemini } from '@/lib/ai/gemini'
import { AthleteAIProfileOutputSchema } from '@/lib/ai/generate-athlete-profile'
import type { AthleteAIProfileOutput } from '@/lib/ai/generate-athlete-profile'
import type { FormField } from '@/types/forms'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Serializes the onboarding checkin payload to a readable Q&A text block.
 * Uses the form template schema to get human-readable question labels when available.
 */
function serializePayload(
    payload: Record<string, unknown>,
    schema: FormField[] | null
): string {
    const labelMap = new Map<string, string>()

    if (schema) {
        for (const field of schema) {
            if (field.id && field.label) {
                labelMap.set(field.id, field.label)
            }
        }
    }

    const lines: string[] = []

    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined || value === '') continue

        const label = labelMap.get(key) || key

        if (Array.isArray(value)) {
            const joined = value.filter(Boolean).join(', ')
            if (joined) lines.push(`${label}: ${joined}`)
        } else if (typeof value === 'object') {
            lines.push(`${label}: ${JSON.stringify(value)}`)
        } else {
            lines.push(`${label}: ${String(value)}`)
        }
    }

    return lines.join('\n')
}

function buildOnboardingPrompt(
    clientName: string,
    formText: string,
    coachContext: string
): string {
    return `${coachContext}Eres un sistema de configuración de perfiles IA para atletas dentro de una plataforma de coaching.

Tu trabajo es transformar las respuestas que un atleta ha dado en su formulario de onboarding en un perfil estructurado, claro, profesional y útil para futuras decisiones de entrenamiento, nutrición, planificación y revisiones.

Debes redactar el perfil como un documento operativo interno para el coach. No escribas como si hablaras al atleta. No inventes datos que no estén soportados por las respuestas. Si algún área no tiene datos suficientes, indícalo brevemente.

━━━━━━━━━━━━━━━━━━━━━━━━━━
ATLETA: ${clientName}
━━━━━━━━━━━━━━━━━━━━━━━━━━

RESPUESTAS DEL FORMULARIO DE ONBOARDING:

${formText}

━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCCIONES DE SALIDA
━━━━━━━━━━━━━━━━━━━━━━━━━━

Devuelve EXCLUSIVAMENTE un JSON válido, sin markdown ni texto fuera del JSON, con esta estructura exacta:

{
  "athlete_summary": "Párrafo de 4-6 frases que sitúe quién es el atleta, su contexto, nivel actual y situación general.",
  "goals_and_calendar": "Párrafo claro que sintetice objetivos principales, secundarios y calendario del año. Si hay fechas o hitos, intégralos explícitamente.",
  "health_and_constraints": "Párrafo que resuma lesiones, molestias, restricciones y focos de vigilancia para programar con criterio.",
  "training_profile": "Párrafo que describa fortalezas, debilidades, adherencia, disponibilidad, tolerancia a carga e historial relevante.",
  "nutrition_and_body_context": "Párrafo que resuma objetivo corporal, contexto nutricional, recuperación y condicionantes físicos.",
  "key_points_and_working_rules": "Párrafo operativo con puntos clave, reglas prácticas y observaciones que el coach debería tener presentes al trabajar con este atleta.",
  "system_prompt": "Bloque de 220-450 palabras, en segunda persona, reutilizable como contexto IA futuro sobre este atleta. Debe condensar objetivos, limitaciones, contexto, prioridades y reglas prácticas."
}

El tono debe ser profesional, concreto y útil.`
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

export interface ImportOnboardingResult {
    success: boolean
    output?: AthleteAIProfileOutput
    error?: string
    /** true if the client has no reviewed onboarding checkin */
    noOnboarding?: boolean
}

export async function importOnboardingToAthleteProfile(
    clientId: string,
    clientName: string
): Promise<ImportOnboardingResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const coachId = await getCoachIdForUser(user.id)
    if (!coachId) return { success: false, error: 'Sin acceso de coach' }

    // 1. Find the latest reviewed onboarding checkin for this client
    const admin = createAdminClient()
    const { data: checkin, error: checkinErr } = await admin
        .from('checkins')
        .select('id, raw_payload, form_template_id')
        .eq('client_id', clientId)
        .eq('coach_id', coachId)
        .eq('type', 'onboarding')
        .eq('status', 'reviewed')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (checkinErr) {
        console.error('[importOnboarding] Checkin error:', checkinErr)
        return { success: false, error: checkinErr.message }
    }

    if (!checkin || !checkin.raw_payload) {
        return { success: false, noOnboarding: true, error: 'No hay ningún formulario de onboarding completado por este atleta.' }
    }

    // 2. Load form template schema to get human-readable labels (best effort)
    let schema: FormField[] | null = null
    if (checkin.form_template_id) {
        const { data: template } = await admin
            .from('form_templates')
            .select('schema')
            .eq('id', checkin.form_template_id)
            .maybeSingle()

        if (template?.schema && Array.isArray(template.schema)) {
            schema = template.schema as FormField[]
        }
    }

    // 3. Serialize payload to readable text
    const payload = checkin.raw_payload as Record<string, unknown>
    const formText = serializePayload(payload, schema)

    if (!formText.trim()) {
        return { success: false, error: 'El formulario de onboarding está vacío.' }
    }

    // 4. Build prompt and call AI
    const coachContext = await getCoachAIProfileContext(coachId)
    const prompt = buildOnboardingPrompt(clientName, formText, coachContext)

    let raw: string
    try {
        raw = await callGemini(prompt, {
            maxOutputTokens: 8192,
            thinkingBudget: 0,
            temperature: 0.6,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido'
        return { success: false, error: message }
    }

    // 5. Parse and validate
    const jsonStr = extractJson(raw)
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonStr)
    } catch {
        console.error('[importOnboarding] JSON parse error. Raw:', raw.slice(0, 500))
        return { success: false, error: 'La IA devolvió un formato inesperado. Inténtalo de nuevo.' }
    }

    const validated = AthleteAIProfileOutputSchema.safeParse(parsed)
    if (!validated.success) {
        console.error('[importOnboarding] Zod error:', validated.error.message)
        return { success: false, error: 'El perfil generado no es válido. Inténtalo de nuevo.' }
    }

    const output = validated.data

    // 6. Save to athlete_ai_profiles (upsert)
    const now = new Date().toISOString()
    const { error: upsertErr } = await supabase
        .from('athlete_ai_profiles')
        .upsert(
            {
                coach_id: coachId,
                client_id: clientId,
                onboarding_status: 'completed',
                profile_status: 'generated',
                answers_json: {},
                generated_athlete_summary: output.athlete_summary,
                generated_goals_and_calendar: output.goals_and_calendar,
                generated_health_and_constraints: output.health_and_constraints,
                generated_training_profile: output.training_profile,
                generated_nutrition_and_body_context: output.nutrition_and_body_context,
                generated_key_points_and_working_rules: output.key_points_and_working_rules,
                generated_system_prompt: output.system_prompt,
                generated_profile_json: output,
                generation_error: null,
                onboarding_completed_at: now,
                updated_at: now,
            },
            { onConflict: 'coach_id,client_id' }
        )

    if (upsertErr) {
        console.error('[importOnboarding] Upsert error:', upsertErr)
        return { success: false, error: upsertErr.message }
    }

    revalidatePath('/coach/clients')

    return { success: true, output }
}
