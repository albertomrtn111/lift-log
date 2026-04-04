import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini } from '@/lib/ai/gemini'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'

const AICheckinAnalysisSchema = z.object({
    overall_summary: z.string().min(1),
    body_metrics_summary: z.string().default(''),
    weight_trend_analysis: z.string().default(''),
    training_analysis: z.string().default(''),
    cardio_analysis: z.string().default(''),
    nutrition_analysis: z.string().default(''),
    adherence_analysis: z.string().default(''),
    coach_recommendations: z.array(z.string()).default([]),
    suggested_changes: z.array(z.string()).default([]),
    warnings_or_flags: z.array(z.string()).default([]),
})

export type AICheckinAnalysis = z.infer<typeof AICheckinAnalysisSchema>

export interface GenerateCheckinAnalysisResult {
    success: boolean
    analysis?: AICheckinAnalysis
    error?: string
}

type MetricDefinitionLite = {
    id: string
    name: string
    unit: string | null
}

type RecentMetricRow = {
    metric_date: string
    weight_kg: number | null
    steps: number | null
    sleep_h: number | null
}

type RecentDietRow = {
    log_date: string
    adherence_pct: number | null
    notes: string | null
}

type RecentCardioRow = {
    scheduled_date: string
    actual_distance_km: number | null
    actual_duration_min: number | null
    is_completed: boolean | null
    name: string | null
}

type RecentTrainingRow = {
    updated_at: string | null
    week_index: number | null
    notes: string | null
    sets: Array<Record<string, unknown>> | null
}

async function buildContext(checkinId: string) {
    const supabase = createAdminClient()

    const { data: checkin, error: checkinError } = await supabase
        .from('checkins')
        .select('*')
        .eq('id', checkinId)
        .single()

    if (checkinError || !checkin) {
        throw new Error('Check-in no encontrado')
    }

    const clientId = checkin.client_id
    const coachId = checkin.coach_id
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
        previousCheckinResult,
        metricHistoryResult,
        macroPlanResult,
        trainingProgramResult,
        metricDefsResult,
        dietAdherenceResult,
        cardioResult,
        trainingLogsResult,
    ] = await Promise.all([
        supabase
            .from('checkins')
            .select('raw_payload, submitted_at, weight_kg, training_adherence_pct, nutrition_adherence_pct, sleep_avg_h, notes')
            .eq('client_id', clientId)
            .eq('type', 'checkin')
            .not('submitted_at', 'is', null)
            .neq('id', checkinId)
            .order('submitted_at', { ascending: false })
            .limit(1),
        supabase
            .from('client_metrics')
            .select('metric_date, weight_kg, steps, sleep_h')
            .eq('client_id', clientId)
            .gte('metric_date', thirtyDaysAgo)
            .order('metric_date', { ascending: true }),
        supabase
            .from('macro_plans')
            .select('kcal, protein_g, carbs_g, fat_g, steps, notes, day_type_config')
            .eq('client_id', clientId)
            .lte('effective_from', today)
            .or(`effective_to.is.null,effective_to.gte.${today}`)
            .order('effective_from', { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from('training_programs')
            .select('id, name, total_weeks, status, effective_from')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .maybeSingle(),
        supabase
            .from('metric_definitions')
            .select('id, name, unit')
            .eq('coach_id', coachId)
            .eq('is_active', true),
        supabase
            .from('diet_adherence_logs')
            .select('log_date, adherence_pct, notes')
            .eq('client_id', clientId)
            .gte('log_date', fourteenDaysAgo)
            .order('log_date', { ascending: true }),
        supabase
            .from('cardio_sessions')
            .select('scheduled_date, actual_distance_km, actual_duration_min, is_completed, name')
            .eq('client_id', clientId)
            .eq('is_completed', true)
            .gte('scheduled_date', twentyOneDaysAgo)
            .order('scheduled_date', { ascending: false })
            .limit(12),
        supabase
            .from('training_exercise_logs')
            .select('updated_at, week_index, notes, sets')
            .eq('client_id', clientId)
            .gte('updated_at', `${twentyOneDaysAgo}T00:00:00`)
            .order('updated_at', { ascending: false })
            .limit(20),
    ])

    return {
        checkin,
        previousCheckin: previousCheckinResult.data?.[0] ?? null,
        metricHistory: (metricHistoryResult.data ?? []) as RecentMetricRow[],
        macroPlan: macroPlanResult.data ?? null,
        trainingProgram: trainingProgramResult.data ?? null,
        metricDefs: (metricDefsResult.data ?? []) as MetricDefinitionLite[],
        dietAdherence: (dietAdherenceResult.data ?? []) as RecentDietRow[],
        cardioSessions: (cardioResult.data ?? []) as RecentCardioRow[],
        trainingLogs: (trainingLogsResult.data ?? []) as RecentTrainingRow[],
    }
}

function resolvePayloadLines(
    payload: Record<string, unknown> | null,
    metricDefs: MetricDefinitionLite[]
) {
    if (!payload) return ['Sin datos']

    const lines: string[] = []

    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === '') continue

        if (key.startsWith('metric_')) {
            const id = key.replace('metric_', '')
            const def = metricDefs.find((metric) => metric.id === id)
            const label = def ? `${def.name}${def.unit ? ` (${def.unit})` : ''}` : key
            lines.push(`- ${label}: ${value}`)
            continue
        }

        if (key.startsWith('campo_')) {
            const renderedValue = Array.isArray(value) ? value.join(', ') : String(value)
            lines.push(`- ${key}: ${renderedValue}`)
        }
    }

    return lines.length > 0 ? lines : ['Sin datos']
}

