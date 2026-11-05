/** Reglas del informe de sesión, sin dependencias de la app para poder probarlas con node --test. */
import { previousByVariant, sessionList, sessionLoad } from './editor-rules.js'
import { cellSummary } from './grid-rules.js'

const number = value => (value === null || value === undefined ? null : Number(value))

function evolution(item, sessions, items, sessionId) {
    const [previous] = previousByVariant(sessions, items, sessionId, item.catalog_exercise_id, 1)
    const before = number(previous?.item.load_kg)
    const now = number(item.load_kg)
    if (before === null || now === null || before === now) return null
    return `${now > before ? '+' : ''}${Number((now - before).toFixed(2))} kg`
}

/** Foto de la sesión para el informe. Solo sale lo realizado o preparado; nunca notas internas de salud. */
export function buildReport({ client, session, number: sessionNumber, professional, sections, items, sets, sessions, allItems, clientId }) {
    const entries = sessionList(items, sections)
    const groups = [{ title: null, parent: null, exercises: [] }]
    for (const entry of entries) {
        if (entry.type === 'section') {
            groups.push({ title: entry.section.title, parent: entry.section.parent_title ?? null, exercises: [] })
            continue
        }
        const { item } = entry
        const summary = cellSummary(item)
        groups[groups.length - 1].exercises.push({
            name: item.exercise_name,
            volume: summary.volume,
            load: summary.load,
            nextLoad: summary.nextLoad,
            details: summary.details,
            tags: item.tags ?? [],
            done: item.is_done,
            evolution: evolution(item, sessions, allItems, session.id),
            sets: sets
                .filter(set => set.item_id === item.id && set.client_id === clientId && set.is_detailed)
                .sort((a, b) => a.set_index - b.set_index)
                .map(set => ({ load: number(set.load_kg), reps: set.reps })),
        })
    }
    const shown = groups.filter(group => group.exercises.length > 0)
    const allExercises = shown.flatMap(group => group.exercises)
    const totalSets = items.reduce((total, item) => total + (item.sets ?? 0), 0)

    return {
        client: client.fullName,
        session: {
            number: sessionNumber,
            date: session.session_date,
            name: session.group_name ?? session.name ?? null,
            professional,
        },
        stats: { exercises: allExercises.length, sets: totalSets, blocks: shown.filter(group => group.title).length },
        arrival: {
            score: number(session.wellness_score),
            note: session.arrival_note ?? null,
        },
        groups: shown,
        rpe: number(session.rpe),
        duration: session.duration_min ?? null,
        load: sessionLoad(number(session.rpe), session.duration_min ?? null),
    }
}

/** Número para wa.me: solo dígitos, con el prefijo de España si no lleva otro. */
export function whatsappNumber(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '')
    if (digits.length === 9) return `34${digits}`
    return digits.length >= 10 ? digits : null
}

export function whatsappUrl(phone, text) {
    const number = whatsappNumber(phone)
    return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null
}

export function reportMessage(clientName, centerName, url) {
    const first = String(clientName ?? '').trim().split(/\s+/)[0]
    return `Hola ${first}, aquí tienes el informe de tu sesión en ${centerName}: ${url}`
}

/**
 * Informes por enviar: sesiones hechas dentro de la ventana del aviso, sin envío ni descarte.
 * La sesión termina a su hora más la duración; sin hora, cuenta el final del día.
 */
export function pendingReports(rows, now, noticeHours = 3) {
    const limit = noticeHours * 3600000
    return rows.filter(row => {
        if (row.delivered || row.dismissed) return false
        const start = new Date(`${row.session_date}T${row.start_time ?? '23:59:00'}Z`).getTime()
        const end = start + (row.start_time ? (row.duration_min ?? 60) * 60000 : 0)
        return now.getTime() - end <= limit
    })
}
