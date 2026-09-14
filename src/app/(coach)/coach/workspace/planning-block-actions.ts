'use server'

import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAIClient } from '@/lib/ai/access'
import { callGemini } from '@/lib/ai/gemini'
import { getCoachAIProfileContext } from '@/lib/ai/coach-profile-context'
import { getAthleteProfileContextForCoach } from '@/lib/ai/athlete-profile-context'
import { getWeeklySchedule } from './planning-actions'
import {
    addDateDays, blockRequestSchema, blockSessionSchema, blockWeekSessionsSchema, buildBlockWeeks,
    getSessionVolume, validateBlockWeek,
    type BlockOutline, type BlockRequest, type BlockWeekSessions,
} from '@/lib/ai/planning-block'

const outlineSchema = z.object({
    id: z.string().uuid(), request: blockRequestSchema,
    summary: z.string().min(1).max(6000),
    warnings: z.array(z.string().max(1500)).max(20), assumptions: z.array(z.string().max(1500)).max(20),
    weeks: z.array(z.object({
        index: z.number().int(), start: z.string(), end: z.string(),
        phase: z.enum(['base', 'build', 'peak', 'deload', 'taper', 'race']),
        targetVolume: z.number(), objective: z.string().min(1).max(2000),
    })).min(2).max(26),
})

function checkedOutline(value: BlockOutline) {
    const outline = outlineSchema.parse(value)
    const expected = buildBlockWeeks(outline.request)
    if (outline.weeks.length !== expected.length || outline.weeks.some((week, index) => {
        const target = expected[index]
        return week.index !== target.index || week.start !== target.start || week.end !== target.end || week.phase !== target.phase || week.targetVolume !== target.targetVolume
    })) throw new Error('El bloque ha cambiado. Genera de nuevo su estructura.')
    return outline
}

function failure(error: unknown) {
    return { success: false as const, error: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Revisa los datos del bloque.' : error instanceof Error ? error.message : 'No se pudo completar la planificación.' }
}

async function contextForBlock(clientId: string, coachId: string, start: string, end: string) {
    const { supabase } = await requireAIClient(clientId, coachId)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const [profile, coach, recent, reviews, events] = await Promise.all([
        getAthleteProfileContextForCoach(coachId, clientId),
        getCoachAIProfileContext(coachId),
        supabase.from('cardio_sessions').select('scheduled_date, is_completed, actual_distance_km, actual_duration_min, rpe, target_distance_km, target_duration_min, name, feedback_notes')
            .eq('client_id', clientId).eq('coach_id', coachId).gte('scheduled_date', addDateDays(today, -28)).lte('scheduled_date', today).order('scheduled_date'),
        supabase.from('checkins').select('submitted_at, notes, training_adherence_pct, sleep_avg_h')
            .eq('client_id', clientId).eq('coach_id', coachId).eq('type', 'checkin').not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false }).limit(3),
        supabase.from('client_events').select('title, event_date, event_type, priority, target, notes')
            .eq('client_id', clientId).eq('coach_id', coachId).gte('event_date', start).lte('event_date', end),
    ])
    for (const result of [recent, reviews, events]) if (result.error) throw new Error('No se pudo cargar el contexto actual del atleta. Inténtalo de nuevo.')
    return { profile, coach, today, recentTraining: recent.data, recentReviews: reviews.data, events: events.data }
}

async function calendarSnapshot(clientId: string, start: string, end: string, blockId: string) {
    const result = await getWeeklySchedule(clientId, new Date(`${start}T12:00:00`), new Date(`${end}T12:00:00`))
    if (!result.success || !result.data) throw new Error(result.error || 'No se pudo leer el calendario.')
    const items = result.data.items.filter(item => item.type !== 'cardio' || (item.structure as any)?.aiPlan?.id !== blockId)
    const serialized = items.map(item => item.type === 'strength'
        ? { id: item.id, date: item.date, type: item.type, completed: item.is_completed, title: item.training_days?.name }
        : { id: item.id, date: item.date, type: item.type, completed: item.is_completed, title: item.name, details: item.description, structure: item.structure, km: item.target_distance_km, min: item.target_duration_min })
        .sort((a, b) => a.id.localeCompare(b.id))
    return { items, fingerprint: createHash('sha256').update(JSON.stringify(serialized)).digest('hex') }
}

