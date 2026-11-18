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

/** Gramos que se pueden subir o bajar en una progresión por gramos. */
export const GRAM_MACROS = ['protein_g', 'carbs_g', 'fat_g']

/** Kcal de unos macros (4 / 4 / 9 kcal por gramo). */
export function macrosKcal(t) {
    return round(GRAM_MACROS.reduce((sum, k) => sum + (Number(t?.[k]) || 0) * KCAL_PER_G[k], 0))
}

/**
 * Suma (o resta) gramos a un objetivo: { protein_g, carbs_g, fat_g }.
 * Las kcal cambian lo que aportan esos gramos, así se respeta el punto de partida.
 */
export function shiftGrams(target, deltaGrams) {
    const next = { ...target }
    let kcal = Number(target.kcal) || 0
    for (const key of GRAM_MACROS) {
        const d = Number(deltaGrams?.[key]) || 0
        if (!d) continue
        const before = Number(target[key]) || 0
        next[key] = round(before + d)
        kcal += (next[key] - before) * KCAL_PER_G[key]
    }
    next.kcal = round(kcal)
    return next
}

/** Igual que shiftGrams, también para los dos juegos de entreno/descanso. */
export function shiftDayGrams(day, deltaGrams) {
    const base = normalizeBase(day)
    if (base.day_type_config) {
        const training = shiftGrams(base.day_type_config.training, deltaGrams)
        const rest = shiftGrams(base.day_type_config.rest, deltaGrams)
        return { ...day, ...training, day_type_config: { training, rest } }
    }
    return { ...day, ...shiftGrams(base, deltaGrams), day_type_config: null }
}

/** ¿La progresión va en gramos (start_g / step_g) en vez de en kcal? */
export function isGramProgression(progression) {
    return !!(progression && (progression.step_g || progression.start_g))
}

const scaleGrams = (start, step, n) =>
    Object.fromEntries(GRAM_MACROS.map(k => [k, (Number(start?.[k]) || 0) + (Number(step?.[k]) || 0) * n]))

/**
 * Lo que se suma a un día: kcal (número) o gramos ({ protein_g, carbs_g, fat_g }),
 * según la progresión, tras `n` escalones.
 */
export function progressionAmount(progression, n) {
    const p = progression ?? { type: 'none' }
    const steps = p.type === 'weekly' || p.type === 'within_week' ? n : 0
    if (isGramProgression(p)) return scaleGrams(p.start_g, p.step_g, steps)
    return (Number(p.start_kcal) || 0) + (Number(p.step_kcal) || 0) * steps
}

/**
 * Escalones de cada día de un bloque.
 * - weekly: la semana del bloque (las semanas van de lunes a domingo; la primera es la del inicio).
 * - within_week: los días planificados que ya van esa semana dentro del bloque, así el primer
 *   día del bloque (o el primero de cada semana) es el punto de partida aunque no sea lunes.
 */
export function progressionSteps(progression, dates, startDate) {
    const type = progression?.type
    const perWeek = new Map()
    return dates.map(date => {
        if (type === 'weekly') return Math.floor(daysBetween(weekStart(startDate), date) / 7)
        if (type === 'within_week') {
            const week = weekStart(date)
            const n = perWeek.get(week) ?? 0
            perWeek.set(week, n + 1)
            return n
        }
        return 0
    })
}

/** Lo que se suma el día `dayIndex` (contando desde el inicio) de un bloque sin días saltados. */
export function progressionDelta(progression, dayIndex, startDate) {
    const dates = eachDay(startDate, addDays(startDate, dayIndex))
    return progressionAmount(progression, progressionSteps(progression, dates, startDate)[dayIndex])
}

const sign = (n) => (n > 0 ? `+${n}` : `${n}`)
const GRAM_LABEL = { protein_g: 'prot.', carbs_g: 'HC', fat_g: 'grasa' }

/** Etiqueta corta de lo que se ha sumado: «+300 kcal» o «+60 g HC · −5 g grasa». */
export function amountLabel(amount) {
    if (typeof amount === 'number') return amount ? `${sign(amount)} kcal` : null
    const parts = GRAM_MACROS.filter(k => amount?.[k]).map(k => `${sign(amount[k])} g ${GRAM_LABEL[k]}`)
    return parts.length ? parts.join(' · ').replace(/-/g, '−') : null
}

/**
 * Días de un bloque: del inicio al fin (incluidos), opcionalmente solo algunos días de la
 * semana (0 = lunes). Cada día parte de `base` y suma lo que diga la progresión, en kcal
 * (start_kcal / step_kcal, a donde diga `to`) o en gramos (start_g / step_g).
 * @param {{ start: string, end: string, base: object, progression?: object | null,
 *   weekdays?: number[] | null, label?: string | null, dietPlanId?: string | null }} options
 */
export function buildBlockDays({ start, end, base, progression, weekdays, label, dietPlanId }) {
    if (!start || !end || end < start) throw new Error('Indica un inicio y un fin válidos.')
    if (daysBetween(start, end) > 61) throw new Error('Un bloque puede tener como mucho 62 días.')
    const origin = normalizeBase(base)
    const to = KCAL_TARGETS.includes(progression?.to) ? progression.to : 'carbs'
    const dates = eachDay(start, end).filter(date => !weekdays?.length || weekdays.includes(weekdayIndex(date)))
    const steps = progressionSteps(progression, dates, start)
    return dates.map((date, i) => {
        const amount = progressionAmount(progression, steps[i])
        const day = typeof amount === 'number' ? shiftDay({ ...origin }, amount, to) : shiftDayGrams({ ...origin }, amount)
        return {
            date,
            ...pick(day),
            day_type_config: day.day_type_config,
            steps: origin.steps,
            label: label ?? amountLabel(amount),
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
