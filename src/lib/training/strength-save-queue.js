// Cola de guardados de Fuerza del atleta para cuando no hay cobertura (NXT-146).
//
// Cada cambio (una casilla, crear series, añadir, editar, volver a la base o
// borrar una serie) entra en la cola antes de ir al servidor. La pantalla
// enseña lo guardado en el servidor con la cola aplicada encima, así una
// recarga no pisa lo que aún no ha llegado. La cola se guarda en el navegador
// y se reenvía sola al volver la red o la pantalla (useStrengthSaveQueue).
//
// Todos los envíos se pueden repetir sin duplicar nada:
// - casillas: upsert por atleta/ejercicio/semana (saveTrainingCell);
// - editar o volver a la base: update por id de serie;
// - crear series: deja el ejercicio con N series (generateOrApplySets);
// - añadir serie: con número de serie fijo, si ya existe la devuelve;
// - borrar: si ya no está, se da por hecho.
//
// Las series creadas sin conexión llevan un id temporal que dice su sitio
// (`tmp:<ejercicio>:<semana>:<número>`): al confirmarse se cambia por el real.

export const STRENGTH_QUEUE_MAX_REFUSALS = 4

/** @typedef {'weightKg' | 'reps' | 'rir'} SetField */
/** @type {SetField[]} */
export const SET_FIELDS = ['weightKg', 'reps', 'rir']

/**
 * @typedef {{ weightKg?: number | null, reps?: number | null, rir?: number | null }} SetValues
 * @typedef {{ programId: string, dayId: string, week: number, sessionDate?: string }} MarkDay
 * @typedef {{ uid: string, rev?: number, refusals?: number, markDay?: MarkDay }} EntryBase
 * @typedef {EntryBase & { kind: 'cell', exerciseId: string, columnId: string, week: number, value: string }} CellEntry
 * @typedef {EntryBase & { kind: 'generate', exerciseId: string, week: number, series: number, weightKg: number | null, reps: number | null, rir: number | null }} GenerateEntry
 * @typedef {EntryBase & { kind: 'add', exerciseId: string, week: number, setIndex: number, tempId: string, weightKg: number | null, reps: number | null, rir: number | null }} AddEntry
 * @typedef {EntryBase & { kind: 'set', setId: string, exerciseId?: string, week?: number, values: SetValues, override: boolean }} SetEntry
 * @typedef {EntryBase & { kind: 'delete', setId: string }} DeleteEntry
 * @typedef {CellEntry | GenerateEntry | AddEntry | SetEntry | DeleteEntry} QueueEntry
 *
 * @typedef {{ id: string, exerciseId: string, weekNumber: number, setIndex: number, weightKg: number | null, reps: number | null, rir: number | null, completed: boolean, isOverride: boolean, notes: string | null, pendingFields?: SetField[] }} QueueSet
 * @typedef {{ id: string, exerciseId: string, columnId: string, weekNumber: number, value: any, pending?: boolean }} QueueCell
 */

/** @param {string} clientId */
export function strengthQueueStorageKey(clientId) {
  return `nextrain:fuerza-pendiente:v1:${clientId}`
}

const TEMP_PREFIX = 'tmp:'

/** @param {string} exerciseId @param {number} week @param {number} setIndex */
export function tempSetId(exerciseId, week, setIndex) {
  return `${TEMP_PREFIX}${exerciseId}:${week}:${setIndex}`
}

/** @param {unknown} id */
export function isTempSetId(id) {
  return typeof id === 'string' && id.startsWith(TEMP_PREFIX)
}

/** @param {string} id */
export function parseTempSetId(id) {
  if (!isTempSetId(id)) return null
  const parts = id.slice(TEMP_PREFIX.length).split(':')
  if (parts.length !== 3 || !parts[0]) return null
  const week = Number(parts[1])
  const setIndex = Number(parts[2])
  if (!Number.isInteger(week) || !Number.isInteger(setIndex)) return null
  return { exerciseId: parts[0], week, setIndex }
}

/**
 * Busca una serie por id; las temporales, también por su sitio (ejercicio,
 * semana y número), que es como se encuentra la real una vez creada.
 * @param {QueueSet[]} sets
 * @param {string} id
 */
export function findSet(sets, id) {
  const direct = sets.find(s => s.id === id)
  if (direct) return direct
  const temp = parseTempSetId(id)
  if (!temp) return undefined
  return sets.find(s => s.exerciseId === temp.exerciseId && s.weekNumber === temp.week && s.setIndex === temp.setIndex)
}

