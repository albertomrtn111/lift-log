import 'server-only'

import { z } from 'zod'
import { callGemini } from '@/lib/ai/gemini'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'
import type {
    PlanningAICardioType,
    PlanningAIPlannedSession,
    StrengthSessionSourceKind,
    UnifiedCalendarItem,
    WeeklyPlanningAIProposal,
} from '@/types/planning'

const PLANNING_AI_CARDIO_TYPES = [
    'rodaje',
    'series',
    'tempo',
    'fartlek',
    'progressive',
    'bike',
    'swim',
] as const satisfies readonly PlanningAICardioType[]

interface WeeklyPlanningAIInput {
    coachId: string
    clientId: string
    weekStart: string
    weekEnd: string
    prompt: string
    items: UnifiedCalendarItem[]
    overview?: {
        programName?: string | null
        currentWeek?: number | null
        totalWeeks?: number | null
        phaseLabel?: string | null
        weeklyObjective?: string | null
    } | null
}

interface AvailableStrengthSessionRef {
    ref: string
    title: string
    sourceDate: string
    sourceKind: StrengthSessionSourceKind
}

const numericOptional = z.preprocess(
    (value) => (value === null || value === undefined || value === '' ? undefined : Number(value)),
    z.number().min(0).optional()
)

const RawCardioSessionSchema = z.object({
    trainingType: z.enum(PLANNING_AI_CARDIO_TYPES),
    title: z.string().min(1),
    distanceKm: numericOptional.nullable().optional(),
    durationMin: numericOptional.nullable().optional(),
    details: z.string().min(1),
    notes: z.string().optional().default(''),
})

const RawHybridSessionSchema = z.object({
    title: z.string().min(1),
    durationMin: numericOptional.nullable().optional(),
    details: z.string().min(1),
    notes: z.string().optional().default(''),
})

const RawPlanningDaySchema = z.object({
    date: z.string().min(1),
    summary: z.string().min(1),
    strengthRefs: z.array(z.string().min(1)).default([]),
    cardioSessions: z.array(RawCardioSessionSchema).default([]),
    hybridSessions: z.array(RawHybridSessionSchema).default([]),
})

const RawWeeklyPlanningAIResponseSchema = z.object({
    overview: z.string().min(1),
    rationale: z.string().min(1),
    assumptions: z.array(z.string()).default([]),
    warnings: z.array(z.string()).default([]),
    days: z.array(RawPlanningDaySchema).default([]),
})

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

function parseLocalDate(value: string) {
    return new Date(`${value}T12:00:00`)
}

