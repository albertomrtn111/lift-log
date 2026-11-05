/** Reglas de los paneles de sesión y celda, sin dependencias para poder probarlas con node --test. */

export const DEFAULT_SESSION_MINUTES = 60

/** Sueño a favor; fatiga, estrés y dolor, a la inversa. Así la nota 10 siempre es «llega perfecto». */
export const WELLNESS_QUESTIONS = [
    { key: 'wellness_sleep', label: 'Sueño', hint: '10 es lo mejor', inverted: false },
    { key: 'wellness_fatigue', label: 'Fatiga', hint: '10 es lo peor', inverted: true },
    { key: 'wellness_stress', label: 'Estrés', hint: '10 es lo peor', inverted: true },
    { key: 'wellness_soreness', label: 'Dolor muscular', hint: '10 es lo peor', inverted: true },
]

/** Texto a número, con coma o punto. Vacío es null; lo que no es un número, NaN. */
export function parseNumber(text) {
    const clean = String(text ?? '').trim().replace(',', '.')
    if (clean === '') return null
    const value = Number(clean)
    return Number.isFinite(value) ? value : NaN
}

function text(value) {
    return value === null || value === undefined ? '' : String(value)
}

function checkNumber(value, label, { min = 0, max = Infinity, integer = false } = {}) {
    if (value === null) return null
    if (Number.isNaN(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        return max === Infinity ? `${label} no es válido.` : `${label} tiene que estar entre ${min} y ${max}.`
    }
    return null
}

/**
 * @param {any} item
 * @returns {{ tags: string[], sets: string, reps: string, timeSeconds: string, loadKg: string, rir: string, rpe: string, nextLoad: string | null, circuit: string[], note: string, isDone: boolean }}
 */
export function itemToForm(item) {
    return {
        tags: item?.tags ?? [],
        sets: text(item?.sets),
        reps: text(item?.reps),
        timeSeconds: text(item?.time_seconds),
        loadKg: text(item?.load_kg === null || item?.load_kg === undefined ? '' : Number(item.load_kg)),
        rir: text(item?.rir === null || item?.rir === undefined ? '' : Number(item.rir)),
        rpe: text(item?.rpe === null || item?.rpe === undefined ? '' : Number(item.rpe)),
        nextLoad: item?.next_load ?? null,
        circuit: item?.circuit ?? [],
        note: text(item?.note),
        isDone: item?.is_done ?? false,
    }
}

/** Series y repeticiones por defecto de la biblioteca: del ejercicio y, si no tiene, de su bloque. */
export function libraryDefaults(entries, blocks, catalogExerciseId) {
    const entry = entries.find(candidate => candidate.catalogExerciseId === catalogExerciseId)
    const block = blocks.find(candidate => candidate.key === entry?.blockKey)
    return {
        sets: entry?.defaultSets ?? block?.defaultSets ?? null,
        reps: entry?.defaultReps ?? block?.defaultReps ?? null,
    }
}

/** Valores de una sesión anterior para el botón Usar. La nota y lo realizado no se heredan. */
export function formFromPrevious(form, previous) {
    const values = itemToForm(previous)
    return { ...values, note: form.note, isDone: form.isDone, nextLoad: form.nextLoad }
}

/** Campos para studio_save_item, o el error que hay que enseñar. */
export function cellFields(form) {
    const sets = parseNumber(form.sets)
    const timeSeconds = parseNumber(form.timeSeconds)
    const loadKg = parseNumber(form.loadKg)
    const rir = parseNumber(form.rir)
    const rpe = parseNumber(form.rpe)
    const error = checkNumber(sets, 'Las series', { min: 1, max: 30, integer: true })
        ?? checkNumber(timeSeconds, 'El tiempo', { integer: true })
        ?? checkNumber(loadKg, 'La carga', { max: 9999 })
        ?? checkNumber(rir, 'El RIR', { max: 10 })
        ?? checkNumber(rpe, 'El RPE', { max: 10 })
    if (error) return { error }
    if (form.reps.trim().length > 40) return { error: 'Las repeticiones son demasiado largas.' }
    if (form.note.length > 2000) return { error: 'La nota es demasiado larga.' }
    return {
        fields: {
            sets,
            reps: form.reps.trim() || null,
            time_seconds: timeSeconds,
            load_kg: loadKg,
            rir,
            rpe,
            next_load: form.nextLoad,
            circuit: form.circuit.map(name => name.trim()).filter(Boolean),
            note: form.note.trim() || null,
            tags: form.tags,
        },
    }
}

/** Filas de Por series a partir de lo guardado, o vacías (heredan lo general). */
export function setRows(savedSets, count) {
    if (savedSets.length > 0) {
        return savedSets.map(set => ({
            loadKg: text(set.load_kg === null ? '' : Number(set.load_kg)),
            reps: text(set.reps),
            timeSeconds: text(set.time_seconds),
            rir: text(set.rir === null ? '' : Number(set.rir)),
            rpe: text(set.rpe === null ? '' : Number(set.rpe)),
        }))
    }
    return Array.from({ length: Math.max(count || 1, 1) }, () => ({ loadKg: '', reps: '', timeSeconds: '', rir: '', rpe: '' }))
}

/** Series para studio_save_sets. Lo vacío va como null y hereda lo general. */
export function setsFields(rows) {
    if (rows.length === 0) return { error: 'Añade al menos una serie.' }
    const sets = []
    for (const [index, row] of rows.entries()) {
        const set = {
            load_kg: parseNumber(row.loadKg),
            reps: parseNumber(row.reps),
            time_seconds: parseNumber(row.timeSeconds),
            rir: parseNumber(row.rir),
            rpe: parseNumber(row.rpe),
        }
        const error = checkNumber(set.load_kg, 'La carga', { max: 9999 })
            ?? checkNumber(set.reps, 'Las repeticiones', { integer: true })
            ?? checkNumber(set.time_seconds, 'El tiempo', { integer: true })
            ?? checkNumber(set.rir, 'El RIR', { max: 10 })
            ?? checkNumber(set.rpe, 'El RPE', { max: 10 })
        if (error) return { error: `Serie ${index + 1}: ${error}` }
        sets.push(set)
    }
    return { sets }
}

function countsAsSession(session) {
    return session.status !== 'cancelled' && session.status !== 'no_show'
}

function olderSessions(sessions, sessionId) {
    const current = sessions.find(session => session.id === sessionId)
    if (!current) return []
    const key = session => `${session.session_date}|${String(session.sort_order ?? 0).padStart(6, '0')}|${session.start_time ?? ''}`
    return sessions
        .filter(session => session.id !== sessionId && countsAsSession(session) && key(session) < key(current))
        .sort((a, b) => key(b).localeCompare(key(a)))
}

/** Lo último que se hizo de este ejercicio antes de esta sesión. */
export function previousItem(sessions, items, sessionId, catalogExerciseId) {
    for (const session of olderSessions(sessions, sessionId)) {
        const item = items.find(entry => entry.session_id === session.id && entry.catalog_exercise_id === catalogExerciseId)
        if (item) return { session, item }
    }
    return null
}

/** Nota de la sesión anterior que tiene nota, para comparar. */
export function previousWellness(sessions, sessionId) {
    const session = olderSessions(sessions, sessionId).find(entry => entry.wellness_score !== null && entry.wellness_score !== undefined)
    return session ? Number(session.wellness_score) : null
}

/** Media de las cuatro preguntas; hasta tener las cuatro no hay nota. */
export function wellnessScore(values) {
    let total = 0
    for (const question of WELLNESS_QUESTIONS) {
        const value = values[question.key]
        if (value === null || value === undefined) return null
        total += question.inverted ? 10 - value : value
    }
    return total / WELLNESS_QUESTIONS.length
}

/** Carga de la sesión: RPE × minutos. */
export function sessionLoad(rpe, minutes) {
    if (rpe === null || Number.isNaN(rpe)) return null
    const duration = minutes === null ? DEFAULT_SESSION_MINUTES : minutes
    return Number.isNaN(duration) ? null : Math.round(rpe * duration)
}

export function sessionToForm(session) {
    return {
        date: session.session_date,
        time: (session.start_time ?? '').slice(0, 5),
        professionalId: session.professional_id ?? '',
        name: session.name ?? '',
        status: session.status === 'cancelled' || session.status === 'no_show' ? session.status : 'normal',
        arrivalNote: session.arrival_note ?? '',
        rpe: text(session.rpe === null || session.rpe === undefined ? '' : Number(session.rpe)),
        duration: text(session.duration_min),
        wellness_sleep: session.wellness_sleep ?? null,
        wellness_fatigue: session.wellness_fatigue ?? null,
        wellness_stress: session.wellness_stress ?? null,
        wellness_soreness: session.wellness_soreness ?? null,
    }
}

/** Cambios para studio_update_session. El estado solo se envía si hay que anular o reabrir. */
export function sessionPatch(form, session) {
    const rpe = parseNumber(form.rpe)
    const duration = parseNumber(form.duration)
    const error = !form.date ? 'Elige una fecha.' : (
        checkNumber(rpe, 'El RPE', { max: 10 })
        ?? checkNumber(duration, 'La duración', { min: 1, max: 600, integer: true })
    )
    if (error) return { error }
    if (form.name.trim().length > 120) return { error: 'El nombre es demasiado largo.' }
    if (form.arrivalNote.length > 1000) return { error: 'La nota es demasiado larga.' }

    const patch = {
        session_date: form.date,
        start_time: form.time || null,
        professional_id: form.professionalId || null,
        name: form.name.trim() || null,
        arrival_note: form.arrivalNote.trim() || null,
        rpe,
        duration_min: duration ?? (rpe === null ? null : DEFAULT_SESSION_MINUTES),
    }
    for (const question of WELLNESS_QUESTIONS) patch[question.key] = form[question.key]
    if (form.status !== 'normal' && form.status !== session.status) patch.status = form.status
    if (form.status === 'normal' && (session.status === 'cancelled' || session.status === 'no_show')) patch.status = 'planned'
    return { patch }
}

/**
 * Ficha de la sesión: primero lo que no tiene subbloque y después cada subbloque con sus ejercicios.
 * @returns {({ type: 'item', item: any } | { type: 'section', section: any })[]}
 */
export function sessionList(items, sections) {
    const known = new Set(sections.map(section => section.id))
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
    /** @type {({ type: 'item', item: any } | { type: 'section', section: any })[]} */
    const entries = sorted.filter(item => !item.section_id || !known.has(item.section_id)).map(item => ({ type: 'item', item }))
    for (const section of [...sections].sort((a, b) => a.sort_order - b.sort_order)) {
        entries.push({ type: 'section', section })
        for (const item of sorted) {
            if (item.section_id === section.id) entries.push({ type: 'item', item })
        }
    }
    return entries
}

/** Parte la ficha en trozos: lo suelto y cada subbloque con lo suyo. */
function listBlocks(entries) {
    const blocks = [[]]
    for (const entry of entries) {
        if (entry.type === 'section') blocks.push([entry])
        else blocks[blocks.length - 1].push(entry)
    }
    return blocks
}

/**
 * Mueve una línea de la ficha. Un ejercicio que cruza un título entra en ese subbloque o sale de él.
 * Un subbloque se mueve entero, y lo suelto siempre va arriba. Sin hueco, devuelve la misma lista.
 */
export function moveEntry(entries, index, direction) {
    const target = index + direction
    if (entries[index]?.type === 'item') {
        if (target < 0 || target >= entries.length) return entries
        const next = [...entries]
        next[index] = entries[target]
        next[target] = entries[index]
        return next
    }

    const blocks = listBlocks(entries)
    const blockIndex = blocks.findIndex(block => block[0] === entries[index])
    const other = blockIndex + direction
    if (blockIndex < 1 || other < 1 || other >= blocks.length) return entries
    const next = [...blocks]
    next[blockIndex] = blocks[other]
    next[other] = blocks[blockIndex]
    return next.flat()
}

/** Lo que hay que guardar con studio_arrange_session. */
export function listLayout(entries) {
    const sectionIds = []
    const items = []
    let sectionId = null
    for (const entry of entries) {
        if (entry.type === 'section') {
            sectionId = entry.section.id
            sectionIds.push(sectionId)
        } else {
            items.push({ id: entry.item.id, section_id: sectionId })
        }
    }
    return { sectionIds, items }
}

/** «hace 5 min», «hace 2 h», «ayer» o la fecha. */
export function timeAgo(iso, now = new Date()) {
    const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)
    if (minutes < 1) return 'ahora mismo'
    if (minutes < 60) return `hace ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `hace ${hours} h`
    if (hours < 48) return 'ayer'
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso))
}

const NEXT_LOAD_MARKS = { up: '↑ Subir', same: '= Mantener', down: '↓ Bajar' }

function differs(label, mine, theirs) {
    return mine === theirs ? [] : [{ label, mine: mine || '—', theirs: theirs || '—' }]
}

/** Números escritos con coma o punto, para compararlos como iguales. */
function sameNumberText(value) {
    const number = parseNumber(value)
    return number === null || Number.isNaN(number) ? String(value ?? '').trim() : String(number)
}

/** Lo que cambia entre dos formularios de celda, para enseñar los dos valores. */
export function cellDiff(mine, theirs) {
    const list = values => values.map(value => value.trim()).filter(Boolean).join(', ')
    return [
        ...differs('Material', list(mine.tags), list(theirs.tags)),
        ...differs('Series', sameNumberText(mine.sets), sameNumberText(theirs.sets)),
        ...differs('Repeticiones', mine.reps.trim(), theirs.reps.trim()),
        ...differs('Tiempo (s)', sameNumberText(mine.timeSeconds), sameNumberText(theirs.timeSeconds)),
        ...differs('Carga (kg)', sameNumberText(mine.loadKg), sameNumberText(theirs.loadKg)),
        ...differs('RIR', sameNumberText(mine.rir), sameNumberText(theirs.rir)),
        ...differs('RPE', sameNumberText(mine.rpe), sameNumberText(theirs.rpe)),
        ...differs('Próxima sesión', NEXT_LOAD_MARKS[mine.nextLoad] ?? '', NEXT_LOAD_MARKS[theirs.nextLoad] ?? ''),
        ...differs('Circuito', list(mine.circuit), list(theirs.circuit)),
        ...differs('Nota', mine.note.trim(), theirs.note.trim()),
        ...differs('Realizado', mine.isDone ? 'Sí' : 'No', theirs.isDone ? 'Sí' : 'No'),
    ]
}

/** Lo mismo para el formulario de la sesión. `names` traduce los profesionales. */
export function sessionDiff(mine, theirs, names = {}) {
    const person = id => (id ? names[id] ?? 'Otro profesional' : 'Sin asignar')
    const status = value => ({ normal: 'Normal', cancelled: 'Anulada', no_show: 'No vino' })[value]
    const wellness = WELLNESS_QUESTIONS.flatMap(question =>
        differs(question.label, String(mine[question.key] ?? ''), String(theirs[question.key] ?? '')))
    return [
        ...differs('Fecha', mine.date, theirs.date),
        ...differs('Hora', mine.time, theirs.time),
        ...differs('Profesional', person(mine.professionalId), person(theirs.professionalId)),
        ...differs('Nombre', mine.name.trim(), theirs.name.trim()),
        ...differs('Estado', status(mine.status), status(theirs.status)),
        ...wellness,
        ...differs('Cómo llega', mine.arrivalNote.trim(), theirs.arrivalNote.trim()),
        ...differs('RPE', sameNumberText(mine.rpe), sameNumberText(theirs.rpe)),
        ...differs('Minutos', sameNumberText(mine.duration), sameNumberText(theirs.duration)),
    ]
}

/** Quién más está mirando, una vez por persona y sin contarme a mí. Manda la pestaña con sesión abierta. */
export function viewersFromPresence(state, myUserId) {
    const people = new Map()
    for (const entries of Object.values(state)) {
        for (const entry of entries) {
            if (!entry.userId || entry.userId === myUserId) continue
            if (!people.has(entry.userId) || entry.sessionId) people.set(entry.userId, entry)
        }
    }
    return [...people.values()]
        .map(({ userId, name, sessionId }) => ({ userId, name, sessionId: sessionId ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toLocaleUpperCase('es')).join('')
}