function matchingVolume(snapshot: Awaited<ReturnType<typeof calendarSnapshot>>, request: BlockRequest) {
    return snapshot.items.reduce((sum, item) => {
        if (item.type !== 'cardio') return sum
        const type = item.structure?.trainingType ?? 'rodaje'
        const matches = request.sport === 'running' ? !['bike', 'swim', 'hybrid'].includes(type) : type === request.sport
        // The competition itself is reported separately from taper training volume.
        const event = item.date === request.eventDate && request.eventDistanceKm && Math.abs((item.target_distance_km ?? 0) - request.eventDistanceKm) < 0.01
        return sum + (matches && !event ? request.unit === 'km' ? item.target_distance_km ?? 0 : item.target_duration_min ?? 0 : 0)
    }, 0)
}

function validateVolume(outline: BlockOutline, index: number, detail: BlockWeekSessions, snapshot: Awaited<ReturnType<typeof calendarSnapshot>>) {
    const week = outline.weeks[index - 1]
    validateBlockWeek(outline.request, week, detail.sessions)
    const existing = matchingVolume(snapshot, outline.request)
    const generated = detail.sessions.filter(session => session.purpose !== 'event').reduce((sum, session) => sum + getSessionVolume(session, outline.request.unit), 0)
    if (existing > week.targetVolume * 1.05) throw new Error(`Semana ${index}: el calendario ya supera el objetivo de volumen. Ajusta esas sesiones o revisa el bloque.`)
    if (Math.abs(existing + generated - week.targetVolume) > Math.max(0.5, week.targetVolume * 0.05)) {
        throw new Error(`Semana ${index}: el volumen de las sesiones (${(existing + generated).toFixed(1)} ${outline.request.unit}) no cuadra con el objetivo (${week.targetVolume}). Vuelve a generar esta semana.`)
    }
    if (week.end === outline.request.eventDate && outline.request.eventDistanceKm) {
        const eventAlreadyExists = snapshot.items.some(item => item.type === 'cardio' && item.date === outline.request.eventDate && Math.abs((item.target_distance_km ?? 0) - outline.request.eventDistanceKm!) < 0.01)
        const newEvents = detail.sessions.filter(session => session.purpose === 'event').length
        if (newEvents !== (eventAlreadyExists ? 0 : 1)) throw new Error('La competición debe aparecer exactamente una vez en la fecha objetivo.')
    }
}

export async function generatePlanningBlockOutlineAction(input: { clientId: string; coachId: string; request: BlockRequest }) {
    try {
        const { coachId } = await requireAIClient(input.clientId, input.coachId)
        const request = blockRequestSchema.parse(input.request)
        const weeks = buildBlockWeeks(request)
        const context = await contextForBlock(input.clientId, coachId, weeks[0].start, request.eventDate)
        if (weeks[0].start < context.today) throw new Error('El bloque empezaría en el pasado. Reduce las semanas o cambia la fecha objetivo.')
        const schema = z.object({
            summary: z.string().min(1).max(6000),
            warnings: z.array(z.string().max(1500)).max(12), assumptions: z.array(z.string().max(1500)).max(12),
            weeks: z.array(z.object({ index: z.number().int(), objective: z.string().min(1).max(2000) })),
        })
        const raw = await callGemini(`Prepara un bloque completo para un entrenador, hasta una fecha objetivo.
Los parámetros numéricos y fechas de weeks son una distribución inicial calculada desde las preferencias explícitas del coach. No cambies estos valores: explica la periodización y señala si no es realista para el historial disponible.
El volumen es de la disciplina indicada, por microciclo de 7 días, y excluye la competición final. Las descargas reducen 25% respecto al microciclo anterior y el tapering reduce progresivamente la carga: son propuestas revisables, no reglas universales.
Evalúa la carga inicial y el pico contra las últimas 4 semanas reales, la disponibilidad, fuerza y molestias. Si el salto es excesivo, indícalo en warnings con una alternativa concreta; no inventes historial ni confirmes que el pico es seguro.
En cada objetivo semanal concreta el foco, distribución de intensidad, tirada larga si corresponde, recuperación e interacción con fuerza. La última semana debe llegar al evento; las descargas y tapering tienen prioridad sobre construcción.
Devuelve SOLO JSON: {"summary":"...","warnings":[],"assumptions":[],"weeks":[{"index":1,"objective":"..."}]}.
Devuelve exactamente una entrada por semana, en orden. Respeta las instrucciones del coach y explica conflictos en warnings.
Datos: ${JSON.stringify({ request, weeks, context })}`, { responseMimeType: 'application/json', thinkingLevel: 'high', maxOutputTokens: 16000 })
        const parsed = schema.parse(JSON.parse(raw))
        if (parsed.weeks.length !== weeks.length || parsed.weeks.some((week, index) => week.index !== index + 1)) throw new Error('La IA no devolvió todas las semanas en orden. Inténtalo de nuevo.')
        const warnings = [...parsed.warnings]
        if (Math.max(...weeks.map(week => week.targetVolume)) < request.peakVolume) warnings.push('Con estas semanas y descargas no hay espacio para alcanzar el pico indicado. Amplía el bloque o revisa el objetivo.')
        return { success: true as const, outline: { id: randomUUID(), request, summary: parsed.summary, warnings, assumptions: parsed.assumptions, weeks: weeks.map((week, index) => ({ ...week, objective: parsed.weeks[index].objective })) } satisfies BlockOutline }
    } catch (error) { return failure(error) }
}

