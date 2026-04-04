import 'server-only'

import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'

export interface TrainingProgressAnalysisProgramSummary {
    id: string
    name: string
    status: string
    totalWeeks: number
    effectiveFrom: string
    effectiveTo: string | null
}

export interface TrainingProgressAnalysisSet {
    weekIndex: number
    setIndex: number
    weightKg: number | null
    reps: number | null
    rir: number | null
    completed: boolean
    notes: string | null
}

export interface TrainingProgressAnalysisExercise {
    id: string
    name: string
    order: number
    prescribedSets: number | null
    prescribedReps: string | null
    prescribedRir: number | null
    setsByWeek: Record<number, TrainingProgressAnalysisSet[]>
}

export interface TrainingProgressAnalysisDay {
    id: string
    name: string
    order: number
    exercises: TrainingProgressAnalysisExercise[]
}

export interface TrainingProgressAnalysisInput {
    coachId: string
    clientId: string
    program: TrainingProgressAnalysisProgramSummary
    days: TrainingProgressAnalysisDay[]
    maxWeek: number
    coachInstruction?: string
}

const TrainingProgressAIAnalysisSchema = z.object({
    overall_summary: z.string().min(1),
    block_read: z.string().default(''),
    progressed_exercises: z.array(z.object({
        exercise: z.string().min(1),
        insight: z.string().min(1),
    })).default([]),
    stalled_exercises: z.array(z.object({
        exercise: z.string().min(1),
        insight: z.string().min(1),
    })).default([]),
    warnings_or_inconsistencies: z.array(z.string()).default([]),
    key_findings: z.array(z.string()).default([]),
    instruction_response: z.string().default(''),
    recommendations: z.array(z.string()).default([]),
})

export type TrainingProgressAIAnalysis = z.infer<typeof TrainingProgressAIAnalysisSchema>

export interface TrainingProgressAnalysisResult {
    success: boolean
    analysis?: TrainingProgressAIAnalysis
    error?: string
}

type WeekSummary = {
    week: number
    setsCount: number
    topSet: string
    totalVolumeKg: number | null
    avgRir: number | null
    notes: string[]
}

