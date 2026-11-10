/**
 * Velocidad de la barra: %RM, RM estimado, repeticiones al fallo y perfil carga-velocidad del día.
 * Sin dependencias para poder probarlo con node --test.
 *
 * Una ecuación es { a, b, c, velocity_type: 'mpv' | 'mv', source }: %1RM = a·V² + b·V + c.
 */

export const VELOCITY_TYPE_LABELS = { mpv: 'VMP', mv: 'VM' }
export const VELOCITY_TYPE_NAMES = { mpv: 'velocidad media propulsiva', mv: 'velocidad media' }

/** Velocidad máxima que se acepta, en m/s (un sprint ronda los 10). */
export const MAX_VELOCITY = 15

const round1 = value => Math.round(value * 10) / 10

function positive(value) {
    const number = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'))
    return Number.isFinite(number) && number > 0 ? number : null
}

/** «0,62». */
export function formatVelocity(value) {
    const number = positive(value)
    return number === null ? '' : number.toFixed(2).replace('.', ',')
}

/** «80» o «82,5». */
export function formatKg(value) {
    return String(round1(Number(value))).replace('.', ',')
}

export const kmhFromMs = ms => ms * 3.6
export const msFromKmh = kmh => kmh / 3.6

/** %RM con esa velocidad, o null si la ecuación no da un valor creíble (0 a 110 %). */
export function percentOfRm(equation, velocity) {
    const v = positive(velocity)
    if (!equation || v === null) return null
    const pct = Number(equation.a) * v * v + Number(equation.b) * v + Number(equation.c)
    return pct > 0 && pct <= 110 ? pct : null
}

/**
 * Con la carga y la velocidad: %RM redondeado y RM estimado del día.
 * null si faltan datos; { pct: null, rm: null } si la velocidad cae fuera de la ecuación.
 */
export function vbtEstimate(equation, loadKg, velocity) {
    const load = positive(loadKg)
    if (!equation || load === null || positive(velocity) === null) return null
    const pct = percentOfRm(equation, velocity)
    if (pct === null) return { pct: null, rm: null }
    return { pct: Math.round(pct), rm: round1(load / (pct / 100)) }
}

/** Repeticiones posibles hasta el fallo con ese %RM (Brzycki: 37 − 0,36·%RM). Orientativo. */
export function repsToFailure(pct) {
    const value = Number(pct)
    if (!(value > 0)) return null
    if (value >= 100) return 1
    return Math.max(1, Math.round(37 - 0.36 * value))
}

/** «≈ 8 rep. al fallo»; por debajo del 60 % no se afina. */
export function repsToFailureText(pct) {
    const reps = repsToFailure(pct)
    if (reps === null) return ''
    return Number(pct) < 60 ? 'más de 15 rep. al fallo' : `≈ ${reps} rep. al fallo`
}

/** RIR estimado: repeticiones al fallo menos las hechas. Solo desde el 60 %. */
export function rirEstimate(pct, reps) {
    const toFailure = repsToFailure(pct)
    const done = Number.parseInt(String(reps ?? '').split(/[^\d]/)[0], 10)
    if (toFailure === null || !(done > 0) || Number(pct) < 60) return null
    return Math.max(0, toFailure - done)
}

/** Velocidad a la que la ecuación da el 100 % (velocidad del RM), por bisección. */
export function velocityAtRm(equation) {
    if (!equation) return null
    const f = v => Number(equation.a) * v * v + Number(equation.b) * v + Number(equation.c) - 100
    let low = 0.02
    let high = 2.5
    if (f(low) * f(high) > 0) return null
    for (let step = 0; step < 60; step++) {
        const middle = (low + high) / 2
        if (f(low) * f(middle) <= 0) high = middle
        else low = middle
    }
    return (low + high) / 2
}

/**
 * La mejor velocidad de cada carga, de menos a más carga: [velocidad, kg].
 * @param {any[] | null | undefined} sets
 * @returns {[number, number][]}
 */
export function profilePoints(sets) {
    const best = new Map()
    for (const set of sets ?? []) {
        const load = positive(set.loadKg ?? set.load_kg)
        const velocity = positive(set.velocityMs ?? set.velocity_ms)
        if (load === null || velocity === null) continue
        best.set(load, Math.max(best.get(load) ?? 0, velocity))
    }
    /** @type {[number, number][]} */
    const points = [...best.entries()].map(([load, velocity]) => [velocity, load])
    return points.sort((a, b) => a[1] - b[1])
}

/**
 * Perfil carga-velocidad del día con dos o más cargas: recta carga = m·velocidad + c.
 * El RM se sitúa en la velocidad del RM del ejercicio y solo se da si no queda por debajo
 * del 90 % de la carga más alta movida.
 * @param {any} equation
 * @param {[number, number][] | null | undefined} points
 */
export function loadVelocityProfile(equation, points) {
    if (!points || points.length < 2) return null
    const n = points.length
    const meanX = points.reduce((sum, point) => sum + point[0], 0) / n
    const meanY = points.reduce((sum, point) => sum + point[1], 0) / n
    let sxy = 0
    let sxx = 0
    let syy = 0
    for (const [x, y] of points) {
        sxy += (x - meanX) * (y - meanY)
        sxx += (x - meanX) ** 2
        syy += (y - meanY) ** 2
    }
    if (!sxx || !syy) return null
    const m = sxy / sxx
    const c = meanY - m * meanX
    if (!(m < 0)) return null
    const r2 = n > 2 ? (sxy * sxy) / (sxx * syy) : null
    const mvt = velocityAtRm(equation)
    const top = Math.max(...points.map(point => point[1]))
    const rm = mvt ? m * mvt + c : null
    return {
        points,
        m,
        c,
        r2,
        n,
        mvt,
        rm: rm && rm > top * 0.9 ? round1(rm) : null,
        v0: -c / m,
        l0: c,
        top,
    }
}

/** Texto corto de la velocidad para la celda: «0,62 m/s VMP». */
export function velocityText(velocity, equation) {
    const text = formatVelocity(velocity)
    if (!text) return ''
    const label = equation ? VELOCITY_TYPE_LABELS[equation.velocity_type] : ''
    return `${text} m/s${label ? ` ${label}` : ''}`
}

/** Lo que se cuenta en un informe: «0,62 m/s VMP (78 % RM · RM estimado 102,6 kg)». */
export function vbtSummary(equation, loadKg, velocity) {
    const text = velocityText(velocity, equation)
    if (!text) return ''
    const estimate = vbtEstimate(equation, loadKg, velocity)
    if (!estimate || estimate.pct === null) return text
    return `${text} (${estimate.pct} % RM · RM estimado ${formatKg(estimate.rm)} kg)`
}
