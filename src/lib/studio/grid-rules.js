/** Reglas de la cuadrícula de sala, sin dependencias para poder probarlas con node --test. */

import { formatVelocity } from './vbt-rules.js'

/** Sesiones pasadas que se ven al abrir a un cliente. Las anteriores se piden con «Ver anteriores». */
export const STUDIO_PAST_SESSIONS = 12

export const SESSION_STATUS_LABELS = {
    planned: 'Prevista',
    done: 'Hecha',
    cancelled: 'Anulada',
    no_show: 'No vino',
}

const NEXT_LOAD_MARKS = { up: '↑', same: '=', down: '↓' }

export function normalizeText(text) {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLocaleLowerCase('es')
        .trim()
}

/** «5 nov» a partir de YYYY-MM-DD. */
export function formatShortDate(date) {
    return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${date}T00:00:00.000Z`))
}

/** Lunes de la semana de una fecha YYYY-MM-DD. */
function weekOf(date) {
    const day = new Date(`${date}T00:00:00.000Z`)
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
    return day.toISOString().slice(0, 10)
}

/**
 * Sesiones de la cuadrícula, de la más antigua a la más nueva: las últimas pasadas y todas las
 * próximas, con su número y el aviso de varias sesiones en la misma semana.
 */
export function prepareSessions(sessions, today, pastLimit = STUDIO_PAST_SESSIONS) {
    const ordered = [...sessions].sort((a, b) =>
        a.session_date.localeCompare(b.session_date)
        || (a.sort_order ?? 0) - (b.sort_order ?? 0)
        || (a.start_time ?? '').localeCompare(b.start_time ?? ''))

    const counted = ordered.filter(session => session.status !== 'cancelled' && session.status !== 'no_show')
    const perWeek = new Map()
    for (const session of counted) {
        const week = weekOf(session.session_date)
        perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
    }

    let number = 0
    const numbered = ordered.map(session => {
        const countsAsSession = session.status !== 'cancelled' && session.status !== 'no_show'
        if (countsAsSession) number += 1
        return {
            ...session,
            number: countsAsSession ? number : null,
            isToday: session.session_date === today,
            sameWeek: countsAsSession ? perWeek.get(weekOf(session.session_date)) : 0,
        }
    })

    const past = numbered.filter(session => session.session_date < today)
    const upcoming = numbered.filter(session => session.session_date >= today)
    return {
        sessions: [...past.slice(-pastLimit), ...upcoming],
        olderCount: Math.max(0, past.length - pastLimit),
    }
}

/** Sesiones recientes que cuentan para saber qué bloques usa un cliente. */
export const AUTO_COLLAPSE_SESSIONS = 4

/**
 * Bloques que se pliegan solos. Con historial, los que el cliente no ha usado en sus últimas sesiones
 * ni tiene en las próximas; sin historial, los que nadie del espacio ha usado en cuatro semanas.
 */
export function autoCollapsedBlocks({ blockKeys, sessions, items, today, recentBlocks }) {
    const live = sessions.filter(session => session.status !== 'cancelled' && session.status !== 'no_show')
    const past = live.filter(session => session.session_date < today)
    if (past.length === 0 && items.length === 0) {
        const recent = new Set(recentBlocks)
        return new Set(recent.size === 0 ? [] : blockKeys.filter(key => !recent.has(key)))
    }
    const considered = new Set([
        ...past.slice(-AUTO_COLLAPSE_SESSIONS).map(session => session.id),
        ...live.filter(session => session.session_date >= today).map(session => session.id),
    ])
    const used = new Set(items.filter(item => considered.has(item.session_id)).map(item => item.block_key))
    return new Set(blockKeys.filter(key => !used.has(key)))
}

/** Orden propio de un cliente: primero lo que tiene orden y después el resto, como en el espacio. */
export function orderBlocks(blocks, prefs) {
    const order = new Map(prefs.filter(pref => pref.sort_order !== null).map(pref => [pref.block_key, pref.sort_order]))
    if (order.size === 0) return blocks
    const position = block => order.get(block.key) ?? Number.MAX_SAFE_INTEGER
    return blocks
        .map((block, index) => ({ block, index }))
        .sort((a, b) => position(a.block) - position(b.block) || a.index - b.index)
        .map(entry => entry.block)
}

/** Texto de una celda: «3×10», carga y lo demás. */
export function cellSummary(item) {
    const volume = item.time_seconds
        ? `${item.sets ? `${item.sets}×` : ''}${item.time_seconds} s`
        : [item.sets, item.reps].filter(value => value !== null && value !== undefined && value !== '').join('×')
    const details = []
    if (item.rir !== null && item.rir !== undefined) details.push(`RIR ${item.rir}`)
    if (item.rpe !== null && item.rpe !== undefined) details.push(`RPE ${item.rpe}`)
    if (item.velocity_ms !== null && item.velocity_ms !== undefined) details.push(`${formatVelocity(item.velocity_ms)} m/s`)
    return {
        volume,
        load: item.load_kg !== null && item.load_kg !== undefined ? `${Number(item.load_kg)} kg` : '',
        details: details.join(' · '),
        nextLoad: NEXT_LOAD_MARKS[item.next_load] ?? '',
    }
}

/**
 * Filas de la cuadrícula por bloques. Salen los ejercicios de la biblioteca sin ocultar y, siempre,
 * los que tienen algo en las sesiones visibles, aunque estén ocultos o fuera de la biblioteca.
 * @param {{ blocks: any[], entries: any[], items: any[], query?: string, category?: string | null, onlyUsed?: boolean }} input
 * @returns {{ block: any, rows: any[] }[]}
 */
export function buildGrid({ blocks, entries, items, query = '', category = null, onlyUsed = false }) {
    const search = normalizeText(query)
    const itemsByExercise = new Map()
    for (const item of items) {
        const list = itemsByExercise.get(item.catalog_exercise_id) ?? []
        list.push(item)
        itemsByExercise.set(item.catalog_exercise_id, list)
    }

    const rows = new Map()
    for (const entry of entries) {
        rows.set(entry.catalogExerciseId, {
            catalogId: entry.catalogExerciseId,
            name: entry.shortName ?? entry.name,
            fullName: entry.name,
            blockKey: entry.blockKey,
            sortOrder: entry.sortOrder,
            groupTitle: entry.groupTitle,
            hidden: entry.isHidden,
        })
    }
    for (const item of items) {
        if (rows.has(item.catalog_exercise_id)) continue
        rows.set(item.catalog_exercise_id, {
            catalogId: item.catalog_exercise_id,
            name: item.exercise_name,
            fullName: item.exercise_name,
            blockKey: item.block_key,
            sortOrder: null,
            groupTitle: null,
            hidden: false,
        })
    }

    const sortRows = (a, b) => {
        if (a.sortOrder !== b.sortOrder) {
            if (a.sortOrder === null) return 1
            if (b.sortOrder === null) return -1
            return a.sortOrder - b.sortOrder
        }
        return a.name.localeCompare(b.name, 'es')
    }

    const groups = blocks.flatMap(block => {
        if (category && block.category !== category) return []
        const blockMatches = !!search && normalizeText(block.displayName).includes(search)
        const blockRows = [...rows.values()]
            .filter(row => row.blockKey === block.key)
            .map(row => ({ ...row, items: itemsByExercise.get(row.catalogId) ?? [] }))
            .filter(row => row.items.length > 0 || !(row.hidden || block.isHidden))
            .filter(row => !onlyUsed || row.items.length > 0)
            .filter(row => !search || blockMatches
                || normalizeText(row.name).includes(search)
                || normalizeText(row.fullName).includes(search))
            .sort(sortRows)
        return blockRows.length > 0 ? [{ block, rows: blockRows }] : []
    })

    const shown = new Set(groups.flatMap(group => group.rows.map(row => row.catalogId)))
    const noBlock = [...rows.values()]
        .filter(row => !shown.has(row.catalogId) && !blocks.some(block => block.key === row.blockKey))
        .map(row => ({ ...row, items: itemsByExercise.get(row.catalogId) ?? [] }))
        .filter(row => row.items.length > 0
            && (!category)
            && (!search || normalizeText(row.name).includes(search)))
        .sort(sortRows)

    return noBlock.length > 0
        ? [...groups, { block: { key: 'sin-bloque', displayName: 'Sin bloque', groupTitle: null }, rows: noBlock }]
        : groups
}
