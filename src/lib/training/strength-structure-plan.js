// Aplicar una estructura de fuerza (propuesta de la IA o plantilla) sobre un
// programa que ya existe sin perder lo que el atleta ha registrado (NXT-124).
//
// Las series (training_exercise_sets), los registros (training_exercise_logs) y
// las sesiones del calendario cuelgan del id del ejercicio o del día y se borran
// en cascada con él. Por eso aquí no se recrea nada: se empareja lo que sigue y
// solo se quita lo que sobra. Puro, para probarlo con node --test.
//
// Reglas:
// - Días: primero por nombre (si es único en los dos lados), después por orden
//   entre los que quedan. El día emparejado conserva su id y su día de la semana.
// - Ejercicios: dentro de cada día emparejado, el mismo ejercicio de la biblioteca
//   (catalog_exercise_id; por nombre si a alguno le falta) conserva su id y se
//   actualiza. Cambiar un ejercicio por otro es quitar uno y añadir otro.
// - Lo que sobra sin resultados se quita. Lo que sobra con resultados es un
//   conflicto: se conserva salvo que su id esté en deleteConfirmedIds.

/** @param {unknown} value */
function normalizeName(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** @param {{ order_index?: number | null, created_at?: string | null }} a @param {{ order_index?: number | null, created_at?: string | null }} b */
function byOrder(a, b) {
    const diff = (a.order_index ?? 0) - (b.order_index ?? 0)
    if (diff !== 0) return diff
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
}

/** @param {number[]} weeks */
function uniqueSorted(weeks) {
    return [...new Set(weeks.filter(week => Number.isFinite(week)))].sort((a, b) => a - b)
}

/**
 * Una serie es un resultado del atleta si está completada o tiene algún valor.
 * La app del atleta guarda el bloque base (peso, reps, RIR) sin marcar «completada»
 * ni «editada», así que basta con que tenga un valor. Una fila sin valores es solo
 * el hueco de la serie y no cuenta.
 * @param {{ completed?: boolean | null, weight_kg?: number | string | null, reps?: number | null, rir?: number | null, notes?: string | null }} set
 */
export function isLoggedSet(set) {
    if (set.completed === true) return true
    return set.weight_kg != null || set.reps != null || set.rir != null || String(set.notes ?? '').trim() !== ''
}

/**
 * Resume lo registrado en un programa por ejercicio y por día.
 * @param {{
 *   sets?: Array<{ exercise_id: string, week_index?: number | null, completed?: boolean | null, weight_kg?: number | string | null, reps?: number | null, rir?: number | null, notes?: string | null }>,
 *   logs?: Array<{ exercise_id?: string | null, day_id?: string | null, week_index?: number | null, sets?: unknown }>,
 *   sessions?: Array<{ day_id?: string | null }>,
 * }} input
 */
export function summarizeStrengthResults({ sets = [], logs = [], sessions = [] }) {
    /** @type {Record<string, { sets: number, weeks: number[] }>} */
    const exerciseResults = {}
    /** @type {Record<string, { completedSessions: number, logs: number }>} */
    const dayResults = {}

    const addExercise = (/** @type {string} */ exerciseId, /** @type {number} */ count, /** @type {number | null | undefined} */ week) => {
        const entry = exerciseResults[exerciseId] ?? { sets: 0, weeks: [] }
        entry.sets += count
        if (week != null) entry.weeks = uniqueSorted([...entry.weeks, Number(week)])
        exerciseResults[exerciseId] = entry
    }
    const dayEntry = (/** @type {string} */ dayId) => {
        const entry = dayResults[dayId] ?? { completedSessions: 0, logs: 0 }
        dayResults[dayId] = entry
        return entry
    }

    for (const set of sets) {
        if (set?.exercise_id && isLoggedSet(set)) addExercise(set.exercise_id, 1, set.week_index)
    }
    for (const log of logs) {
        const count = Array.isArray(log?.sets) && log.sets.length > 0 ? log.sets.length : 1
        if (log?.exercise_id) addExercise(log.exercise_id, count, log.week_index)
        if (log?.day_id) dayEntry(log.day_id).logs += 1
    }
    for (const session of sessions) {
        if (session?.day_id) dayEntry(session.day_id).completedSessions += 1
    }

    return { exerciseResults, dayResults }
}

/**
 * Semanas en texto corto: [1, 2, 3, 5] → «1–3 y 5».
 * @param {number[]} weeks
 */
export function formatWeekList(weeks) {
    const sorted = uniqueSorted(weeks)
    /** @type {string[]} */
    const parts = []
    for (let i = 0; i < sorted.length; i++) {
        const start = sorted[i]
        let end = start
        while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i]
        parts.push(end === start ? String(start) : `${start}–${end}`)
    }
    if (parts.length <= 1) return parts[0] ?? ''
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/**
 * Plan para aplicar `structure` sobre el programa actual.
 *
 * @param {{
 *   currentDays: Array<{ id: string, name?: string | null, order_index?: number | null, default_weekday?: number | null, created_at?: string | null }>,
 *   currentExercises: Array<{ id: string, day_id: string, exercise_name?: string | null, catalog_exercise_id?: string | null, order_index?: number | null, created_at?: string | null }>,
 *   structure: { days?: Array<{ name?: string | null, exercises?: Array<Record<string, any>> }> },
 *   results?: ReturnType<typeof summarizeStrengthResults>,
 *   deleteConfirmedIds?: Iterable<string>,
 * }} input
 */
export function planStrengthStructure({ currentDays, currentExercises, structure, results, deleteConfirmedIds = [] }) {
    const exerciseResults = results?.exerciseResults ?? {}
    const dayResults = results?.dayResults ?? {}
    const confirmed = new Set(deleteConfirmedIds)
    const newDays = structure?.days ?? []
    const sortedDays = [...currentDays].sort(byOrder)

    // 1. Días: por nombre único y después por orden.
    const countNames = (/** @type {Array<{ name?: string | null }>} */ list) => {
        /** @type {Map<string, number>} */
        const counts = new Map()
        for (const day of list) {
            const key = normalizeName(day.name)
            if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return counts
    }
    const currentNames = countNames(sortedDays)
    const newNames = countNames(newDays)
    /** @type {Array<typeof sortedDays[number] | null>} */
    const dayMatches = newDays.map(() => null)
    const usedDays = new Set()

    newDays.forEach((day, index) => {
        const key = normalizeName(day.name)
        if (!key || currentNames.get(key) !== 1 || newNames.get(key) !== 1) return
        const match = sortedDays.find(current => normalizeName(current.name) === key)
        if (match && !usedDays.has(match.id)) {
            dayMatches[index] = match
            usedDays.add(match.id)
        }
    })
    const remainingDays = sortedDays.filter(day => !usedDays.has(day.id))
    newDays.forEach((_, index) => {
        if (dayMatches[index] || remainingDays.length === 0) return
        const match = /** @type {typeof sortedDays[number]} */ (remainingDays.shift())
        dayMatches[index] = match
        usedDays.add(match.id)
    })

    const exercisesByDay = new Map()
    for (const exercise of [...currentExercises].sort(byOrder)) {
        const list = exercisesByDay.get(exercise.day_id) ?? []
        list.push(exercise)
        exercisesByDay.set(exercise.day_id, list)
    }
    const exerciseHasResults = (/** @type {string} */ id) => (exerciseResults[id]?.sets ?? 0) > 0
    const exerciseSummary = (/** @type {string} */ id) => exerciseResults[id] ?? { sets: 0, weeks: [] }

    /** @type {Array<Record<string, any>>} */
    const conflicts = []
    /** @type {string[]} */
    const deleteExerciseIds = []
    /** @type {string[]} */
    const deleteDayIds = []

    // 2. Ejercicios de cada día nuevo.
    const days = newDays.map((day, dayIndex) => {
        const matchedDay = dayMatches[dayIndex]
        const available = matchedDay ? [...(exercisesByDay.get(matchedDay.id) ?? [])] : []
        const exercises = (day.exercises ?? []).map((source, exerciseIndex) => {
            const catalogId = source.catalog_exercise_id ?? null
            const name = normalizeName(source.exercise_name)
            let matchIndex = catalogId
                ? available.findIndex(current => current.catalog_exercise_id === catalogId)
                : -1
            if (matchIndex === -1 && name) {
                matchIndex = available.findIndex(current =>
                    (!catalogId || !current.catalog_exercise_id) && normalizeName(current.exercise_name) === name)
            }
            const match = matchIndex === -1 ? null : available.splice(matchIndex, 1)[0]
            return {
                existingId: match?.id ?? null,
                order_index: Number(source.order) || exerciseIndex + 1,
                source,
            }
        })

        // Lo que queda del día emparejado no está en la propuesta.
        /** @type {Array<{ id: string, order_index: number }>} */
        const kept = []
        let nextOrder = exercises.reduce((max, exercise) => Math.max(max, exercise.order_index), 0)
        for (const leftover of available) {
            if (!exerciseHasResults(leftover.id) || confirmed.has(leftover.id)) {
                deleteExerciseIds.push(leftover.id)
                continue
            }
            const summary = exerciseSummary(leftover.id)
            conflicts.push({
                kind: 'exercise',
                id: leftover.id,
                name: leftover.exercise_name || 'Ejercicio',
                // El nombre que el coach ve ahora en el editor, no el de la propuesta.
                dayName: String(matchedDay?.name ?? day.name ?? 'Día'),
                sets: summary.sets,
                weeks: summary.weeks,
            })
            nextOrder += 1
            kept.push({ id: leftover.id, order_index: nextOrder })
        }

        return {
            existingId: matchedDay?.id ?? null,
            name: String(day.name ?? '').trim() || `Día ${dayIndex + 1}`,
            order_index: dayIndex + 1,
            default_weekday: matchedDay?.default_weekday ?? null,
            exercises,
            keptExercises: kept,
        }
    })

    // 3. Días actuales que no están en la propuesta.
    /** @type {Array<{ id: string, order_index: number }>} */
    const keptDays = []
    for (const leftover of sortedDays.filter(day => !usedDays.has(day.id))) {
        const dayExercises = exercisesByDay.get(leftover.id) ?? []
        const sets = dayExercises.reduce((sum, exercise) => sum + exerciseSummary(exercise.id).sets, 0)
        const weeks = uniqueSorted(dayExercises.flatMap(exercise => exerciseSummary(exercise.id).weeks))
        const completedSessions = dayResults[leftover.id]?.completedSessions ?? 0
        const hasResults = sets > 0 || completedSessions > 0 || (dayResults[leftover.id]?.logs ?? 0) > 0
        if (!hasResults || confirmed.has(leftover.id)) {
            deleteDayIds.push(leftover.id)
            continue
        }
        conflicts.push({
            kind: 'day',
            id: leftover.id,
            name: leftover.name || 'Día',
            sets,
            weeks,
            completedSessions,
            default_weekday: leftover.default_weekday ?? null,
            order_index: leftover.order_index ?? null,
        })
        keptDays.push({ id: leftover.id, order_index: days.length + keptDays.length + 1 })
    }

    return { days, keptDays, deleteExerciseIds, deleteDayIds, conflicts }
}

/**
 * Días que se quitan al guardar el paso 2 y que tienen resultados.
 * @param {{
 *   currentDays: Array<{ id: string, name?: string | null, order_index?: number | null, default_weekday?: number | null }>,
 *   currentExercises: Array<{ id: string, day_id: string }>,
 *   keepDayIds: Iterable<string>,
 *   results?: ReturnType<typeof summarizeStrengthResults>,
 *   deleteConfirmedIds?: Iterable<string>,
 * }} input
 */
export function findRemovedDayConflicts({ currentDays, currentExercises, keepDayIds, results, deleteConfirmedIds = [] }) {
    const keep = new Set(keepDayIds)
    const confirmed = new Set(deleteConfirmedIds)
    const plan = planStrengthStructure({
        currentDays: currentDays.filter(day => !keep.has(day.id)),
        currentExercises: currentExercises.filter(exercise => !keep.has(exercise.day_id)),
        structure: { days: [] },
        results,
        deleteConfirmedIds: confirmed,
    })
    return plan.conflicts
}