type ExerciseSummary = {
    dayName: string
    exerciseName: string
    prescribed: string
    trackedWeeks: number[]
    weeks: WeekSummary[]
    firstTopSet: string
    latestTopSet: string
    bestWeightKg: number | null
    trend: 'up' | 'down' | 'flat' | 'mixed'
    quickRead: string
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

function getTopSet(sets: TrainingProgressAnalysisSet[]) {
    if (sets.length === 0) return null

    return sets.reduce((best, current) => {
        const bestWeight = best.weightKg ?? 0
        const currentWeight = current.weightKg ?? 0

        if (currentWeight > bestWeight) return current
        if (currentWeight < bestWeight) return best

        const bestReps = best.reps ?? 0
        const currentReps = current.reps ?? 0
        if (currentReps > bestReps) return current
        return best
    })
}

function formatTopSet(set: TrainingProgressAnalysisSet | null) {
    if (!set) return 'Sin sets'
    const weight = set.weightKg != null ? `${set.weightKg} kg` : '—'
    const reps = set.reps != null ? `${set.reps} reps` : '—'
    const rir = set.rir != null ? ` @RIR${set.rir}` : ''
    return `${weight} x ${reps}${rir}`
}

function getTrend(
    firstTopSet: TrainingProgressAnalysisSet | null,
    latestTopSet: TrainingProgressAnalysisSet | null,
) {
    if (!firstTopSet || !latestTopSet) return 'mixed' as const

    const firstWeight = firstTopSet.weightKg ?? 0
    const latestWeight = latestTopSet.weightKg ?? 0
    if (latestWeight > firstWeight) return 'up' as const
    if (latestWeight < firstWeight) return 'down' as const

    const firstReps = firstTopSet.reps ?? 0
    const latestReps = latestTopSet.reps ?? 0
    if (latestReps > firstReps) return 'up' as const
    if (latestReps < firstReps) return 'down' as const

    return 'flat' as const
}

function summarizeExercise(dayName: string, exercise: TrainingProgressAnalysisExercise): ExerciseSummary {
    const trackedWeeks = Object.keys(exercise.setsByWeek)
        .map(Number)
        .filter((week) => (exercise.setsByWeek[week] || []).length > 0)
        .sort((a, b) => a - b)

    const weeks = trackedWeeks.map((week) => {
        const sets = exercise.setsByWeek[week] || []
        const topSet = getTopSet(sets)
        const totalVolume = sets.reduce((sum, set) => {
            if (set.weightKg == null || set.reps == null) return sum
            return sum + (set.weightKg * set.reps)
        }, 0)

        const rirValues = sets.filter((set) => set.rir != null).map((set) => Number(set.rir))
        const avgRir = rirValues.length > 0
            ? Number((rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length).toFixed(1))
            : null

        return {
            week,
            setsCount: sets.length,
            topSet: formatTopSet(topSet),
            totalVolumeKg: totalVolume > 0 ? Number(totalVolume.toFixed(1)) : null,
            avgRir,
            notes: sets.filter((set) => set.notes).map((set) => set.notes as string).slice(0, 2),
        }
    })

    const firstWeek = trackedWeeks[0]
    const latestWeek = trackedWeeks[trackedWeeks.length - 1]
    const firstTopSet = firstWeek ? getTopSet(exercise.setsByWeek[firstWeek] || []) : null
    const latestTopSet = latestWeek ? getTopSet(exercise.setsByWeek[latestWeek] || []) : null
    const trend = getTrend(firstTopSet, latestTopSet)

    const bestWeightKg = weeks.reduce<number | null>((best, week) => {
        const match = week.topSet.match(/^([\d.]+)\skg/)
        const parsed = match ? Number(match[1]) : null
        if (parsed == null) return best
        if (best == null || parsed > best) return parsed
        return best
    }, null)

    const prescribedParts = [
        exercise.prescribedSets ? `${exercise.prescribedSets} series` : null,
        exercise.prescribedReps ? exercise.prescribedReps : null,
        exercise.prescribedRir != null ? `RIR ${exercise.prescribedRir}` : null,
    ].filter(Boolean)

    return {
        dayName,
        exerciseName: exercise.name,
        prescribed: prescribedParts.length > 0 ? prescribedParts.join(' · ') : 'Sin pauta prescrita',
        trackedWeeks,
        weeks,
        firstTopSet: formatTopSet(firstTopSet),
        latestTopSet: formatTopSet(latestTopSet),
        bestWeightKg,
        trend,
        quickRead:
            trend === 'up'
                ? 'Señal de progresión positiva'
                : trend === 'down'
                    ? 'Hay retroceso respecto al inicio'
                    : trend === 'flat'
                        ? 'Misma referencia que al inicio'
                        : 'Datos irregulares o insuficientes',
    }
}

function buildPrompt(input: TrainingProgressAnalysisInput, coachContext: string) {
    const exerciseSummaries = input.days.flatMap((day) =>
        day.exercises.map((exercise) => summarizeExercise(day.name, exercise))
    )

    const trackedExercises = exerciseSummaries.filter((exercise) => exercise.trackedWeeks.length > 0)

    const contextPayload = {
        program: {
            id: input.program.id,
            name: input.program.name,
            status: input.program.status,
            totalWeeks: input.program.totalWeeks,
            effectiveFrom: input.program.effectiveFrom,
            effectiveTo: input.program.effectiveTo,
            maxWeekWithData: input.maxWeek,
        },
        days: input.days.map((day) => ({
            name: day.name,
            order: day.order,
            exercisesCount: day.exercises.length,
        })),
        trackedExercisesCount: trackedExercises.length,
        exercises: trackedExercises.map((exercise) => ({
            dayName: exercise.dayName,
            exerciseName: exercise.exerciseName,
            prescribed: exercise.prescribed,
            trackedWeeks: exercise.trackedWeeks,
            firstTopSet: exercise.firstTopSet,
            latestTopSet: exercise.latestTopSet,
            bestWeightKg: exercise.bestWeightKg,
            trend: exercise.trend,
            quickRead: exercise.quickRead,
            weekSummaries: exercise.weeks,
        })),
        coachInstruction: input.coachInstruction?.trim() || null,
    }

    return `${coachContext}
Eres el asistente de análisis del progreso de entrenamiento de un coach profesional.
Tu trabajo es interpretar la evolución real del cliente dentro del programa, no limitarte a repetir números.

## Objetivo
- Detectar progresión, estancamiento, retrocesos e inconsistencias.
- Interpretar patrones por ejercicio y por bloque.
- Responder explícitamente a la instrucción del coach si existe.
- Proponer 2 o 3 ideas accionables y concretas.

## Instrucción opcional del coach
${input.coachInstruction?.trim() ? input.coachInstruction.trim() : 'No se ha añadido foco específico. Haz un análisis general.'}

## Datos estructurados del progreso
${JSON.stringify(contextPayload, null, 2)}

## Instrucciones de salida
Responde ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "overall_summary": "Resumen ejecutivo del progreso del programa en 2-4 frases.",
  "block_read": "Lectura del bloque o programa: progresión global, estancamiento o señales mixtas.",
  "progressed_exercises": [
    { "exercise": "Nombre", "insight": "Qué progresó exactamente y por qué es relevante." }
  ],
  "stalled_exercises": [
    { "exercise": "Nombre", "insight": "Dónde hay estancamiento, retroceso o inconsistencia." }
  ],
  "warnings_or_inconsistencies": [
    "Señal a vigilar 1"
  ],
  "key_findings": [
    "Hallazgo útil 1",
    "Hallazgo útil 2"
  ],
  "instruction_response": "Respuesta específica a la instrucción del coach. Si no hubo instrucción, deja una cadena vacía.",
  "recommendations": [
    "Recomendación accionable 1",
    "Recomendación accionable 2"
  ]
}

Reglas:
- Usa español.
- Sé concreto, profesional y útil para un entrenador.
- No inventes datos que no estén presentes.
- Si faltan datos, dilo claramente.
- Máximo 4 items en progressed_exercises y stalled_exercises.
- Máximo 5 items en warnings_or_inconsistencies y key_findings.
- Máximo 3 recomendaciones.
- Si la instrucción del coach existe, debe quedar respondida explícitamente en "instruction_response".`
}

export async function analyzeTrainingProgress(
    input: TrainingProgressAnalysisInput
): Promise<TrainingProgressAnalysisResult> {
    try {
        const coachContext = await getCoachAIProfileContext(input.coachId)
        const prompt = buildPrompt(input, coachContext)

        const raw = await callGemini(prompt, {
            maxOutputTokens: 8192,
            thinkingBudget: 0,
            temperature: 0.4,
        })

        const extracted = extractJson(raw)
        let parsed: unknown

        try {
            parsed = JSON.parse(extracted)
        } catch {
            return { success: false, error: 'La IA devolvió un formato inesperado. Inténtalo de nuevo.' }
        }

        const validated = TrainingProgressAIAnalysisSchema.safeParse(parsed)
        if (!validated.success) {
            console.error('[analyze-training-progress] Validation error:', validated.error.flatten())
            return { success: false, error: 'El análisis generado no tiene el formato esperado. Inténtalo de nuevo.' }
        }

        return { success: true, analysis: validated.data }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        console.error('[analyze-training-progress] Error:', message)
        return { success: false, error: message }
    }
}
