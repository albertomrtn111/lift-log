// Reglas del selector de programa de Progreso › Entrenamiento (Workspace del coach).

const DAY_MS = 24 * 60 * 60 * 1000

function parseDay(value) {
    if (!value) return null
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
    if (!match) return null
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * Periodo del programa en milisegundos UTC [inicio, fin].
 * Si no tiene fecha de fin, se calcula con sus semanas.
 */
export function programPeriod(program) {
    const start = parseDay(program?.effectiveFrom)
    if (start == null) return null
    const weeks = Math.max(1, Number(program?.totalWeeks) || 1)
    const explicitEnd = parseDay(program?.effectiveTo)
    const end = explicitEnd != null && explicitEnd >= start ? explicitEnd : start + (weeks * 7 - 1) * DAY_MS
    return { start, end }
}

function overlapDays(a, b) {
    const from = Math.max(a.start, b.start)
    const to = Math.min(a.end, b.end)
    return to < from ? 0 : Math.round((to - from) / DAY_MS) + 1
}

/**
 * Para un programa sin entrenos registrados, busca otro del mismo atleta con
 * entrenos en las mismas fechas: el que más días comparte, siempre que cubra al
 * menos la mitad del más corto de los dos. Sirve para los programas duplicados:
 * el atleta registró en la otra copia.
 */
export function findProgramWithLogsInSamePeriod(programs, selectedId) {
    const list = Array.isArray(programs) ? programs : []
    const selected = list.find((program) => program.id === selectedId)
    const period = selected ? programPeriod(selected) : null
    if (!period) return null

    let best = null
    let bestOverlap = 0
    for (const program of list) {
        if (program.id === selectedId || !(Number(program.loggedSets) > 0)) continue
        const candidate = programPeriod(program)
        if (!candidate) continue
        const days = overlapDays(period, candidate)
        const shorter = Math.min(period.end - period.start, candidate.end - candidate.start) / DAY_MS + 1
        if (days * 2 < shorter) continue
        if (days > bestOverlap) {
            best = program
            bestOverlap = days
        }
    }
    return best
}

/** «Sin entrenos registrados», «1 serie registrada», «354 series registradas». */
export function formatLoggedSets(count) {
    if (count == null) return null
    const n = Number(count)
    if (!Number.isFinite(n) || n <= 0) return 'Sin entrenos registrados'
    return n === 1 ? '1 serie registrada' : `${n.toLocaleString('es-ES')} series registradas`
}

/** «Desde 10 ago 2026 · 8 semanas». */
export function formatProgramPeriod(program) {
    const start = parseDay(program?.effectiveFrom)
    const weeks = Number(program?.totalWeeks) || 0
    const parts = []
    if (start != null) {
        const date = new Intl.DateTimeFormat('es-ES', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(start)).replace('.', '')
        parts.push(`Desde ${date}`)
    }
    if (weeks > 0) parts.push(weeks === 1 ? '1 semana' : `${weeks} semanas`)
    return parts.join(' · ')
}
