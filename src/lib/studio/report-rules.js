/** Reglas del informe de sesión, sin dependencias de la app para poder probarlas con node --test. */
import { previousByVariant, sessionList, sessionLoad } from './editor-rules.js'
import { cellSummary } from './grid-rules.js'

const number = value => (value === null || value === undefined ? null : Number(value))

export const DEFAULT_WHATSAPP_TEXT = 'Hola {nombre}, aquí tienes el informe de tu sesión en {centro}: {enlace}'
export const DEFAULT_EMAIL_SUBJECT = 'Tu informe de sesión en {centro}'
export const DEFAULT_EMAIL_TEXT = 'Aquí tienes el informe de tu sesión de entrenamiento. Se abre en el móvil, sin cuenta ni aplicación.'

/** Lo que cada sala puede quitar del informe. */
export const REPORT_SECTIONS = [
    { key: 'stats', label: 'Cifras de la sesión' },
    { key: 'arrival', label: 'Cómo llegaba' },
    { key: 'nextLoad', label: 'Próxima sesión' },
    { key: 'evolution', label: 'Evolución frente a la sesión anterior' },
    { key: 'closing', label: 'RPE y carga' },
]

/** Por defecto sale todo: solo se quita lo que la sala haya apagado. */
export function reportSections(stored) {
    return Object.fromEntries(REPORT_SECTIONS.map(({ key }) => [key, stored?.[key] !== false]))
}

function evolution(item, sessions, items, sessionId) {
    const [previous] = previousByVariant(sessions, items, sessionId, item.catalog_exercise_id, 1)
    const before = number(previous?.item.load_kg)
    const now = number(item.load_kg)
    if (before === null || now === null || before === now) return null
    return `${now > before ? '+' : ''}${Number((now - before).toFixed(2))} kg`
}

/**
 * Foto de la sesión para el informe. Solo sale lo realizado o preparado; nunca notas internas de salud.
 * @param {any} options
 */
export function buildReport({ client, session, number: sessionNumber, professional, sections, items, sets, sessions, allItems, clientId, visible = null, peopleOf = null }) {
    const show = reportSections(visible)
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
            nextLoad: show.nextLoad ? summary.nextLoad : '',
            details: summary.details,
            tags: item.tags ?? [],
            done: item.is_done,
            evolution: show.evolution ? evolution(item, sessions, allItems, session.id) : null,
            people: peopleOf ? peopleOf(item) : [],
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
        stats: show.stats ? { exercises: allExercises.length, sets: totalSets, blocks: shown.filter(group => group.title).length } : null,
        arrival: {
            score: show.arrival ? number(session.wellness_score) : null,
            note: show.arrival ? session.arrival_note ?? null : null,
        },
        groups: shown,
        rpe: show.closing ? number(session.rpe) : null,
        duration: show.closing ? session.duration_min ?? null : null,
        load: show.closing ? sessionLoad(number(session.rpe), session.duration_min ?? null) : null,
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

/** Rellena un texto de la sala. Los datos van tal cual: nunca se interpretan como patrón. */
export function fillReportText(template, { name, center, url = '' }) {
    const first = String(name ?? '').trim().split(/\s+/)[0]
    return String(template)
        .replaceAll('{nombre}', () => first)
        .replaceAll('{centro}', () => center)
        .replaceAll('{enlace}', () => url)
}

/** El mensaje de WhatsApp. Si la sala quitó el enlace del texto, se añade: sin él no sirve. */
export function reportMessage(clientName, centerName, url, template) {
    const text = template || DEFAULT_WHATSAPP_TEXT
    const filled = fillReportText(text, { name: clientName, center: centerName, url })
    return text.includes('{enlace}') ? filled : `${filled} ${url}`
}

/**
 * Informes por enviar: sesiones hechas dentro de la ventana del aviso, sin envío ni descarte.
 * La sesión termina a su hora más la duración; sin hora, cuenta el final del día.
 */
export function pendingReports(rows, now, noticeHours = 3) {
    const limit = noticeHours * 3600000
    return rows.filter(row => {
        if (row.delivered || row.dismissed) return false
        // Lo pospuesto no sale hasta su hora, y entonces vuelve aunque haya pasado la ventana.
        if (row.snooze === 'active') return false
        if (row.snooze === 'due') return true
        const start = new Date(`${row.session_date}T${row.start_time ?? '23:59:00'}Z`).getTime()
        const end = start + (row.start_time ? (row.duration_min ?? 60) * 60000 : 0)
        return now.getTime() - end <= limit
    })
}