function buildMetricTrendText(metricHistory: RecentMetricRow[]) {
    const weightEntries = metricHistory.filter((entry) => entry.weight_kg != null)
    const stepsEntries = metricHistory.filter((entry) => entry.steps != null)
    const sleepEntries = metricHistory.filter((entry) => entry.sleep_h != null)

    const parts: string[] = []

    if (weightEntries.length >= 2) {
        const first = Number(weightEntries[0].weight_kg)
        const last = Number(weightEntries[weightEntries.length - 1].weight_kg)
        const diff = last - first
        const trend = diff > 0.3 ? 'subiendo' : diff < -0.3 ? 'bajando' : 'estable'
        parts.push(
            `Peso más reciente: ${last} kg (${weightEntries[weightEntries.length - 1].metric_date})`,
            `Tendencia peso: ${trend} (${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg en ${weightEntries.length} registros)`
        )
    } else if (weightEntries.length === 1) {
        parts.push(`Peso más reciente: ${weightEntries[0].weight_kg} kg (${weightEntries[0].metric_date})`)
    } else {
        parts.push('Sin registros de peso recientes')
    }

    if (stepsEntries.length > 0) {
        const avgSteps = Math.round(
            stepsEntries.reduce((sum, entry) => sum + Number(entry.steps ?? 0), 0) / stepsEntries.length
        )
        parts.push(`Media de pasos reciente: ${avgSteps.toLocaleString()}/día`)
    }

    if (sleepEntries.length > 0) {
        const avgSleep = (
            sleepEntries.reduce((sum, entry) => sum + Number(entry.sleep_h ?? 0), 0) / sleepEntries.length
        ).toFixed(1)
        parts.push(`Media de sueño reciente: ${avgSleep} h`)
    }

    return parts.join('\n')
}

function buildNutritionText(ctx: Awaited<ReturnType<typeof buildContext>>) {
    const { macroPlan, dietAdherence } = ctx
    const parts: string[] = []

    if (macroPlan) {
        let dayTypeConfig: any = macroPlan.day_type_config
        if (typeof dayTypeConfig === 'string') {
            try {
                dayTypeConfig = JSON.parse(dayTypeConfig)
            } catch {
                dayTypeConfig = null
            }
        }

        if (dayTypeConfig?.training && dayTypeConfig?.rest) {
            parts.push(
                `Macros día entreno: ${dayTypeConfig.training.kcal} kcal | P:${dayTypeConfig.training.protein_g}g C:${dayTypeConfig.training.carbs_g}g G:${dayTypeConfig.training.fat_g}g`,
                `Macros día descanso: ${dayTypeConfig.rest.kcal} kcal | P:${dayTypeConfig.rest.protein_g}g C:${dayTypeConfig.rest.carbs_g}g G:${dayTypeConfig.rest.fat_g}g`
            )
        } else {
            parts.push(
                `Macros activos: ${macroPlan.kcal} kcal | P:${macroPlan.protein_g}g C:${macroPlan.carbs_g}g G:${macroPlan.fat_g}g`
            )
        }

        if (macroPlan.steps) {
            parts.push(`Objetivo de pasos: ${Number(macroPlan.steps).toLocaleString()}/día`)
        }
        if (macroPlan.notes) {
            parts.push(`Notas del plan nutricional: ${macroPlan.notes}`)
        }
    } else {
        parts.push('Sin plan nutricional activo')
    }

    if (dietAdherence.length > 0) {
        const values = dietAdherence
            .map((entry) => entry.adherence_pct)
            .filter((value): value is number => value != null)
        if (values.length > 0) {
            const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
            parts.push(`Adherencia nutricional reciente: ${avg}% de media en ${values.length} registros`)
        }

        const recentNotes = dietAdherence
            .filter((entry) => entry.notes)
            .slice(-3)
            .map((entry) => `${entry.log_date}: ${entry.notes}`)

        if (recentNotes.length > 0) {
            parts.push(`Notas de adherencia: ${recentNotes.join(' | ')}`)
        }
    } else {
        parts.push('Sin tracking reciente de adherencia nutricional')
    }

    return parts.join('\n')
}