export async function generatePlanningBlockWeekAction(input: { clientId: string; coachId: string; outline: BlockOutline; index: number; previousWeek?: BlockWeekSessions }) {
    try {
        const { coachId } = await requireAIClient(input.clientId, input.coachId)
        const outline = checkedOutline(input.outline)
        const index = z.number().int().min(1).max(outline.weeks.length).parse(input.index)
        const week = outline.weeks[index - 1]
        const [context, snapshot] = await Promise.all([
            contextForBlock(input.clientId, coachId, week.start, week.end),
            calendarSnapshot(input.clientId, week.start, week.end, outline.id),
        ])
        const previousWeek = input.previousWeek ? blockWeekSessionsSchema.parse(input.previousWeek) : null
        const responseSchema = z.object({
            sessions: z.array(blockSessionSchema.omit({ id: true })).max(14),
            rationale: z.string().min(1).max(4000), warnings: z.array(z.string().max(1000)).max(12),
        })
        const existingVolume = matchingVolume(snapshot, outline.request)
        if (existingVolume > week.targetVolume * 1.05) throw new Error(`Semana ${index}: ya hay ${existingVolume} ${outline.request.unit} programados, por encima del objetivo ${week.targetVolume}. Revisa el calendario antes de continuar.`)
        const task = `Genera las sesiones diarias de UN microciclo dentro del bloque adjunto. Usa el bloque entero y la semana anterior para mantener continuidad, progresión y recuperación.
Respeta EXACTAMENTE ${week.start} a ${week.end}, disponibilidad ISO 1=lunes a 7=domingo y disciplina. Las sesiones existentes son fijas; solo añade lo que falte. No dupliques cardio ni fuerza. Ten en cuenta fuerza para espaciar estímulos exigentes.
La suma del volumen de entrenamiento de esta disciplina entre lo existente (${existingVolume} ${outline.request.unit}) y tus sesiones nuevas debe ser ${week.targetVolume} ${outline.request.unit}, tolerancia 5%. No cuentes la competición en este volumen. Cada sesión debe tener un número positivo en la unidad elegida.
Solo si esta semana contiene la fecha objetivo y eventDistanceKm está definido, incluye la competición con purpose=event y distancia exacta, salvo que ya exista. La competición puede caer fuera de los días habituales. No pongas otra sesión exigente ese día.
El pico, descargas y tapering deben verse en las sesiones reales. No inventes ritmos absolutos sin umbrales o marcas; usa RPE/ritmo conversacional con objetivo claro. En details usa Calentamiento, Bloque principal, Recuperación y Vuelta a la calma cuando corresponda; todas las distancias y minutos incluyen esos bloques.
Devuelve SOLO JSON {"rationale":"...","warnings":[],"sessions":[{"date":"YYYY-MM-DD","title":"...","trainingType":"rodaje|series|tempo|fartlek|progressive|bike|swim|hybrid","purpose":"training|event","distanceKm":8,"durationMin":45,"details":"Objetivo:\\n- ...\\nSesión:\\n- ...","notes":"..."}]}.
Máximo dos sesiones nuevas por día; descanso se representa sin sesión. Los números desconocidos serán null. No incluyas sesiones de fuerza nuevas.
Datos: ${JSON.stringify({ outline, week, context, existingCalendar: snapshot.items, previousWeek })}`
        // One targeted repair keeps the coach from having to debug model arithmetic or dates.
        let correction = ''
        for (let attempt = 0; attempt < 2; attempt++) {
            const raw = await callGemini(task + correction, { responseMimeType: 'application/json', thinkingLevel: 'medium', maxOutputTokens: 12000 })
            try {
                const parsed = responseSchema.parse(JSON.parse(raw))
                const detail: BlockWeekSessions = { ...parsed, index, existingFingerprint: snapshot.fingerprint, sessions: parsed.sessions.map(session => ({ ...session, id: randomUUID() })) }
                validateVolume(outline, index, detail, snapshot)
                return { success: true as const, week: detail }
            } catch (error) {
                if (attempt === 1) throw error
                correction = `\nLa respuesta anterior no pasó validación: ${failure(error).error}. Corrige el problema y devuelve el JSON completo de la semana. Respuesta anterior: ${raw}`
            }
        }
        throw new Error('No se pudo generar la semana.')
    } catch (error) { return failure(error) }
}

