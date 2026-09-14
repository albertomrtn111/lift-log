import { z } from 'zod'

export function addDateDays(date: string, days: number) {
    const value = new Date(`${date}T12:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Fecha inválida')

export const blockRequestSchema = z.object({
    title: z.string().trim().min(3).max(160),
    eventDate: dateSchema,
    weeks: z.number().int().min(2).max(26),
    sport: z.enum(['running', 'bike', 'swim', 'hybrid']),
    unit: z.enum(['km', 'min']),
    currentVolume: z.number().positive().max(5000),
    peakVolume: z.number().positive().max(5000),
    deloadEvery: z.number().int().min(0).max(8),
    taperWeeks: z.number().int().min(0).max(6),
    trainingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    eventDistanceKm: z.number().positive().max(500).nullable(),
    instructions: z.string().trim().max(6000),
}).superRefine((value, ctx) => {
    if (value.taperWeeks >= value.weeks) ctx.addIssue({ code: 'custom', message: 'El tapering debe dejar al menos una semana de preparación.' })
    if (value.deloadEvery === 1) ctx.addIssue({ code: 'custom', message: 'La descarga debe ser cada 2 o más semanas, o 0 para desactivarla.' })
    if (value.peakVolume < value.currentVolume) ctx.addIssue({ code: 'custom', message: 'El pico debe ser igual o superior al volumen inicial.' })
    if (new Set(value.trainingDays).size !== value.trainingDays.length) ctx.addIssue({ code: 'custom', message: 'Hay días disponibles duplicados.' })
    if (value.sport === 'hybrid' && value.unit !== 'min') ctx.addIssue({ code: 'custom', message: 'Usa minutos para el volumen híbrido.' })
})

export type BlockRequest = z.infer<typeof blockRequestSchema>
export type BlockPhase = 'base' | 'build' | 'peak' | 'deload' | 'taper' | 'race'
export const BLOCK_PHASE_LABELS: Record<BlockPhase, string> = {
    base: 'Base', build: 'Construcción', peak: 'Pico', deload: 'Descarga', taper: 'Tapering', race: 'Semana objetivo',
}
export interface BlockWeek {
    index: number
    start: string
    end: string
    phase: BlockPhase
    targetVolume: number
    objective: string
}
export interface BlockOutline {
    id: string
    request: BlockRequest
    summary: string
    warnings: string[]
    assumptions: string[]
    weeks: BlockWeek[]
}

/** Exact seven-day microcycles ending on the target date; UTC avoids DST drift. */
export function buildBlockWeeks(request: BlockRequest): BlockWeek[] {
    const input = blockRequestSchema.parse(request)
    const start = addDateDays(input.eventDate, 1 - input.weeks * 7)
    const preparation = input.weeks - input.taperWeeks
    const loadWeeks = Array.from({ length: preparation }, (_, index) => index + 1)
        .filter(index => !input.deloadEvery || index % input.deloadEvery !== 0)
    const peakWeek = loadWeeks[loadWeeks.length - 1]
    let previous = input.currentVolume
    return Array.from({ length: input.weeks }, (_, offset) => {
        const index = offset + 1
        const taperIndex = index - preparation
        const isDeload = taperIndex <= 0 && input.deloadEvery > 0 && index % input.deloadEvery === 0
        let phase: BlockPhase
        let volume: number
        if (taperIndex > 0) {
            phase = index === input.weeks ? 'race' : 'taper'
            // Explicit starting proposal, reviewed by the coach before daily generation.
            volume = Math.min(input.peakVolume * (1 - 0.55 * taperIndex / input.taperWeeks), previous * 0.9)
        } else if (isDeload) {
            phase = 'deload'
            volume = previous * 0.75
        } else {
            const position = loadWeeks.indexOf(index)
            volume = loadWeeks.length > 1
                ? input.currentVolume + (input.peakVolume - input.currentVolume) * position / (loadWeeks.length - 1)
                : input.currentVolume
            phase = index === peakWeek ? 'peak' : position < Math.ceil(loadWeeks.length / 3) ? 'base' : 'build'
        }
        previous = Math.round(volume * 10) / 10
        return { index, start: addDateDays(start, offset * 7), end: addDateDays(start, offset * 7 + 6), phase, targetVolume: previous, objective: '' }
    })
}

export const blockSessionSchema = z.object({
    id: z.string().uuid(),
    date: dateSchema,
    title: z.string().trim().min(1).max(160),
    trainingType: z.enum(['rodaje', 'series', 'tempo', 'fartlek', 'progressive', 'bike', 'swim', 'hybrid']),
    purpose: z.enum(['training', 'event']),
    distanceKm: z.number().positive().max(500).nullable(),
    durationMin: z.number().positive().max(1440).nullable(),
    details: z.string().trim().min(10).max(5000),
    notes: z.string().max(2000),
})
export const blockWeekSessionsSchema = z.object({
    index: z.number().int().min(1).max(26),
    sessions: z.array(blockSessionSchema).max(14),
    rationale: z.string().min(1).max(4000),
    warnings: z.array(z.string().max(1000)).max(12),
    existingFingerprint: z.string(),
})
export type BlockSession = z.infer<typeof blockSessionSchema>
export type BlockWeekSessions = z.infer<typeof blockWeekSessionsSchema>

export function getSessionVolume(session: Pick<BlockSession, 'distanceKm' | 'durationMin'>, unit: BlockRequest['unit']) {
    return (unit === 'km' ? session.distanceKm : session.durationMin) ?? 0
}

export function validateBlockWeek(request: BlockRequest, week: BlockWeek, sessions: BlockSession[]) {
    const ids = new Set<string>()
    const days = new Map<string, number>()
    for (const raw of sessions) {
        const session = blockSessionSchema.parse(raw)
        if (ids.has(session.id)) throw new Error('Sesión duplicada en la propuesta.')
        ids.add(session.id)
        if (session.date < week.start || session.date > week.end) throw new Error('Una sesión queda fuera de su semana.')
        const weekday = new Date(`${session.date}T12:00:00Z`).getUTCDay() || 7
        if (session.purpose === 'event') {
            if (session.date !== request.eventDate || !request.eventDistanceKm) throw new Error('La competición no coincide con el objetivo fechado.')
            if (Math.abs((session.distanceKm ?? 0) - request.eventDistanceKm) > 0.01) throw new Error('La distancia de competición no coincide con el objetivo.')
        } else if (!request.trainingDays.includes(weekday)) throw new Error('Hay entrenamiento en un día no disponible.')
        const validType = request.sport === 'running' ? !['bike', 'swim', 'hybrid'].includes(session.trainingType) : session.trainingType === request.sport
        if (!validType) throw new Error('La disciplina de una sesión no coincide con el bloque.')
        if (session.purpose !== 'event' && getSessionVolume(session, request.unit) <= 0) throw new Error('Cada sesión debe indicar su volumen en la unidad elegida.')
        days.set(session.date, (days.get(session.date) ?? 0) + 1)
        if (days.get(session.date)! > 2) throw new Error('La propuesta supera dos sesiones nuevas en un día.')
    }
    if (sessions.filter(session => session.purpose === 'event').length > 1) throw new Error('La competición aparece más de una vez.')
}