function toLocalDateStr(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function getWeekDates(weekStart: string, weekEnd: string) {
    const dates: string[] = []
    let cursor = parseLocalDate(weekStart)
    const end = parseLocalDate(weekEnd)

    while (cursor <= end) {
        dates.push(toLocalDateStr(cursor))
        cursor = new Date(cursor)
        cursor.setDate(cursor.getDate() + 1)
    }

    return dates
}

function getWeekdayLabel(date: string) {
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(parseLocalDate(date))
}

function getStrengthRef(item: Extract<UnifiedCalendarItem, { type: 'strength' }>) {
    return item.id.startsWith('virtual-')
        ? `virtual:${item.training_day_id}`
        : `scheduled:${item.id}`
}

function getStrengthTitle(item: Extract<UnifiedCalendarItem, { type: 'strength' }>) {
    return item.training_days?.name || item.training_programs?.name || 'Sesión de fuerza'
}

function getCardioTypeLabel(type?: string) {
    const labels: Record<string, string> = {
        rodaje: 'Rodaje',
        series: 'Series',
        tempo: 'Tempo',
        fartlek: 'Fartlek',
        progressive: 'Progresivos',
        bike: 'Bicicleta',
        swim: 'Natación',
        hybrid: 'Híbrido',
    }

    if (!type) return 'Cardio'
    return labels[type] || type
}

function getCardioSummary(item: Extract<UnifiedCalendarItem, { type: 'cardio' }>) {
    const parts: string[] = []
    if (item.target_distance_km) parts.push(`${item.target_distance_km} km`)
    if (item.target_duration_min) parts.push(`${item.target_duration_min} min`)
    if (item.target_pace) parts.push(item.target_pace)
    return parts.join(' · ')
}

function cleanDetailLine(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .replace(/\s*:\s*/g, ': ')
        .trim()
}

function splitDetailSentences(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
}

function formatSection(label: string, lines: string[]) {
    if (lines.length === 0) return null
    return `${label}:\n${lines.map((line) => `- ${cleanDetailLine(line).replace(/[.]+$/, '')}`).join('\n')}`
}

function normalizeStructuredSessionDetails(
    details: string,
    kind: PlanningAIPlannedSession['kind'],
    trainingType?: PlanningAICardioType
) {
    const trimmed = details.trim()
    if (!trimmed) return trimmed

    const normalizedNewlines = trimmed
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    if (/\n/.test(normalizedNewlines) && /:\s*\n?-/.test(normalizedNewlines)) {
        return normalizedNewlines
    }

    const sentences = splitDetailSentences(normalizedNewlines)
    if (sentences.length === 0) return normalizedNewlines

    const warmup: string[] = []
    const main: string[] = []
    const recovery: string[] = []
    const cooldown: string[] = []
    const notes: string[] = []

    for (const sentence of sentences) {
        const lower = sentence.toLowerCase()
        if (/calentamiento|movilidad|progresiones/.test(lower)) {
            warmup.push(sentence)
            continue
        }
        if (/vuelta a la calma|enfriamiento|estiramientos?/.test(lower)) {
            cooldown.push(sentence)
            continue
        }
        if (/recuperaci[oó]n|descanso|trote suave entre|pausa/.test(lower)) {
            recovery.push(sentence)
            continue
        }
        if (/objetivo|sensaciones|no forzar|controla|prioriza|hidrat|t[ée]cnica|ritmo conversacional/.test(lower)) {
            notes.push(sentence)
            continue
        }
        main.push(sentence)
    }

    if (kind === 'hybrid') {
        const sections = [
            formatSection('Calentamiento', warmup),
            formatSection('Bloque principal', main),
            formatSection('Recuperación', recovery),
            formatSection('Vuelta a la calma', cooldown),
            formatSection('Notas', notes),
        ].filter(Boolean)

        return sections.length > 0 ? sections.join('\n\n') : normalizedNewlines
    }

    const structuredTypes = new Set<PlanningAICardioType>(['series', 'tempo', 'fartlek', 'progressive'])

    if (trainingType && structuredTypes.has(trainingType)) {
        const sections = [
            formatSection('Calentamiento', warmup),
            formatSection('Bloque principal', main),
            formatSection('Recuperación', recovery),
            formatSection('Vuelta a la calma', cooldown),
            formatSection('Notas', notes),
        ].filter(Boolean)

        return sections.length > 0 ? sections.join('\n\n') : normalizedNewlines
    }

    const sessionLines = [...main, ...recovery]
    const sections = [
        formatSection('Objetivo', notes.slice(0, 1)),
        formatSection('Sesión', sessionLines.length > 0 ? sessionLines : sentences),
        formatSection('Notas', notes.slice(1)),
    ].filter(Boolean)

    return sections.length > 0 ? sections.join('\n\n') : normalizedNewlines
}

function buildPrompt(
    input: WeeklyPlanningAIInput,
    coachContext: string,
    availableStrength: AvailableStrengthSessionRef[]
) {
    const weekDates = getWeekDates(input.weekStart, input.weekEnd)

    const dayContext = weekDates.map((date) => {
        const dayItems = input.items.filter((item) => item.date === date)
        return {
            date,
            weekday: getWeekdayLabel(date),
            strengthSessions: dayItems
                .filter((item): item is Extract<UnifiedCalendarItem, { type: 'strength' }> => item.type === 'strength')
                .map((item) => ({
                    ref: getStrengthRef(item),
                    title: getStrengthTitle(item),
                    sourceKind: item.source_kind || 'manual',
                })),
            cardioSessions: dayItems
                .filter((item): item is Extract<UnifiedCalendarItem, { type: 'cardio' }> => item.type === 'cardio')
                .map((item) => ({
                    title: item.name || 'Cardio',
                    trainingType: item.structure?.trainingType || 'rodaje',
                    summary: getCardioSummary(item),
                    description: item.description || '',
                    notes: item.notes || '',
                })),
        }
    })

    const payload = {
        week: {
            start: input.weekStart,
            end: input.weekEnd,
        },
        program: {
            name: input.overview?.programName || null,
            currentWeek: input.overview?.currentWeek ?? null,
            totalWeeks: input.overview?.totalWeeks ?? null,
            phaseLabel: input.overview?.phaseLabel || null,
            weeklyObjective: input.overview?.weeklyObjective || null,
        },
        availableStrengthSessions: availableStrength,
        dayContext,
        coachPrompt: input.prompt.trim(),
    }

    return `${coachContext}
Eres el asistente de planificación semanal de un coach profesional.
Tu trabajo es organizar SOLO la semana visible actual del cliente y devolver una propuesta estructurada que luego se pueda aplicar sobre el calendario.

## Reglas clave
- Trabaja SOLO entre ${input.weekStart} y ${input.weekEnd}.
- No crees sesiones de fuerza nuevas desde cero.
- Para fuerza usa EXCLUSIVAMENTE las referencias disponibles en "availableStrengthSessions".
- Cada referencia de fuerza debe aparecer como máximo una vez en "strengthRefs" dentro del conjunto de días.
- Si quieres mantener una fuerza en su mismo día, incluye igualmente su ref en ese día.
- No reescribas el contenido interno de fuerza; solo decide en qué día cae esa sesión ya existente.
- Las sesiones de cardio e híbrido existentes en la semana son contexto: esta propuesta no las borra ni las edita, solo añade nuevas si lo consideras útil.
- Para cardio usa SOLO estos valores exactos en "trainingType": rodaje, series, tempo, fartlek, progressive, bike, swim.
- Para híbridos usa "hybridSessions", nunca "cardioSessions".
- En cardio e híbridos, "details" NO debe ser un párrafo corrido. Debe ir en texto plano estructurado con bloques y saltos de línea.
- Usa etiquetas simples y legibles como "Calentamiento:", "Bloque principal:", "Recuperación:", "Vuelta a la calma:" y "Notas:" cuando tenga sentido.
- Debajo de cada bloque usa líneas cortas con prefijo "- ".
- Para rodajes o sesiones simples usa una estructura limpia tipo "Objetivo:", "Sesión:" y "Notas:".
- En cardio intenta rellenar distancia y/o duración cuando tenga sentido.
- Si un día queda libre, refleja igualmente un summary útil para ese día.

## Instrucción del coach
${input.prompt.trim()}

## Datos estructurados de la semana
${JSON.stringify(payload, null, 2)}

## Formato de salida
Responde ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "overview": "Resumen ejecutivo de cómo queda organizada la semana.",
  "rationale": "Lógica global de la propuesta y por qué tiene sentido.",
  "assumptions": ["Supuesto 1"],
  "warnings": ["Riesgo o matiz 1"],
  "days": [
    {
      "date": "YYYY-MM-DD",
      "summary": "Qué ocurre ese día y por qué.",
      "strengthRefs": ["scheduled:abc", "virtual:def"],
      "cardioSessions": [
        {
          "trainingType": "series",
          "title": "Series 8x400",
          "distanceKm": 8,
          "durationMin": 45,
          "details": "Calentamiento:\n- 15 min suaves\n- movilidad dinámica y 3 progresiones\n\nBloque principal:\n- 8 x 400 m a ritmo 5K\n\nRecuperación:\n- 1 min de trote suave entre repeticiones\n\nVuelta a la calma:\n- 10 min suaves",
          "notes": "Prioriza calidad y técnica."
        }
      ],
      "hybridSessions": [
        {
          "title": "Híbrido tipo Hyrox",
          "durationMin": 40,
          "details": "Calentamiento:\n- 10 min de activación general\n\nBloque principal:\n- 4 bloques combinando carrera, empujes y trabajo funcional\n\nVuelta a la calma:\n- 5-8 min suaves",
          "notes": "Controla pulsaciones y no apures al fallo."
        }
      ]
    }
  ]
}

## Requisitos de calidad
- Usa español.
- Sé concreto, útil y profesional.
- No inventes datos del cliente que no existan.
- No planifiques fuera de los 7 días visibles.
- Máximo 2 sesiones nuevas por día.
- Si el coach pide mover la fuerza, debe verse claramente en strengthRefs.
- Si no hace falta añadir nada en un día, deja cardioSessions y hybridSessions vacíos.`
}

function normalizePlanningDay(
    rawDay: z.infer<typeof RawPlanningDaySchema> | undefined,
    date: string
) {
    return {
        date,
        summary: rawDay?.summary?.trim() || 'Día libre o sin cambios propuestos.',
        strengthRefs: rawDay?.strengthRefs ?? [],
        newSessions: [
            ...(rawDay?.cardioSessions ?? []).map((session) => ({
                kind: 'cardio' as const,
                trainingType: session.trainingType,
                title: session.title.trim(),
                distanceKm: session.distanceKm ?? null,
                durationMin: session.durationMin ?? null,
                details: normalizeStructuredSessionDetails(session.details, 'cardio', session.trainingType),
                notes: session.notes?.trim() || undefined,
            })),
            ...(rawDay?.hybridSessions ?? []).map((session) => ({
                kind: 'hybrid' as const,
                title: session.title.trim(),
                durationMin: session.durationMin ?? null,
                details: normalizeStructuredSessionDetails(session.details, 'hybrid'),
                notes: session.notes?.trim() || undefined,
            })),
        ] satisfies PlanningAIPlannedSession[],
    }
}

function normalizeProposal(
    input: WeeklyPlanningAIInput,
    raw: z.infer<typeof RawWeeklyPlanningAIResponseSchema>,
    availableStrength: AvailableStrengthSessionRef[]
): WeeklyPlanningAIProposal {
    const weekDates = getWeekDates(input.weekStart, input.weekEnd)
    const rawDays = new Map(raw.days.map((day) => [day.date, day]))
    const strengthMap = new Map(availableStrength.map((item) => [item.ref, item]))

    const assignedByDay = new Map(
        weekDates.map((date) => {
            const normalized = normalizePlanningDay(rawDays.get(date), date)
            return [date, normalized]
        })
    )

    const seenStrengthRefs = new Set<string>()
    for (const date of weekDates) {
        const day = assignedByDay.get(date)
        if (!day) continue
        day.strengthRefs = day.strengthRefs.filter((ref) => {
            if (!strengthMap.has(ref) || seenStrengthRefs.has(ref)) return false
            seenStrengthRefs.add(ref)
            return true
        })
    }

    for (const strength of availableStrength) {
        if (seenStrengthRefs.has(strength.ref)) continue
        const fallbackDay = assignedByDay.get(strength.sourceDate)
        if (fallbackDay) {
            fallbackDay.strengthRefs.push(strength.ref)
            seenStrengthRefs.add(strength.ref)
        }
    }

    return {
        coachPrompt: input.prompt.trim(),
        overview: raw.overview.trim(),
        rationale: raw.rationale.trim(),
        existingCardioPolicy: 'Las sesiones de cardio e híbridos que ya existían en la semana se mantienen. Esta propuesta solo mueve fuerza y añade nuevas sesiones.',
        assumptions: raw.assumptions.map((item) => item.trim()).filter(Boolean).slice(0, 5),
        warnings: raw.warnings.map((item) => item.trim()).filter(Boolean).slice(0, 5),
        days: weekDates.map((date) => {
            const day = assignedByDay.get(date)!
            return {
                date,
                weekdayLabel: getWeekdayLabel(date),
                summary: day.summary,
                strengthAssignments: day.strengthRefs
                    .map((ref) => strengthMap.get(ref))
                    .filter((item): item is AvailableStrengthSessionRef => Boolean(item))
                    .map((item) => ({
                        ref: item.ref,
                        title: item.title,
                        sourceDate: item.sourceDate,
                        targetDate: date,
                        action: item.sourceDate === date ? 'keep' as const : 'move' as const,
                        sourceKind: item.sourceKind,
                    })),
                newSessions: day.newSessions.slice(0, 2),
            }
        }),
    }
}

export async function generateWeeklyPlanningProposal(
    input: WeeklyPlanningAIInput
): Promise<{ success: boolean; proposal?: WeeklyPlanningAIProposal; error?: string }> {
    try {
        const availableStrength: AvailableStrengthSessionRef[] = input.items
            .filter((item): item is Extract<UnifiedCalendarItem, { type: 'strength' }> => item.type === 'strength')
            .map((item) => ({
                ref: getStrengthRef(item),
                title: getStrengthTitle(item),
                sourceDate: item.date,
                sourceKind: item.source_kind || 'manual',
            }))

        const coachContext = await getCoachAIProfileContext(input.coachId)
        const prompt = buildPrompt(input, coachContext, availableStrength)

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

        const validated = RawWeeklyPlanningAIResponseSchema.safeParse(parsed)
        if (!validated.success) {
            console.error('[generate-weekly-planning] Validation error:', validated.error.flatten())
            return { success: false, error: 'La propuesta generada no tiene el formato esperado. Inténtalo de nuevo.' }
        }

        return {
            success: true,
            proposal: normalizeProposal(input, validated.data, availableStrength),
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        console.error('[generate-weekly-planning] Error:', message)
        return { success: false, error: message }
    }
}