function buildTrainingText(ctx: Awaited<ReturnType<typeof buildContext>>) {
    const { trainingProgram, trainingLogs, cardioSessions } = ctx
    const parts: string[] = []

    if (trainingProgram) {
        parts.push(
            `Programa activo: ${trainingProgram.name} (${trainingProgram.total_weeks} semanas, desde ${trainingProgram.effective_from})`
        )
    } else {
        parts.push('Sin programa de entrenamiento activo')
    }

    if (trainingLogs.length > 0) {
        const totalSets = trainingLogs.reduce((sum, log) => sum + (Array.isArray(log.sets) ? log.sets.length : 0), 0)
        const notedSessions = trainingLogs.filter((log) => log.notes).slice(0, 3)
        parts.push(`Logs de entrenamiento recientes: ${trainingLogs.length} entradas, ${totalSets} sets registrados`)
        if (notedSessions.length > 0) {
            parts.push(
                `Notas recientes de entrenamiento: ${notedSessions
                    .map((log) => `${log.updated_at?.split('T')[0] ?? 'sin fecha'}: ${log.notes}`)
                    .join(' | ')}`
            )
        }
    } else {
        parts.push('Sin logs recientes de entrenamiento')
    }

    if (cardioSessions.length > 0) {
        const totalDuration = cardioSessions.reduce((sum, session) => sum + Number(session.actual_duration_min ?? 0), 0)
        const totalDistance = cardioSessions.reduce((sum, session) => sum + Number(session.actual_distance_km ?? 0), 0)
        parts.push(
            `Cardio reciente: ${cardioSessions.length} sesiones, ${totalDuration} min totales, ${totalDistance.toFixed(1)} km`
        )
    } else {
        parts.push('Sin sesiones recientes de cardio completadas')
    }

    return parts.join('\n')
}

