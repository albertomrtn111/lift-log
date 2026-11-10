/** Reglas de los grupos de sala, sin dependencias para poder probarlas con node --test. */
import { parseNumber } from './editor-rules.js'

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export const ATTENDANCE_LABELS = { unmarked: 'Sin marcar', attended: 'Vino', absent: 'No vino' }

function number(value) {
    return value === null || value === undefined ? null : Number(value)
}

/** «Martes 18:00, jueves 19:00». */
export function scheduleLabel(schedule) {
    return (schedule ?? [])
        .map(slot => `${WEEKDAYS[slot.weekday]?.toLocaleLowerCase('es') ?? ''} ${slot.time ?? ''}`.trim())
        .filter(Boolean)
        .join(', ')
}

/** Resumen de una celda de grupo: rango de cargas y cuántos lo hicieron, como «20–30 kg · 4/5». */
export function groupCellLine(item, attendance, people) {
    const present = attendance.filter(entry => entry.session_id === item.session_id && entry.status !== 'absent')
    const came = present.filter(entry => entry.status === 'attended')
    const loads = (came.length > 0 ? came : present)
        .map(entry => number(people.find(person => person.item_id === item.id && person.client_id === entry.client_id)?.load_kg) ?? number(item.load_kg))
        .filter(load => load !== null)
    const low = loads.length > 0 ? Math.min(...loads) : null
    const high = loads.length > 0 ? Math.max(...loads) : null
    const load = low === null ? '' : low === high ? `${low} kg` : `${low}–${high} kg`
    const total = attendance.filter(entry => entry.session_id === item.session_id).length
    return [load, total > 0 ? `${came.length}/${total}` : ''].filter(Boolean).join(' · ')
}

/** Personas con valores propios en una celda, para enseñarlas debajo. */
export function peopleLines(item, people, names) {
    return people
        .filter(person => person.item_id === item.id)
        .filter(person => person.load_kg !== null || person.reps !== null)
        .map(person => {
            const values = [
                person.load_kg === null ? '' : `${Number(person.load_kg)} kg`,
                person.reps ?? '',
            ].filter(Boolean).join(' · ')
            return `${names[person.client_id] ?? 'Persona'}: ${values}`
        })
}

export function personForm(person) {
    const text = value => (value === null || value === undefined ? '' : String(value))
    return {
        loadKg: person?.load_kg === null || person?.load_kg === undefined ? '' : String(Number(person.load_kg)),
        reps: text(person?.reps),
        rir: person?.rir === null || person?.rir === undefined ? '' : String(Number(person.rir)),
        rpe: person?.rpe === null || person?.rpe === undefined ? '' : String(Number(person.rpe)),
        velocityMs: person?.velocity_ms === null || person?.velocity_ms === undefined
            ? ''
            : Number(person.velocity_ms).toFixed(2).replace('.', ','),
    }
}

/** Campos para studio_save_person_values, o el error que hay que enseñar. Lo vacío hereda lo general. */
export function personFields(form) {
    const load = parseNumber(form.loadKg)
    const rir = parseNumber(form.rir)
    const rpe = parseNumber(form.rpe)
    const velocity = parseNumber(form.velocityMs ?? '')
    if (load !== null && (Number.isNaN(load) || load < 0 || load > 9999)) return { error: 'La carga no es válida.' }
    if (rir !== null && (Number.isNaN(rir) || rir < 0 || rir > 10)) return { error: 'El RIR tiene que estar entre 0 y 10.' }
    if (rpe !== null && (Number.isNaN(rpe) || rpe < 0 || rpe > 10)) return { error: 'El RPE tiene que estar entre 0 y 10.' }
    if (velocity !== null && (Number.isNaN(velocity) || velocity <= 0 || velocity > 15)) {
        return { error: 'La velocidad tiene que estar entre 0,01 y 15 m/s.' }
    }
    if (form.reps.trim().length > 40) return { error: 'Las repeticiones son demasiado largas.' }
    return { fields: { load_kg: load, reps: form.reps.trim() || null, rir, rpe, velocity_ms: velocity } }
}

/** Lo que cambió respecto a lo que había, para no guardar a quien no se ha tocado. */
export function changedPeople(rows, saved) {
    return rows.filter(row => {
        const before = personForm(saved.find(person => person.client_id === row.clientId))
        return ['loadKg', 'reps', 'rir', 'rpe', 'velocityMs'].some(key => (row.form[key] ?? '').trim() !== before[key])
    })
}

/** Lo que ve un integrante en su cuadrícula: lo suyo manda sobre lo general. */
export function itemForPerson(item, person) {
    if (!person) return item
    return {
        ...item,
        load_kg: person.load_kg ?? item.load_kg,
        reps: person.reps ?? item.reps,
        time_seconds: person.time_seconds ?? item.time_seconds,
        rir: person.rir ?? item.rir,
        rpe: person.rpe ?? item.rpe,
        velocity_ms: person.velocity_ms ?? item.velocity_ms,
        next_load: person.next_load ?? item.next_load,
    }
}

/** Primero los grupos del profesional, después los demás. Los archivados no salen. */
export function sortGroups(groups, userId) {
    const mine = group => group.professional_ids.includes(userId)
    return groups
        .filter(group => group.is_active)
        .sort((a, b) => Number(mine(b)) - Number(mine(a)) || a.name.localeCompare(b.name, 'es'))
}
