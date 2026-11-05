/** Reglas de copiar, rutinas y plantillas, sin dependencias para poder probarlas con node --test. */

export const ROUTINE_KINDS = {
    mobility: 'Movilidad',
    activation: 'Activación',
    other: 'Otra',
}

/** Lo que viaja al copiar: la prescripción, sin notas ni nada de lo realizado. */
function itemValues(item) {
    return {
        catalog_exercise_id: item.catalog_exercise_id,
        exercise_name: item.exercise_name,
        sets: item.sets,
        reps: item.reps,
        time_seconds: item.time_seconds,
        load_kg: item.load_kg === null || item.load_kg === undefined ? null : Number(item.load_kg),
        rir: item.rir === null || item.rir === undefined ? null : Number(item.rir),
        rpe: item.rpe === null || item.rpe === undefined ? null : Number(item.rpe),
        circuit: item.circuit ?? [],
        tags: item.tags ?? [],
    }
}

export function clipFromCell(item) {
    return { kind: 'cell', label: item.exercise_name, item: itemValues(item) }
}

/** Copia una sesión con sus subbloques, en el orden de su ficha. */
export function clipFromSession(session, entries, label) {
    const items = []
    let sectionTitle = null
    for (const entry of entries) {
        if (entry.type === 'section') sectionTitle = entry.section.title
        else items.push({ ...itemValues(entry.item), section_title: sectionTitle })
    }
    return { kind: 'session', label, fromSessionId: session.id, items }
}

/** Campos para studio_add_items. `exercise_name` solo sirve para enseñarlo. */
export function clipItemFields(item, catalogExerciseId = item.catalog_exercise_id) {
    const { exercise_name: _name, ...fields } = item
    return { ...fields, catalog_exercise_id: catalogExerciseId }
}

/** «1-2» es 1: la plantilla admite rangos y la celda guarda un número. */
export function firstNumber(value) {
    const match = /\d+(?:[.,]\d+)?/.exec(String(value ?? ''))
    return match ? Number(match[0].replace(',', '.')) : null
}

/** Ejercicios de un día de plantilla como celdas. Sin ejercicio del catálogo no pueden entrar. */
export function templateDayItems(day) {
    return (day.exercises ?? [])
        .filter(exercise => exercise.catalog_exercise_id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(exercise => {
            const sets = firstNumber(exercise.sets)
            const rir = firstNumber(exercise.rir)
            return {
                catalog_exercise_id: exercise.catalog_exercise_id,
                sets: sets !== null && Number.isInteger(sets) && sets >= 1 && sets <= 30 ? sets : null,
                reps: exercise.reps ? String(exercise.reps).slice(0, 40) : null,
                rir: rir !== null && rir <= 10 ? rir : null,
                note: exercise.notes?.trim() ? exercise.notes.trim().slice(0, 2000) : null,
            }
        })
}

/** Una sesión como plantilla de un día. Los subbloques no existen en las plantillas: van en la nota. */
export function sessionToTemplateDay(name, entries, newId) {
    let sectionTitle = null
    const exercises = []
    for (const entry of entries) {
        if (entry.type === 'section') {
            sectionTitle = entry.section.title
            continue
        }
        const { item } = entry
        const notes = [sectionTitle, item.note].filter(Boolean).join(' · ')
        exercises.push({
            id: newId(),
            order: exercises.length + 1,
            exercise_name: item.exercise_name,
            catalog_exercise_id: item.catalog_exercise_id,
            muscle_group: item.muscle_group ?? '',
            sets: item.sets ?? 1,
            reps: item.reps ?? '',
            rir: item.rir === null || item.rir === undefined ? '' : String(Number(item.rir)),
            rest_seconds: 60,
            notes,
        })
    }
    return { days: [{ id: newId(), name, order: 1, exercises }] }
}

/** Rutinas presentes en cada sesión, para su fila de la cuadrícula. */
export function routinesBySession(items, routines) {
    const names = new Map(routines.map(routine => [routine.id, routine.name]))
    const result = new Map()
    for (const item of items) {
        if (!item.routine_id || !names.has(item.routine_id)) continue
        const list = result.get(item.session_id) ?? []
        if (!list.includes(names.get(item.routine_id))) list.push(names.get(item.routine_id))
        result.set(item.session_id, list)
    }
    return result
}

/** Campos de un ejercicio de rutina para añadirlo a una sesión. */
export function routineItemFields(item) {
    return {
        catalog_exercise_id: item.catalog_exercise_id,
        sets: item.sets,
        reps: item.reps,
        time_seconds: item.time_seconds,
        load_kg: item.load_kg === null || item.load_kg === undefined ? null : Number(item.load_kg),
        rir: item.rir === null || item.rir === undefined ? null : Number(item.rir),
        rpe: item.rpe === null || item.rpe === undefined ? null : Number(item.rpe),
        note: item.note,
    }
}

/** Rutinas para esta persona: primero las suyas y luego las del espacio. */
export function routinesForClient(routines, clientId) {
    const own = routines.filter(routine => routine.client_id === clientId)
    const shared = routines.filter(routine => routine.client_id === null)
    return [...own, ...shared]
}