function buildPrompt(ctx: Awaited<ReturnType<typeof buildContext>>) {
    const currentPayloadLines = resolvePayloadLines(
        (ctx.checkin.raw_payload as Record<string, unknown> | null) ?? null,
        ctx.metricDefs
    )
    const previousPayloadLines = resolvePayloadLines(
        (ctx.previousCheckin?.raw_payload as Record<string, unknown> | null) ?? null,
        ctx.metricDefs
    )

    return `Eres el assistant del coach dentro de una plataforma de entrenamiento y nutricion. Analiza el check-in del atleta como lo haria un asistente experto que prepara una revision para el entrenador.

## Check-in actual
Fecha envio: ${ctx.checkin.submitted_at ? new Date(ctx.checkin.submitted_at).toLocaleDateString('es-ES') : 'Desconocida'}
Periodo: ${ctx.checkin.period_start ?? '—'} -> ${ctx.checkin.period_end ?? '—'}
Adherencia entrenamiento: ${ctx.checkin.training_adherence_pct != null ? `${ctx.checkin.training_adherence_pct}%` : 'No reportada'}
Adherencia nutricion: ${ctx.checkin.nutrition_adherence_pct != null ? `${ctx.checkin.nutrition_adherence_pct}%` : 'No reportada'}
Sueno medio: ${ctx.checkin.sleep_avg_h != null ? `${ctx.checkin.sleep_avg_h}h` : 'No reportado'}
Notas del atleta: ${ctx.checkin.notes ?? 'Ninguna'}

### Respuestas actuales
${currentPayloadLines.join('\n')}

## Check-in anterior
${ctx.previousCheckin
        ? `Fecha: ${ctx.previousCheckin.submitted_at ? new Date(ctx.previousCheckin.submitted_at).toLocaleDateString('es-ES') : '—'}
Adherencia entrenamiento: ${ctx.previousCheckin.training_adherence_pct != null ? `${ctx.previousCheckin.training_adherence_pct}%` : '—'}
Adherencia nutricion: ${ctx.previousCheckin.nutrition_adherence_pct != null ? `${ctx.previousCheckin.nutrition_adherence_pct}%` : '—'}
Sueno medio: ${ctx.previousCheckin.sleep_avg_h != null ? `${ctx.previousCheckin.sleep_avg_h}h` : '—'}
Notas: ${ctx.previousCheckin.notes ?? 'Ninguna'}
Respuestas:
${previousPayloadLines.join('\n')}`
        : 'No hay check-in anterior disponible'}

## Tendencias recientes
${buildMetricTrendText(ctx.metricHistory)}

## Contexto de nutricion
${buildNutritionText(ctx)}

## Contexto de entrenamiento y cardio
${buildTrainingText(ctx)}

Responde SOLO con JSON valido, sin markdown ni texto adicional:
{
  "overall_summary": "Resumen ejecutivo breve y util para el coach, 2-3 frases maximo.",
  "body_metrics_summary": "Analisis de medidas y metricas corporales.",
  "weight_trend_analysis": "Lectura de la tendencia del peso y si encaja con el objetivo.",
  "training_analysis": "Lectura de entrenamiento y rendimiento.",
  "cardio_analysis": "Lectura de cardio y pasos si aplica.",
  "nutrition_analysis": "Lectura de adherencia y contexto nutricional.",
  "adherence_analysis": "Valoracion global de adherencia.",
  "coach_recommendations": ["Accion concreta 1", "Accion concreta 2"],
  "suggested_changes": ["Cambio sugerido 1", "Cambio sugerido 2"],
  "warnings_or_flags": ["Riesgo o alerta relevante si existe"]
}

Reglas:
- Escribe todo en espanol
- No inventes datos ausentes
- Si no hay base para un bloque, devuelve "" o []
- Maximo 4 items en coach_recommendations y suggested_changes
- warnings_or_flags solo si de verdad merece seguimiento
- Debe sonar como un asistente experto preparando la revision para el coach, no como un texto motivacional generico`
}

function extractJson(rawText: string) {
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenced) return fenced[1].trim()

    const objectMatch = rawText.match(/(\{[\s\S]*\})/)
    if (objectMatch) return objectMatch[1].trim()

    return rawText.trim()
}

function parseAnalysis(rawText: string) {
    let parsed: unknown

    try {
        parsed = JSON.parse(extractJson(rawText))
    } catch {
        throw new Error('La IA devolvio JSON invalido')
    }

    const result = AICheckinAnalysisSchema.safeParse(parsed)
    if (!result.success) {
        throw new Error('La estructura del analisis IA no es valida')
    }

    return result.data
}

export async function generateCheckinAnalysis(
    checkinId: string,
    reviewId: string
): Promise<GenerateCheckinAnalysisResult> {
    const supabase = createAdminClient()

    try {
        await supabase
            .from('reviews')
            .update({
                ai_status: 'pending',
                ai_error: null,
            })
            .eq('id', reviewId)

        const context = await buildContext(checkinId)
        const coachContext = await getCoachAIProfileContext(context.checkin.coach_id)
        const rawText = await callGemini(coachContext + buildPrompt(context), {
            maxOutputTokens: 4096,
            thinkingBudget: 0,
            temperature: 0.4,
        })
        const analysis = parseAnalysis(rawText)

        const { error: updateError } = await supabase
            .from('reviews')
            .update({
                ai_status: 'completed',
                ai_summary: analysis.overall_summary,
                ai_generated_at: new Date().toISOString(),
                ai_error: null,
                analysis: analysis as unknown as Record<string, unknown>,
            })
            .eq('id', reviewId)

        if (updateError) {
            throw new Error(updateError.message)
        }

        return {
            success: true,
            analysis,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido al generar el analisis IA'

        await supabase
            .from('reviews')
            .update({
                ai_status: 'failed',
                ai_error: message,
            })
            .eq('id', reviewId)

        return {
            success: false,
            error: message,
        }
    }
}
