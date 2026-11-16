// Calendario de nutrición: genera los días de un bloque a partir de un punto de partida
// y una progresión. Lo usan la app del coach y el MCP, así los dos calculan igual.
// Fechas como 'YYYY-MM-DD'; el lunes es el primer día de la semana.

const MACROS = ['kcal', 'protein_g', 'carbs_g', 'fat_g']
const KCAL_PER_G = { protein_g: 4, carbs_g: 4, fat_g: 9 }

/** A dónde van las kcal que se suben o se bajan. */
export const KCAL_TARGETS = ['carbs', 'fat', 'carbs_fat']

export const PROGRESSION_TYPES = ['none', 'weekly', 'within_week']

const toDate = (date) => new Date(`${date}T00:00:00Z`)
const fromDate = (d) => d.toISOString().slice(0, 10)

export function addDays(date, days) {
    const d = toDate(date)
    d.setUTCDate(d.getUTCDate() + days)
    return fromDate(d)
}

export function daysBetween(from, to) {
    return Math.round((toDate(to) - toDate(from)) / 86400000)
}

/** 0 = lunes … 6 = domingo */
export function weekdayIndex(date) {
    return (toDate(date).getUTCDay() + 6) % 7
}

export function weekStart(date) {
    return addDays(date, -weekdayIndex(date))
}

export function eachDay(from, to) {
    const out = []
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
    return out
}

const round = (n) => Math.max(0, Math.round(n))

/** Suma (o resta) kcal a un objetivo {kcal, protein_g, carbs_g, fat_g}; la proteína no se toca. */
export function shiftTarget(target, deltaKcal, to = 'carbs') {
    if (!deltaKcal) return { ...target }
    const next = { ...target, kcal: round(target.kcal + deltaKcal) }
    if (to === 'fat') {
        next.fat_g = round(target.fat_g + deltaKcal / KCAL_PER_G.fat_g)
    } else if (to === 'carbs_fat') {
        next.carbs_g = round(target.carbs_g + deltaKcal / 2 / KCAL_PER_G.carbs_g)
        next.fat_g = round(target.fat_g + deltaKcal / 2 / KCAL_PER_G.fat_g)
    } else {
        next.carbs_g = round(target.carbs_g + deltaKcal / KCAL_PER_G.carbs_g)
    }
    return next
}

const pick = (t) => Object.fromEntries(MACROS.map(k => [k, Number(t?.[k]) || 0]))

/**
 * Punto de partida normalizado: objetivo único o entreno/descanso.
 * Con entreno/descanso, los macros de arriba son los de entreno (como pide la base de datos).
 */
export function normalizeBase(base) {
    const cfg = base?.day_type_config
    if (cfg?.training && cfg?.rest) {
        const training = pick(cfg.training), rest = pick(cfg.rest)
        return { ...training, day_type_config: { training, rest }, steps: base.steps ?? null }
    }
    return { ...pick(base), day_type_config: null, steps: base?.steps ?? null }
}

/** Aplica el mismo cambio de kcal a un día, también a los dos juegos de entreno/descanso. */
export function shiftDay(day, deltaKcal, to = 'carbs') {
    const base = normalizeBase(day)
    if (base.day_type_config) {
        const training = shiftTarget(base.day_type_config.training, deltaKcal, to)
        const rest = shiftTarget(base.day_type_config.rest, deltaKcal, to)
        return { ...day, ...training, day_type_config: { training, rest } }
    }
    return { ...day, ...shiftTarget(base, deltaKcal, to), day_type_config: null }
}

/** Cuánto se sube cada día según la progresión. dayIndex cuenta desde el inicio del bloque. */
export function progressionDelta(progression, dayIndex, startDate) {
    const p = progression ?? { type: 'none' }
    const start = Number(p.start_kcal) || 0
    const step = Number(p.step_kcal) || 0
    if (p.type === 'weekly') {
        // Semana 1 = start, semana 2 = start + step… Las semanas son de lunes a domingo.
        const week = Math.floor((weekdayIndex(startDate) + dayIndex) / 7)
        return start + step * week
    }
    if (p.type === 'within_week') {
        // Sube cada día y el lunes vuelve al punto de partida.
        const day = weekdayIndex(addDays(startDate, dayIndex))
        return start + step * day
    }
    return start
}

const sign = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * Días de un bloque: del inicio al fin (incluidos), opcionalmente solo algunos días de la
 * semana (0 = lunes). Cada día parte de `base` y suma lo que diga la progresión.
 * @param {{ start: string, end: string, base: object, progression?: object | null,
 *   weekdays?: number[] | null, label?: string | null, dietPlanId?: string | null }} options
 */
export function buildBlockDays({ start, end, base, progression, weekdays, label, dietPlanId }) {
    if (!start || !end || end < start) throw new Error('Indica un inicio y un fin válidos.')
    if (daysBetween(start, end) > 61) throw new Error('Un bloque puede tener como mucho 62 días.')
    const origin = normalizeBase(base)
    const to = KCAL_TARGETS.includes(progression?.to) ? progression.to : 'carbs'
    return eachDay(start, end)
        .map((date, i) => ({ date, i }))
        .filter(({ date }) => !weekdays?.length || weekdays.includes(weekdayIndex(date)))
        .map(({ date, i }) => {
            const delta = progressionDelta(progression, i, start)
            const day = shiftDay({ ...origin }, delta, to)
            return {
                date,
                ...pick(day),
                day_type_config: day.day_type_config,
                steps: origin.steps,
                label: label ?? (delta ? `${sign(delta)} kcal` : null),
                diet_plan_id: dietPlanId ?? null,
            }
        })
}

/**
 * «Repetir semana»: copia una semana ya resuelta (7 días, de cualquier origen) a la
 * siguiente, sumando plusKcal a cada día.
 */
export function repeatWeek(days, plusKcal = 0, to = 'carbs') {
    return days.map(day => {
        const shifted = shiftDay(normalizeBase(day), plusKcal, to)
        return {
            date: addDays(day.date, 7),
            ...pick(shifted),
            day_type_config: shifted.day_type_config,
            steps: day.steps ?? null,
            label: plusKcal ? `${sign(plusKcal)} kcal` : (day.label ?? null),
            diet_plan_id: day.diet_plan_id ?? null,
        }
    })
}

/** Errores de un día antes de mandarlo a guardar (los mismos límites que la base de datos). */
export function dayErrors(day) {
    const errors = []
    const check = (t, where) => {
        for (const key of MACROS) {
            const v = Number(t?.[key])
            if (!Number.isFinite(v) || v < 0) errors.push(`${where}: ${key} no es válido`)
        }
        if (Number(t?.kcal) > 20000) errors.push(`${where}: demasiadas kcal`)
    }
    if (day.day_type_config) {
        check(day.day_type_config.training, 'Entreno')
        check(day.day_type_config.rest, 'Descanso')
    } else {
        check(day, 'Objetivo')
    }
    return errors
}
