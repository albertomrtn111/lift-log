// Notas de los ejercicios en la pantalla Fuerza del atleta (NXT-154).
//
// Hay dos notas distintas y no se mezclan:
// - La del coach: training_exercises.notes. El atleta la ve como «Indicaciones del coach»
//   (columna virtual COACH_NOTES_KEY; no existe en training_columns).
// - La del atleta: training_exercise_logs.notes, una por ejercicio y semana. Va en la
//   columna «Notas» del programa: clave 'notes' (editable_by 'both', la de ahora) o 'c10'
//   (editable_by 'client', programas antiguos).
//
// Antes la columna 'notes' llegaba como no editable (solo contaba 'client'): en el móvil no
// salía la casilla y en el ordenador la acción la rechazaba («Not a loggable column»), y la
// casilla enseñaba la nota del coach como si fuera del atleta. Puro, para node --test.

export const ATHLETE_NOTES_KEYS = ['notes', 'c10']
export const COACH_NOTES_KEY = 'coach_notes'
export const COACH_NOTES_COLUMN_ID = 'coach-notes'

/** Valores de una serie en training_exercise_logs.sets que cuentan como registro. */
const SET_VALUE_FIELDS = ['weight', 'weight_kg', 'reps', 'rir', 'rpe', 'notes']

/** @param {string | null | undefined} editableBy */
export function isClientEditable(editableBy) {
    return editableBy === 'client' || editableBy === 'both'
}

/**
 * Columna donde el atleta escribe su nota (ya mapeada: `editable`).
 * @param {{ key?: string | null, editable?: boolean } | null | undefined} column
 */
export function isAthleteNotesColumn(column) {
    return Boolean(column && column.editable && ATHLETE_NOTES_KEYS.includes(column.key ?? ''))
}

/**
 * Campo de training_exercise_logs que guarda cada columna del atleta.
 * c7-c9 son las columnas antiguas de peso, reps y RIR (serie 1).
 * @param {string | null | undefined} key
 * @returns {'weight' | 'reps' | 'rir' | 'notes' | null}
 */
export function logFieldForColumnKey(key) {
    if (key === 'c7') return 'weight'
    if (key === 'c8') return 'reps'
    if (key === 'c9') return 'rir'
    if (ATHLETE_NOTES_KEYS.includes(key ?? '')) return 'notes'
    return null
}

/**
 * Columnas de training_columns tal como las usa la pantalla Fuerza del atleta.
 * Añade la del nombre ('c1') si falta y la virtual de las indicaciones del coach.
 * @param {Array<{ id: string, key?: string | null, label: string, data_type?: string | null, scope?: string | null, editable_by?: string | null, order_index?: number | null }>} rawColumns
 * @returns {import('@/types/training').TrainingColumn[]}
 */
export function mapRoutineColumns(rawColumns) {
    const mapped = (rawColumns ?? []).map((c) => ({
        id: c.id,
        key: c.key ?? undefined,
        label: c.label,
        type: c.data_type,
        scope: c.scope,
        editable: isClientEditable(c.editable_by),
        order: c.order_index ?? 0,
    }))

    if (!mapped.some((c) => c.id === 'c1')) {
        mapped.unshift({
            id: 'c1',
            key: 'c1',
            label: 'Ejercicio',
            type: 'text',
            scope: 'exercise',
            editable: false,
            order: 0,
        })
    }

    const athleteNotes = mapped.find(isAthleteNotesColumn)
    const lastOrder = mapped.reduce((max, c) => Math.max(max, Number(c.order) || 0), 0)
    mapped.push({
        id: COACH_NOTES_COLUMN_ID,
        key: COACH_NOTES_KEY,
        label: 'Notas del coach',
        type: 'textarea',
        scope: 'exercise',
        editable: false,
        order: athleteNotes ? Number(athleteNotes.order) - 0.5 : lastOrder + 1,
    })

    return mapped.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
}

/**
 * Celdas virtuales con la nota del atleta de cada semana (training_exercise_logs.notes).
 * @param {Array<{ id: string, key?: string | null }>} columns columnas de training_columns
 * @param {Array<{ id: string, exercise_id: string, week_index: number, notes?: string | null }>} logs
 */
export function athleteNoteCells(columns, logs) {
    const column = (columns ?? []).find((c) => c.key === 'notes') ?? (columns ?? []).find((c) => c.key === 'c10')
    if (!column) return []
    return (logs ?? [])
        .filter((log) => typeof log.notes === 'string' && log.notes.trim() !== '')
        .map((log) => ({
            id: `log-${log.id}-notes`,
            exercise_id: log.exercise_id,
            column_id: column.id,
            week_index: log.week_index,
            value: log.notes,
        }))
}

/** @param {unknown} sets */
export function hasLoggedSetValues(sets) {
    if (!Array.isArray(sets)) return false
    return sets.some((set) => set && typeof set === 'object' && SET_VALUE_FIELDS.some((field) => {
        const value = /** @type {Record<string, unknown>} */ (set)[field]
        return value !== undefined && value !== null && String(value).trim() !== ''
    }))
}

/**
 * Lo que queda en training_exercise_logs al guardar una casilla del atleta.
 * La nota no crea series vacías; si al borrar la nota no queda nada, `empty` pide quitar
 * la fila (una fila vacía contaría como resultado del atleta al cambiar el programa).
 * @param {{ sets?: unknown, notes?: string | null } | null | undefined} existing
 * @param {'weight' | 'reps' | 'rir' | 'notes'} field
 * @param {string} value
 */
export function nextExerciseLog(existing, field, value) {
    /** @type {Array<Record<string, unknown>>} */
    const sets = Array.isArray(existing?.sets)
        ? existing.sets.map((set) => (set && typeof set === 'object' ? { ...set } : {}))
        : []
    let notes = typeof existing?.notes === 'string' && existing.notes.trim() !== '' ? existing.notes : null

    if (field === 'notes') {
        notes = String(value ?? '').trim() === '' ? null : String(value)
    } else {
        /** @type {unknown} */
        let parsed = value
        if (field === 'weight' || field === 'rir') {
            const number = parseFloat(String(value).replace(',', '.'))
            if (!Number.isNaN(number)) parsed = number
        }
        if (field === 'reps' && /^\d+$/.test(String(value).trim())) parsed = parseInt(String(value), 10)
        if (sets.length === 0) sets.push({ set: 1 })
        sets[0][field] = String(value ?? '').trim() === '' ? null : parsed
        sets[0].set = 1
    }

    return { sets, notes, empty: notes === null && !hasLoggedSetValues(sets) }
}
