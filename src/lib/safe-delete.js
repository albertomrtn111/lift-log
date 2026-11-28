// Borrar sin perder lo que registró el atleta (NXT-149).
//
// Qué hacer al pulsar «Eliminar» y qué decirle al coach con números concretos. Las
// mismas reglas están en la base (20261122120000_proteger_borrados_atleta.sql), que
// impide el borrado directo de algo con registros. Puro, para probarlo con node --test.
//
// - Programa archivado: con series, registros o sesiones completadas se oculta del
//   historial (se puede recuperar); sin nada, se borra.
// - Revisión y cardio: con datos del atleta van a la papelera (copia completa y
//   «Deshacer»); vacíos, se borran.
// - Métrica: con valores en alguna revisión se archiva; sin valores, se borra.

/** @param {number} n @param {string} one @param {string} many */
export function plural(n, one, many) {
    return `${formatNumber(n)} ${n === 1 ? one : many}`
}

/** @param {number} value */
function formatNumber(value) {
    const rounded = Math.round(value * 10) / 10
    return String(rounded).replace('.', ',')
}

/** «a», «a y b», «a, b y c». @param {string[]} parts */
export function joinList(parts) {
    const list = parts.filter(Boolean)
    if (list.length <= 1) return list[0] ?? ''
    return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

/** @param {unknown} value */
function count(value) {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

// ---------------------------------------------------------------------------
// Programas
// ---------------------------------------------------------------------------

/**
 * Normaliza lo que devuelve nexttrain_strength_records.
 * @param {{ sets?: unknown, weeks?: unknown, completed_sessions?: unknown, logs?: unknown } | null | undefined} raw
 */
export function normalizeProgramRecords(raw) {
    return {
        sets: count(raw?.sets),
        weeks: count(raw?.weeks),
        completedSessions: count(raw?.completed_sessions),
        logs: count(raw?.logs),
    }
}

/** @param {{ sets: number, completedSessions: number, logs: number }} records */
export function programHasRecords(records) {
    return records.sets > 0 || records.completedSessions > 0 || records.logs > 0
}

/**
 * 'hide' si el atleta ha registrado algo; 'delete' si está vacío.
 * @param {{ sets: number, completedSessions: number, logs: number }} records
 * @returns {'hide' | 'delete'}
 */
export function decideProgramRemoval(records) {
    return programHasRecords(records) ? 'hide' : 'delete'
}

/**
 * «340 series en 8 semanas y 12 sesiones completadas».
 * @param {{ sets: number, weeks: number, completedSessions: number }} records
 */
export function describeProgramRecords(records) {
    const parts = []
    if (records.sets > 0) {
        parts.push(records.weeks > 0
            ? `${plural(records.sets, 'serie', 'series')} en ${plural(records.weeks, 'semana', 'semanas')}`
            : plural(records.sets, 'serie', 'series'))
    }
    if (records.completedSessions > 0) {
        parts.push(plural(records.completedSessions, 'sesión completada', 'sesiones completadas'))
    }
    return joinList(parts)
}

/**
 * Textos del aviso al eliminar un programa archivado.
 * @param {string} name
 * @param {{ sets: number, weeks: number, completedSessions: number, logs: number }} records
 */
export function programRemovalCopy(name, records) {
    if (decideProgramRemoval(records) === 'delete') {
        return {
            mode: 'delete',
            title: '¿Eliminar programa?',
            description: `«${name}» no tiene nada registrado por el atleta. Se borrará con sus días y ejercicios.`,
            confirm: 'Eliminar',
            done: 'Programa eliminado',
        }
    }
    const detail = describeProgramRecords(records) || 'registros del atleta'
    return {
        mode: 'hide',
        title: '¿Ocultar programa?',
        description: `«${name}» tiene ${detail} del atleta. Para no perderlas, no se borrará: se ocultará del historial y podrás recuperarlo cuando quieras desde «Ocultos».`,
        confirm: 'Ocultar',
        done: 'Programa ocultado',
    }
}

// ---------------------------------------------------------------------------
// Revisiones (check-ins)
// ---------------------------------------------------------------------------

/**
 * Normaliza lo que devuelve nexttrain_checkin_records.
 * @param {{ submitted?: unknown, answers?: unknown, measures?: unknown, photos?: unknown, weight?: unknown, review?: unknown } | null | undefined} raw
 */
export function normalizeCheckinRecords(raw) {
    return {
        submitted: raw?.submitted === true,
        answers: count(raw?.answers),
        measures: count(raw?.measures),
        photos: count(raw?.photos),
        weight: raw?.weight === true,
        review: raw?.review === true,
    }
}

/** @param {ReturnType<typeof normalizeCheckinRecords>} records */
export function checkinHasRecords(records) {
    return records.submitted || records.answers > 0 || records.measures > 0 || records.photos > 0 || records.weight || records.review
}

/**
 * «22 respuestas, 9 medidas, 4 fotos y el peso del atleta, y tu revisión».
 * @param {ReturnType<typeof normalizeCheckinRecords>} records
 */
export function describeCheckinRecords(records) {
    const athlete = []
    if (records.answers > 0) athlete.push(plural(records.answers, 'respuesta', 'respuestas'))
    if (records.measures > 0) athlete.push(plural(records.measures, 'medida', 'medidas'))
    if (records.photos > 0) athlete.push(plural(records.photos, 'foto', 'fotos'))
    if (records.weight) athlete.push('el peso')
    const athleteText = athlete.length > 0 ? `${joinList(athlete)} del atleta` : (records.submitted ? 'la respuesta del atleta' : '')
    if (records.review) return athleteText ? `${athleteText}, y tu revisión` : 'tu revisión'
    return athleteText
}

/** @param {ReturnType<typeof normalizeCheckinRecords>} records */
export function checkinRemovalCopy(records) {
    if (!checkinHasRecords(records)) {
        return {
            mode: 'delete',
            title: '¿Eliminar esta revisión?',
            description: 'Está vacía: el atleta no ha respondido nada. Se borrará.',
            confirm: 'Eliminar',
            done: 'Revisión eliminada',
        }
    }
    return {
        mode: 'trash',
        title: '¿Eliminar esta revisión?',
        description: `Tiene ${describeCheckinRecords(records)}. Se quitará de la ficha, pero se guarda una copia: podrás recuperarla desde «Revisiones eliminadas».`,
        confirm: 'Eliminar',
        done: 'Revisión eliminada',
    }
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

/**
 * Mismo criterio que nexttrain_guard_cardio_delete.
 * @param {{ is_completed?: boolean | null, performed_date?: string | null, actual_distance_km?: number | string | null, actual_duration_min?: number | string | null, actual_avg_pace?: string | null, avg_heart_rate?: number | null, max_heart_rate?: number | null, rpe?: number | null, feedback_notes?: string | null, strava_activity_id?: string | null }} session
 */
export function cardioHasRecords(session) {
    return session.is_completed === true
        || session.performed_date != null
        || session.actual_distance_km != null
        || session.actual_duration_min != null
        || String(session.actual_avg_pace ?? '').trim() !== ''
        || session.avg_heart_rate != null
        || session.max_heart_rate != null
        || session.rpe != null
        || String(session.feedback_notes ?? '').trim() !== ''
        || session.strava_activity_id != null
}

/**
 * «8,2 km en 45 min, RPE 7 y el comentario del atleta».
 * @param {Parameters<typeof cardioHasRecords>[0]} session
 */
export function describeCardioRecords(session) {
    const parts = []
    const km = Number(session.actual_distance_km)
    const min = Number(session.actual_duration_min)
    const hasKm = session.actual_distance_km != null && Number.isFinite(km) && km > 0
    const hasMin = session.actual_duration_min != null && Number.isFinite(min) && min > 0
    if (hasKm && hasMin) parts.push(`${formatNumber(km)} km en ${formatNumber(min)} min`)
    else if (hasKm) parts.push(`${formatNumber(km)} km`)
    else if (hasMin) parts.push(`${formatNumber(min)} min`)
    if (session.rpe != null) parts.push(`RPE ${session.rpe}`)
    if (session.avg_heart_rate != null) parts.push(`${session.avg_heart_rate} ppm de media`)
    if (String(session.feedback_notes ?? '').trim() !== '') parts.push('el comentario del atleta')
    if (session.strava_activity_id != null) parts.push('la actividad de Strava enlazada')
    if (parts.length === 0) return session.is_completed === true ? 'la sesión marcada como hecha' : 'datos del atleta'
    return joinList(parts)
}

/** @param {Parameters<typeof cardioHasRecords>[0]} session */
export function cardioRemovalCopy(session) {
    if (!cardioHasRecords(session)) {
        return {
            mode: 'delete',
            title: '¿Eliminar esta sesión?',
            description: 'El atleta aún no la ha hecho. Se borrará del calendario.',
            confirm: 'Eliminar',
            done: 'Sesión eliminada',
        }
    }
    const done = session.is_completed === true ? 'El atleta ya la ha hecho: ' : 'El atleta ya ha registrado '
    return {
        mode: 'trash',
        title: '¿Eliminar esta sesión hecha?',
        description: `${done}${describeCardioRecords(session)}. Se quitará del calendario, pero se guarda una copia y podrás deshacerlo.`,
        confirm: 'Eliminar',
        done: 'Sesión eliminada',
    }
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

/** @param {{ values?: unknown, athletes?: unknown } | null | undefined} raw */
export function normalizeMetricUsage(raw) {
    return { values: count(raw?.values), athletes: count(raw?.athletes) }
}

/**
 * @param {{ values: number }} usage
 * @returns {'archive' | 'delete'}
 */
export function decideMetricRemoval(usage) {
    return usage.values > 0 ? 'archive' : 'delete'
}

/** «42 valores de 6 atletas». @param {{ values: number, athletes: number }} usage */
export function describeMetricUsage(usage) {
    if (usage.values <= 0) return ''
    return usage.athletes > 0
        ? `${plural(usage.values, 'valor', 'valores')} de ${plural(usage.athletes, 'atleta', 'atletas')}`
        : plural(usage.values, 'valor', 'valores')
}

/** @param {string} name @param {{ values: number, athletes: number }} usage */
export function metricRemovalCopy(name, usage) {
    if (decideMetricRemoval(usage) === 'delete') {
        return {
            mode: 'delete',
            title: '¿Eliminar métrica?',
            description: `«${name}» no tiene ningún valor en las revisiones. Se borrará.`,
            confirm: 'Eliminar',
            done: 'Métrica eliminada',
        }
    }
    return {
        mode: 'archive',
        title: '¿Archivar métrica?',
        description: `«${name}» tiene ${describeMetricUsage(usage)} en sus revisiones. Para no perder ese historial no se borrará: se archivará, dejará de pedirse y podrás recuperarla desde «Archivadas».`,
        confirm: 'Archivar',
        done: 'Métrica archivada',
    }
}
