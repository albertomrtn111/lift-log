/** Resumen de una sesión como texto y bloques enteros para añadir de golpe. Sin dependencias. */

import { cellSummary, formatShortDate } from './grid-rules.js'

const RPE_WORDS = ['Reposo', 'Muy, muy suave', 'Muy suave', 'Suave', 'Moderado', 'Algo duro', 'Duro', 'Muy duro', 'Muy, muy duro', 'Casi máximo', 'Máximo']

/**
 * Texto para pegar en un mensaje: espacio y persona, sesión y fecha, esfuerzo y cada ejercicio
 * numerado con lo que se hizo y su nota, bajo el título de su subbloque.
 * @param {{ spaceName?: string | null, personName: string, session: any, entries: ({ type: 'item', item: any } | { type: 'section', section: any })[] }} input
 */
export function sessionText({ spaceName = null, personName, session, entries }) {
    const lines = [[spaceName, personName].filter(Boolean).join(' · ')]
    lines.push([session.name || 'Sesión', formatShortDate(session.session_date)].join(' · '), '')
    const rpe = session.rpe === null || session.rpe === undefined ? null : Number(session.rpe)
    if (rpe !== null && Number.isFinite(rpe)) {
        const minutes = session.duration_min ? ` · ${session.duration_min} min` : ''
        lines.push(`Esfuerzo percibido (RPE): ${rpe}/10 · ${RPE_WORDS[Math.round(rpe)] ?? ''}${minutes}`, '')
    }
    let number = 0
    let lastParent = null
    for (const entry of entries) {
        if (entry.type === 'section') {
            const { parent_title: parent, title } = entry.section
            if (parent && parent !== lastParent) lines.push('', parent.toLocaleUpperCase('es'))
            lastParent = parent ?? null
            lines.push('', `${title}:`)
            continue
        }
        const item = entry.item
        number++
        const summary = cellSummary(item)
        const detail = [summary.volume, summary.load, summary.details].filter(Boolean).join(' · ')
        const variant = item.tags?.length ? ` (${item.tags.join(', ')})` : ''
        lines.push(`${number}. ${item.exercise_name}${variant}${detail ? ` — ${detail}` : ''}`)
        if (item.circuit?.length) lines.push(`   ${item.circuit.join(', ')}`)
        if (item.note) lines.push(`   ${item.note}`)
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Bloques de la biblioteca con ejercicios visibles, para añadirlos enteros a una sesión.
 * @param {any[]} entries
 * @param {any[]} blocks
 */
export function blockOptions(entries, blocks) {
    return blocks
        .filter(block => !block.isHidden)
        .map(block => ({
            key: block.key,
            name: block.displayName || block.name,
            count: entries.filter(entry => entry.blockKey === block.key && !entry.isHidden).length,
        }))
        .filter(option => option.count > 0)
}

/**
 * Los ejercicios de un bloque como celdas nuevas, en el orden de la biblioteca y con sus series y
 * repeticiones por defecto (del ejercicio o, si no, del bloque). Se salta lo que ya está en la sesión.
 * @param {any[]} entries
 * @param {any[]} blocks
 * @param {string} blockKey
 * @param {Set<string>} [already]
 */
export function blockItems(entries, blocks, blockKey, already = new Set()) {
    const block = blocks.find(entry => entry.key === blockKey)
    return entries
        .filter(entry => entry.blockKey === blockKey && !entry.isHidden && !already.has(entry.catalogExerciseId))
        .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name, 'es'))
        .map(entry => ({
            catalog_exercise_id: entry.catalogExerciseId,
            sets: entry.defaultSets ?? block?.defaultSets ?? null,
            reps: entry.defaultReps ?? block?.defaultReps ?? null,
        }))
}

/** Sesiones estrechadas a mano, por cliente, guardadas en el navegador como { [cliente]: [sesiones] }. */
export function toggleNarrow(saved, clientId, sessionId) {
    const list = new Set(saved?.[clientId] ?? [])
    if (list.has(sessionId)) list.delete(sessionId)
    else list.add(sessionId)
    return { ...(saved ?? {}), [clientId]: [...list] }
}