/**
 * Añade un cambio a la cola. Los cambios a la misma casilla o serie se
 * fusionan (manda el último), salvo que entre medias haya un «crear series»
 * del mismo ejercicio: el orden importa y se añade detrás.
 * @param {QueueEntry[]} queue
 * @param {QueueEntry} entry
 * @returns {QueueEntry[]}
 */
export function enqueueStrengthChange(queue, entry) {
  /** @type {QueueEntry} */
  const incoming = { ...entry, rev: 1, refusals: 0 }

  if (entry.kind === 'cell') {
    const index = queue.findIndex(e => e.kind === 'cell'
      && e.exerciseId === entry.exerciseId && e.columnId === entry.columnId && e.week === entry.week)
    if (index < 0) return [...queue, incoming]
    const previous = /** @type {CellEntry} */ (queue[index])
    const next = [...queue]
    next[index] = { ...previous, value: entry.value, markDay: entry.markDay ?? previous.markDay, rev: (previous.rev ?? 1) + 1, refusals: 0 }
    return next
  }

  if (entry.kind === 'set') {
    let index = -1
    for (let i = queue.length - 1; i >= 0; i--) {
      const e = queue[i]
      if (e.kind === 'set' && e.setId === entry.setId) { index = i; break }
    }
    const blocked = index >= 0 && queue.slice(index + 1).some(e => e.kind === 'generate'
      && e.exerciseId === entry.exerciseId && e.week === entry.week)
    if (index < 0 || blocked) return [...queue, incoming]
    const previous = /** @type {SetEntry} */ (queue[index])
    const next = [...queue]
    next[index] = {
      ...previous,
      // Volver a la base fija los tres valores; editar suma el campo nuevo
      values: entry.override ? { ...previous.values, ...entry.values } : { ...entry.values },
      override: entry.override,
      markDay: entry.markDay ?? previous.markDay,
      rev: (previous.rev ?? 1) + 1,
      refusals: 0,
    }
    return next
  }

  if (entry.kind === 'delete') {
    // Serie añadida sin conexión que aún no ha llegado: se anula todo lo suyo
    const add = isTempSetId(entry.setId)
      ? queue.find(e => e.kind === 'add' && e.tempId === entry.setId)
      : undefined
    if (add) {
      return queue.filter(e => e.uid !== add.uid && !((e.kind === 'set' || e.kind === 'delete') && e.setId === entry.setId))
    }
    const rest = queue.filter(e => !(e.kind === 'set' && e.setId === entry.setId))
    if (rest.some(e => e.kind === 'delete' && e.setId === entry.setId)) return rest
    return [...rest, incoming]
  }

  return [...queue, incoming]
}

/**
 * El servidor confirmó el envío `rev` de `uid`: sale de la cola, salvo que
 * mientras tanto se fusionara un valor más nuevo (se enviará otra vez).
 * @param {QueueEntry[]} queue
 * @param {string} uid
 * @param {number} sentRev
 */
export function settleStrengthChange(queue, uid, sentRev) {
  const entry = queue.find(e => e.uid === uid)
  if (!entry) return { queue, found: false, newer: false }
  if ((entry.rev ?? 1) !== sentRev) return { queue, found: true, newer: true }
  return { queue: queue.filter(e => e.uid !== uid), found: true, newer: false }
}

/**
 * El servidor rechazó el envío (no es la red). Se reintenta unas veces y
 * después se quita de la cola y se devuelve para avisar.
 * @param {QueueEntry[]} queue
 * @param {string} uid
 * @param {number} sentRev
 * @param {number} [max]
 * @returns {{ queue: QueueEntry[], dropped: QueueEntry | null }}
 */
export function recordStrengthRefusal(queue, uid, sentRev, max = STRENGTH_QUEUE_MAX_REFUSALS) {
  const entry = queue.find(e => e.uid === uid)
  // Si cambió mientras se enviaba, el valor nuevo merece su propio intento
  if (!entry || (entry.rev ?? 1) !== sentRev) return { queue, dropped: null }
  const refusals = (entry.refusals ?? 0) + 1
  if (refusals >= max) return { queue: queue.filter(e => e.uid !== uid), dropped: entry }
  return { queue: queue.map(e => (e.uid === uid ? { ...e, refusals } : e)), dropped: null }
}