export async function applyPlanningBlockAction(input: { clientId: string; coachId: string; outline: BlockOutline; weeks: BlockWeekSessions[] }) {
    try {
        const { supabase, coachId } = await requireAIClient(input.clientId, input.coachId)
        const outline = checkedOutline(input.outline)
        const weeks = z.array(blockWeekSessionsSchema).length(outline.weeks.length).parse(input.weeks)
        if (weeks.some((week, index) => week.index !== index + 1)) throw new Error('Faltan semanas por generar o están desordenadas.')
        const allSessions = weeks.flatMap(week => week.sessions)
        if (!allSessions.length) throw new Error('No hay sesiones nuevas que añadir.')
        if (new Set(allSessions.map(session => session.id)).size !== allSessions.length) throw new Error('Hay sesiones duplicadas en el bloque.')
        // Check the entire proposal before the single atomic INSERT statement.
        for (const detail of weeks) {
            const week = outline.weeks[detail.index - 1]
            const snapshot = await calendarSnapshot(input.clientId, week.start, week.end, outline.id)
            if (snapshot.fingerprint !== detail.existingFingerprint) throw new Error(`El calendario cambió en la semana ${detail.index}. Vuelve a generar las sesiones para integrar los cambios.`)
            validateVolume(outline, detail.index, detail, snapshot)
        }
        const rows = weeks.flatMap(detail => {
            const week = outline.weeks[detail.index - 1]
            return detail.sessions.map(session => ({
                id: session.id, client_id: input.clientId, coach_id: coachId,
                scheduled_date: session.date, name: session.title, description: session.details,
                notes: [`${outline.request.title} · Semana ${detail.index} · ${week.objective}`, session.notes].filter(Boolean).join('\n'),
                structure: { mode: 'free_text', trainingType: session.trainingType, description: session.details, blocks: [],
                    aiPlan: { id: outline.id, title: outline.request.title, eventDate: outline.request.eventDate, start: outline.weeks[0].start, weeks: outline.weeks.length, weekIndex: detail.index, phase: week.phase, targetVolume: week.targetVolume, unit: outline.request.unit, purpose: session.purpose } },
                is_completed: false, target_distance_km: session.distanceKm, target_duration_min: session.durationMin, target_pace: null,
            }))
        })
        // Stable proposal IDs make retrying after a lost response safe; never update existing sessions.
        const { error } = await supabase.from('cardio_sessions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error('No se pudo guardar el bloque completo. Puedes reintentar sin duplicar sesiones.')
        const { data: saved, error: verifyError } = await supabase.from('cardio_sessions').select('id, structure')
            .eq('client_id', input.clientId).eq('coach_id', coachId).in('id', rows.map(row => row.id))
        if (verifyError || saved?.length !== rows.length || saved.some(row => row.structure?.aiPlan?.id !== outline.id)) {
            throw new Error('No se pudo verificar el guardado completo. Reintenta aplicar el mismo bloque.')
        }
        revalidatePath('/coach/clients')
        revalidatePath('/planning')
        return { success: true as const, count: rows.length }
    } catch (error) { return failure(error) }
}