/**
 * Cambia los ids temporales de la cola por los reales ya creados.
 * @param {QueueEntry[]} queue
 * @param {QueueSet[]} realSets
 * @returns {QueueEntry[]}
 */
export function remapTempSetIds(queue, realSets) {
  return queue.map(e => {
    if ((e.kind !== 'set' && e.kind !== 'delete') || !isTempSetId(e.setId)) return e
    const real = findSet(realSets, e.setId)
    return real && !isTempSetId(real.id) ? { ...e, setId: real.id } : e
  })
}

/**
 * Series reales creadas a partir de una temporal que la pantalla ya enseñaba:
 * id real → id temporal, para no rehacer las casillas mientras se escribe.
 * @param {QueueSet[]} createdSets
 * @param {Set<string>} displayedIds
 */
export function tempAliasesFor(createdSets, displayedIds) {
  /** @type {[string, string][]} */
  const aliases = []
  for (const s of createdSets) {
    const temp = tempSetId(s.exerciseId, s.weekNumber, s.setIndex)
    if (displayedIds.has(temp)) aliases.push([s.id, temp])
  }
  return aliases
}

/**
 * Lo que ve el atleta: las series del servidor con la cola aplicada encima, en
 * orden. Cada serie dice qué campos están aún sin confirmar (`pendingFields`).
 * Repite la lógica de generateOrApplySets para «crear series».
 * @param {QueueSet[]} serverSets
 * @param {QueueEntry[]} queue
 * @param {Map<string, string>} [aliases] id real → id temporal que se enseña
 * @returns {QueueSet[]}
 */
export function applyQueueToSets(serverSets, queue, aliases = new Map()) {
  /** @type {QueueSet[]} */
  let list = serverSets.map(s => {
    const { pendingFields: _ignored, ...rest } = s
    return rest
  })
  /** @type {Map<string, Set<SetField>>} */
  const pending = new Map()
  /** @param {string} id @param {SetField[]} fields */
  const mark = (id, fields) => {
    const current = pending.get(id) ?? new Set()
    fields.forEach(f => current.add(f))
    pending.set(id, current)
  }
  /** @param {string} exerciseId @param {number} week @param {number} setIndex @param {number | null} weightKg @param {number | null} reps @param {number | null} rir */
  const tempSet = (exerciseId, week, setIndex, weightKg, reps, rir) => ({
    id: tempSetId(exerciseId, week, setIndex),
    exerciseId,
    weekNumber: week,
    setIndex,
    weightKg,
    reps,
    rir,
    completed: false,
    isOverride: false,
    notes: null,
  })

  for (const e of queue) {
    if (e.kind === 'generate') {
      const mine = list
        .filter(s => s.exerciseId === e.exerciseId && s.weekNumber === e.week)
        .sort((a, b) => a.setIndex - b.setIndex)
      const count = mine.length
      const base = new Set(mine.filter(s => !s.isOverride).map(s => s.id))
      list = list.map(s => (base.has(s.id) ? { ...s, weightKg: e.weightKg, reps: e.reps, rir: e.rir } : s))
      base.forEach(id => mark(id, SET_FIELDS))
      if (e.series > count) {
        for (let i = count; i < e.series; i++) {
          const created = tempSet(e.exerciseId, e.week, i, e.weightKg, e.reps, e.rir)
          list.push(created)
          mark(created.id, SET_FIELDS)
        }
      } else if (e.series < count) {
        const extra = new Set(mine.filter(s => s.setIndex >= e.series && !s.isOverride).map(s => s.id))
        list = list.filter(s => !extra.has(s.id))
      }
    } else if (e.kind === 'add') {
      if (!findSet(list, e.tempId)) {
        list.push(tempSet(e.exerciseId, e.week, e.setIndex, e.weightKg, e.reps, e.rir))
        mark(e.tempId, SET_FIELDS)
      }
    } else if (e.kind === 'set') {
      const target = findSet(list, e.setId)
      if (!target) continue
      const fields = /** @type {SetField[]} */ (SET_FIELDS.filter(f => e.values[f] !== undefined))
      list = list.map(s => {
        if (s !== target) return s
        /** @type {QueueSet} */
        const next = { ...s, isOverride: e.override }
        fields.forEach(f => { next[f] = e.values[f] ?? null })
        return next
      })
      mark(target.id, fields)
    } else if (e.kind === 'delete') {
      const target = findSet(list, e.setId)
      if (target) list = list.filter(s => s !== target)
    }
  }

  return list.map(s => {
    const fields = pending.get(s.id)
    const shownId = aliases.get(s.id) ?? s.id
    if (!fields || fields.size === 0) return shownId === s.id ? s : { ...s, id: shownId }
    return { ...s, id: shownId, pendingFields: SET_FIELDS.filter(f => fields.has(f)) }
  })
}

/**
 * Las casillas del servidor con las pendientes encima (`pending: true`).
 * @param {QueueCell[]} serverCells
 * @param {QueueEntry[]} queue
 * @returns {QueueCell[]}
 */
export function applyQueueToCells(serverCells, queue) {
  const list = [...serverCells]
  for (const e of queue) {
    if (e.kind !== 'cell') continue
    const index = list.findIndex(c => c.exerciseId === e.exerciseId && c.columnId === e.columnId && c.weekNumber === e.week)
    if (index >= 0) list[index] = { ...list[index], value: e.value, pending: true }
    else list.push({ id: `pending-${e.exerciseId}-${e.columnId}-${e.week}`, exerciseId: e.exerciseId, columnId: e.columnId, weekNumber: e.week, value: e.value, pending: true })
  }
  return list
}

/**
 * Lo guardado en el servidor después de confirmar un envío.
 * @param {QueueSet[]} serverSets
 * @param {QueueEntry} entry
 * @param {{ sets?: QueueSet[], set?: QueueSet, setId?: string }} result
 * @returns {QueueSet[]}
 */
export function serverSetsAfter(serverSets, entry, result) {
  if (entry.kind === 'generate' && result.sets) {
    return [
      ...serverSets.filter(s => !(s.exerciseId === entry.exerciseId && s.weekNumber === entry.week)),
      ...result.sets,
    ]
  }
  if ((entry.kind === 'add' || entry.kind === 'set') && result.set) {
    const saved = result.set
    return serverSets.some(s => s.id === saved.id)
      ? serverSets.map(s => (s.id === saved.id ? saved : s))
      : [...serverSets, saved]
  }
  if (entry.kind === 'delete' && result.setId) {
    return serverSets.filter(s => s.id !== result.setId)
  }
  return serverSets
}

/**
 * Casillas del servidor después de confirmar una.
 * @param {QueueCell[]} serverCells
 * @param {CellEntry} entry
 * @returns {QueueCell[]}
 */
export function serverCellsAfter(serverCells, entry) {
  const index = serverCells.findIndex(c => c.exerciseId === entry.exerciseId && c.columnId === entry.columnId && c.weekNumber === entry.week)
  if (index < 0) {
    return [...serverCells, { id: `saved-${entry.exerciseId}-${entry.columnId}-${entry.week}`, exerciseId: entry.exerciseId, columnId: entry.columnId, weekNumber: entry.week, value: entry.value }]
  }
  const next = [...serverCells]
  next[index] = { ...next[index], value: entry.value }
  return next
}

/** @param {unknown} value */
const isNumberOrNull = value => value === null || (typeof value === 'number' && Number.isFinite(value))
/** @param {unknown} value */
const isInt = value => typeof value === 'number' && Number.isInteger(value)
/** @param {unknown} value */
const isText = value => typeof value === 'string' && value.length > 0

/**
 * Lee la cola guardada en el navegador y descarta lo que no tenga forma válida.
 * @param {unknown} raw
 * @returns {QueueEntry[]}
 */
export function normalizeStrengthQueue(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(e => {
    if (!e || typeof e !== 'object' || !isText(e.uid)) return false
    switch (e.kind) {
      case 'cell': return isText(e.exerciseId) && isText(e.columnId) && isInt(e.week) && typeof e.value === 'string'
      case 'generate': return isText(e.exerciseId) && isInt(e.week) && isInt(e.series) && e.series >= 0
        && isNumberOrNull(e.weightKg) && isNumberOrNull(e.reps) && isNumberOrNull(e.rir)
      case 'add': return isText(e.exerciseId) && isInt(e.week) && isInt(e.setIndex) && e.setIndex >= 0 && isText(e.tempId)
        && isNumberOrNull(e.weightKg) && isNumberOrNull(e.reps) && isNumberOrNull(e.rir)
      case 'set': return isText(e.setId) && typeof e.override === 'boolean' && !!e.values && typeof e.values === 'object'
        && SET_FIELDS.every(f => e.values[f] === undefined || isNumberOrNull(e.values[f]))
      case 'delete': return isText(e.setId)
      default: return false
    }
  })
}
