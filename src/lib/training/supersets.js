// Superseries de los programas de fuerza online (NXT-121). Puro, para que lo usen
// igual el editor del coach, la app del atleta, el progreso, NextIA y el MCP, y
// probarlo con node --test.
//
// Modelo: los ejercicios seguidos de un mismo día con la misma `superset_key`
// forman un bloque de 2 a 4 (superserie, triserie, serie gigante). La letra
// (A, B, C1, C2…) se calcula aquí al mostrar el día, nunca se guarda. Un
// ejercicio que se queda solo con su clave se muestra como normal.
// Descanso: dentro del bloque, rest_seconds de cada ejercicio es el paso al
// siguiente (0 = sin descanso) y el del último, el descanso tras la ronda.
// Rondas = el mayor número de series del bloque.
// Modo Sala no usa esto.

export const MAX_SUPERSET_SIZE = 4

/** Clave de superserie de un ejercicio (acepta snake_case y camelCase). */
export function supersetKeyOf(exercise) {
  const key = exercise?.superset_key ?? exercise?.supersetKey ?? null
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  return trimmed ? trimmed : null
}

/** Descanso en segundos o null. */
export function restOf(exercise) {
  const raw = exercise?.rest_seconds ?? exercise?.restSeconds
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

/** Series prescritas (0 si no hay). */
export function setsOf(exercise) {
  const value = Number(exercise?.sets)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** A, B… Z, AA, AB… */
export function blockLetter(index) {
  let n = Math.max(0, Math.floor(index)) + 1
  let letter = ''
  while (n > 0) {
    const rest = (n - 1) % 26
    letter = String.fromCharCode(65 + rest) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

/** superserie (2), triserie (3) o serie gigante (4). */
export function supersetKind(size) {
  if (size <= 2) return 'superserie'
  if (size === 3) return 'triserie'
  return 'serie gigante'
}

/** Igual que supersetKind, con mayúscula inicial. */
export function supersetKindLabel(size) {
  const kind = supersetKind(size)
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

/** Clave nueva para un bloque (solo tiene que ser única dentro del día). */
export function newSupersetKey() {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return random.replace(/-/g, '').slice(0, 8)
}

/**
 * Agrupa los ejercicios de un día, ya ordenados, en bloques con su letra.
 * @template T
 * @param {T[]} exercises
 * @returns {Array<{
 *   letter: string, key: string | null, isSuperset: boolean, kind: string | null,
 *   rounds: number, roundRestSeconds: number | null,
 *   members: Array<{ exercise: T, label: string, position: number, isLast: boolean }>
 * }>}
 */
export function buildExerciseBlocks(exercises) {
  /** @type {Array<{ key: string | null, items: T[] }>} */
  const runs = []
  for (const exercise of exercises ?? []) {
    const key = supersetKeyOf(exercise)
    const last = runs[runs.length - 1]
    if (key && last && last.key === key && last.items.length < MAX_SUPERSET_SIZE) {
      last.items.push(exercise)
    } else {
      runs.push({ key, items: [exercise] })
    }
  }

  return runs.map((run, index) => {
    const letter = blockLetter(index)
    const isSuperset = run.key !== null && run.items.length >= 2
    const lastItem = run.items[run.items.length - 1]
    return {
      letter,
      key: isSuperset ? run.key : null,
      isSuperset,
      kind: isSuperset ? supersetKind(run.items.length) : null,
      rounds: isSuperset ? Math.max(0, ...run.items.map(setsOf)) : setsOf(run.items[0]),
      roundRestSeconds: isSuperset ? restOf(lastItem) : null,
      members: run.items.map((exercise, position) => ({
        exercise,
        label: isSuperset ? `${letter}${position + 1}` : letter,
        position,
        isLast: position === run.items.length - 1,
      })),
    }
  })
}

/**
 * Información de bloque por id de ejercicio, para listas planas (progreso, CSV,
 * NextIA, MCP). `with` son los nombres del resto del bloque.
 * @param {any[]} exercises ejercicios de un día, ordenados (cada uno con id)
 * @param {(exercise: any) => string} [nameOf]
 */
export function supersetInfoById(exercises, nameOf = (exercise) => exercise?.exercise_name ?? exercise?.name ?? '') {
  /** @type {Map<string, { label: string, letter: string, isSuperset: boolean, kind: string | null, rounds: number, roundRestSeconds: number | null, position: number, isLast: boolean, size: number, with: string[], withLabels: string[] }>} */
  const info = new Map()
  for (const block of buildExerciseBlocks(exercises)) {
    for (const member of block.members) {
      const others = block.members.filter((other) => other !== member)
      info.set(member.exercise.id, {
        label: member.label,
        letter: block.letter,
        isSuperset: block.isSuperset,
        kind: block.kind,
        rounds: block.rounds,
        roundRestSeconds: block.roundRestSeconds,
        position: member.position,
        isLast: member.isLast,
        size: block.members.length,
        with: others.map((other) => nameOf(other.exercise)),
        withLabels: others.map((other) => other.label),
      })
    }
  }
  return info
}

/** «sin descanso» o «30 s». */
export function formatRestShort(seconds) {
  if (seconds === null || seconds === undefined) return null
  if (seconds <= 0) return 'sin descanso'
  if (seconds % 60 === 0 && seconds >= 120) return `${seconds / 60} min`
  return `${seconds} s`
}

/**
 * Cómo se hace un bloque, en una línea: «C1 → C2 sin descanso · 90 s tras la ronda».
 * @param {ReturnType<typeof buildExerciseBlocks>[number]} block
 */
export function describeSupersetFlow(block) {
  if (!block?.isSuperset) return ''
  const parts = []
  block.members.forEach((member) => {
    if (member.isLast) return
    const rest = restOf(member.exercise)
    const next = block.members[member.position + 1]
    parts.push(rest && rest > 0 ? `${member.label} → ${next.label} con ${rest} s` : `${member.label} → ${next.label} sin descanso`)
  })
  const roundRest = block.roundRestSeconds
  const tail = roundRest && roundRest > 0 ? `${roundRest} s tras la ronda` : 'sin descanso entre rondas'
  return `${parts.join(' · ')} · ${tail}`
}

/**
 * Intercala las series de los ejercicios de un bloque por rondas: ronda 1 = la
 * primera serie de cada uno, en orden. Un ejercicio sin series en esa ronda no sale.
 * @template S
 * @param {Array<{ label: string, sets: S[] }>} members
 * @returns {Array<{ index: number, entries: Array<{ label: string, memberIndex: number, set: S }> }>}
 */
export function interleaveRounds(members) {
  const rounds = Math.max(0, ...members.map((member) => member.sets.length))
  const result = []
  for (let index = 0; index < rounds; index++) {
    const entries = []
    members.forEach((member, memberIndex) => {
      if (index < member.sets.length) entries.push({ label: member.label, memberIndex, set: member.sets[index] })
    })
    result.push({ index, entries })
  }
  return result
}

/** Miembros (ids) del bloque al que pertenece un ejercicio, o solo él. */
function blockMembersOf(exercises, id) {
  const block = buildExerciseBlocks(exercises).find((candidate) => candidate.members.some((member) => member.exercise.id === id))
  if (!block) return { block: null, members: [] }
  return { block, members: block.members.map((member) => member.exercise) }
}

/**
 * Enlaza dos ejercicios seguidos del día (y los bloques a los que ya pertenezcan).
 * Descanso: los que no son el último y no venían de ser intermedios pasan a 0; el
 * último se queda con el mayor descanso del bloque.
 * @param {Array<{ id: string }>} exercises ejercicios del día, ordenados
 * @returns {{ error: string } | { key: string, updates: Array<{ id: string, superset_key?: string | null, rest_seconds?: number | null }> }}
 */
export function planLink(exercises, upperId, lowerId, freshKey = newSupersetKey()) {
  const list = exercises ?? []
  const upperIndex = list.findIndex((exercise) => exercise.id === upperId)
  const lowerIndex = list.findIndex((exercise) => exercise.id === lowerId)
  if (upperIndex < 0 || lowerIndex < 0) return { error: 'No se encuentran los ejercicios.' }
  if (lowerIndex !== upperIndex + 1) return { error: 'Solo se pueden enlazar ejercicios seguidos.' }

  const upper = blockMembersOf(list, upperId)
  const lower = blockMembersOf(list, lowerId)
  if (upper.block && lower.block && upper.block.letter === lower.block.letter) return { error: 'Ya están en la misma superserie.' }

  const members = [...upper.members, ...lower.members]
  if (members.length > MAX_SUPERSET_SIZE) {
    return { error: `Una superserie admite como mucho ${MAX_SUPERSET_SIZE} ejercicios.` }
  }

  const key = (upper.block?.isSuperset ? upper.block.key : null) ?? (lower.block?.isSuperset ? lower.block.key : null) ?? freshKey
  const rests = members.map(restOf).filter((value) => value !== null)
  const roundRest = rests.length ? Math.max(...rests) : null
  // Los intermedios de un bloque que ya existía conservan su paso al siguiente.
  const keepTransition = new Set()
  for (const side of [upper, lower]) {
    if (side.block?.isSuperset) side.block.members.forEach((member) => { if (!member.isLast) keepTransition.add(member.exercise.id) })
  }

  const updates = []
  members.forEach((exercise, position) => {
    const isLast = position === members.length - 1
    const nextRest = isLast ? roundRest : keepTransition.has(exercise.id) ? restOf(exercise) : 0
    const update = { id: exercise.id }
    if (supersetKeyOf(exercise) !== key) update.superset_key = key
    if (restOf(exercise) !== nextRest) update.rest_seconds = nextRest
    if (Object.keys(update).length > 1) updates.push(update)
  })
  return { key, updates }
}

/**
 * Deshace el bloque entero: cada ejercicio queda suelto y, si tenía 0 o nada de
 * descanso, se queda con el descanso de la ronda.
 */
export function planUnlinkBlock(exercises, memberId) {
  const { block, members } = blockMembersOf(exercises ?? [], memberId)
  if (!block?.isSuperset) return { updates: [] }
  const roundRest = block.roundRestSeconds
  const updates = members.map((exercise) => {
    const update = { id: exercise.id, superset_key: null }
    const rest = restOf(exercise)
    if ((rest === null || rest === 0) && roundRest !== null && roundRest > 0) update.rest_seconds = roundRest
    return update
  })
  return { updates }
}

/**
 * Saca un ejercicio de su bloque. Si el bloque se queda con uno, se deshace. Si
 * estaba en medio, pasa a ir justo después del bloque (order = nuevo orden del día).
 * @returns {{ updates: Array<{ id: string, superset_key?: string | null, rest_seconds?: number | null }>, order: string[] | null }}
 */
export function planRemoveFromBlock(exercises, memberId) {
  const list = exercises ?? []
  const { block, members } = blockMembersOf(list, memberId)
  if (!block?.isSuperset) return { updates: [], order: null }
  if (members.length <= 2) return { ...planUnlinkBlock(list, memberId), order: null }

  const roundRest = block.roundRestSeconds
  const leaving = members.find((exercise) => exercise.id === memberId)
  const staying = members.filter((exercise) => exercise.id !== memberId)
  const updates = []

  const leavingUpdate = { id: memberId, superset_key: null }
  const leavingRest = restOf(leaving)
  if ((leavingRest === null || leavingRest === 0) && roundRest !== null && roundRest > 0) leavingUpdate.rest_seconds = roundRest
  updates.push(leavingUpdate)

  // El que queda último lleva el descanso de la ronda.
  const newLast = staying[staying.length - 1]
  if (restOf(newLast) !== roundRest) updates.push({ id: newLast.id, rest_seconds: roundRest })

  const position = members.indexOf(leaving)
  let order = null
  if (position > 0 && position < members.length - 1) {
    const ids = list.map((exercise) => exercise.id).filter((id) => id !== memberId)
    const afterIndex = ids.indexOf(members[members.length - 1].id)
    ids.splice(afterIndex + 1, 0, memberId)
    order = ids
  }
  return { updates, order }
}

/**
 * Tras reordenar un día: quita la clave a los ejercicios que han quedado sueltos o
 * separados de su bloque y deja el descanso de la ronda en el último de cada bloque.
 * @param {Array<{ id: string }>} exercises ejercicios del día en el orden nuevo
 */
export function planNormalizeOrder(exercises) {
  const list = exercises ?? []
  /** @type {Map<string, Array<{ start: number, ids: string[] }>>} */
  const runsByKey = new Map()
  list.forEach((exercise, index) => {
    const key = supersetKeyOf(exercise)
    if (!key) return
    const runs = runsByKey.get(key) ?? []
    const last = runs[runs.length - 1]
    if (last && last.start + last.ids.length === index) last.ids.push(exercise.id)
    else runs.push({ start: index, ids: [exercise.id] })
    runsByKey.set(key, runs)
  })

  const byId = new Map(list.map((exercise) => [exercise.id, exercise]))
  /** @type {Map<string, { id: string, superset_key?: string | null, rest_seconds?: number | null }>} */
  const updates = new Map()
  const patch = (id, fields) => updates.set(id, { ...(updates.get(id) ?? { id }), ...fields })

  for (const runs of runsByKey.values()) {
    const allIds = runs.flatMap((run) => run.ids)
    const rests = allIds.map((id) => restOf(byId.get(id))).filter((value) => value !== null)
    const roundRest = rests.length ? Math.max(...rests) : null
    // Se queda el primer tramo que sigue siendo un bloque; el resto sale suelto.
    const keeper = runs.find((run) => run.ids.length >= 2) ?? null
    for (const run of runs) {
      if (run === keeper) continue
      for (const id of run.ids) {
        patch(id, { superset_key: null })
        const rest = restOf(byId.get(id))
        if ((rest === null || rest === 0) && roundRest !== null && roundRest > 0) patch(id, { rest_seconds: roundRest })
      }
    }
    if (!keeper) continue
    const keptIds = keeper.ids.slice(0, MAX_SUPERSET_SIZE)
    for (const id of keeper.ids.slice(MAX_SUPERSET_SIZE)) patch(id, { superset_key: null })
    const lastId = keptIds[keptIds.length - 1]
    const keptRests = keptIds.map((id) => restOf(byId.get(id)))
    const keptRound = keptRests.some((value) => value !== null)
      ? Math.max(...keptRests.filter((value) => value !== null))
      : null
    if (keptRound !== null && restOf(byId.get(lastId)) !== keptRound) {
      // El que traía el descanso de la ronda se queda con el paso que tenía el nuevo último.
      const holderId = keptIds.find((id, index) => index < keptIds.length - 1 && restOf(byId.get(id)) === keptRound)
      if (holderId) patch(holderId, { rest_seconds: restOf(byId.get(lastId)) ?? 0 })
      patch(lastId, { rest_seconds: keptRound })
    }
  }
  return { updates: [...updates.values()] }
}

/**
 * Subir o bajar respetando los bloques. Un ejercicio de una superserie se mueve
 * dentro de ella; uno suelto salta el bloque vecino entero. Devuelve el orden
 * nuevo (ids) o null si no se puede mover.
 */
export function planMove(exercises, id, direction) {
  const blocks = buildExerciseBlocks(exercises ?? [])
  const blockIndex = blocks.findIndex((block) => block.members.some((member) => member.exercise.id === id))
  if (blockIndex < 0) return null
  const block = blocks[blockIndex]
  const step = direction === 'up' ? -1 : 1
  const groups = blocks.map((candidate) => candidate.members.map((member) => member.exercise.id))

  if (block.isSuperset) {
    const ids = groups[blockIndex]
    const position = ids.indexOf(id)
    const target = position + step
    if (target < 0 || target >= ids.length) return null
    ;[ids[position], ids[target]] = [ids[target], ids[position]]
  } else {
    const target = blockIndex + step
    if (target < 0 || target >= groups.length) return null
    ;[groups[blockIndex], groups[target]] = [groups[target], groups[blockIndex]]
  }
  return groups.flat()
}

/** Sube o baja un bloque entero por encima o por debajo del bloque vecino. */
export function planMoveBlock(exercises, memberId, direction) {
  const blocks = buildExerciseBlocks(exercises ?? [])
  const blockIndex = blocks.findIndex((block) => block.members.some((member) => member.exercise.id === memberId))
  const target = blockIndex + (direction === 'up' ? -1 : 1)
  if (blockIndex < 0 || target < 0 || target >= blocks.length) return null
  const groups = blocks.map((block) => block.members.map((member) => member.exercise.id))
  ;[groups[blockIndex], groups[target]] = [groups[target], groups[blockIndex]]
  return groups.flat()
}

/**
 * Soltar un ejercicio (o un bloque entero, con wholeBlock) sobre otro al arrastrar.
 * - Dentro de su propia superserie: cambia de puesto en el bloque.
 * - Sobre un ejercicio de otro bloque: se coloca antes o después de ese bloque
 *   entero (nunca parte una superserie). Un ejercicio que sale así de su bloque
 *   deja de estar en él (planNormalizeOrder le quita la clave).
 * Devuelve el orden nuevo (ids) o null si no cambia.
 */
export function planDrop(exercises, draggedId, targetId, { wholeBlock = false } = {}) {
  const list = exercises ?? []
  if (draggedId === targetId) return null
  const blocks = buildExerciseBlocks(list)
  const blockOf = (id) => blocks.findIndex((block) => block.members.some((member) => member.exercise.id === id))
  const fromBlock = blockOf(draggedId)
  const toBlock = blockOf(targetId)
  if (fromBlock < 0 || toBlock < 0) return null
  const ids = list.map((exercise) => exercise.id)

  if (!wholeBlock && fromBlock === toBlock) {
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    return ids
  }

  const moving = wholeBlock ? blocks[fromBlock].members.map((member) => member.exercise.id) : [draggedId]
  if (wholeBlock && fromBlock === toBlock) return null
  const remaining = ids.filter((id) => !moving.includes(id))
  const targetMembers = blocks[toBlock].members.map((member) => member.exercise.id)
  const movingDown = ids.indexOf(moving[0]) < ids.indexOf(targetMembers[0])
  const anchor = movingDown ? remaining.indexOf(targetMembers[targetMembers.length - 1]) + 1 : remaining.indexOf(targetMembers[0])
  remaining.splice(anchor, 0, ...moving)
  return remaining.join() === ids.join() ? null : remaining
}

/** Iguala las series del bloque al mayor número. */
export function planEqualizeSets(exercises, memberId) {
  const { block, members } = blockMembersOf(exercises ?? [], memberId)
  if (!block?.isSuperset) return { updates: [] }
  const target = Math.max(...members.map(setsOf))
  return { updates: members.filter((exercise) => setsOf(exercise) !== target).map((exercise) => ({ id: exercise.id, sets: target })) }
}

/**
 * Aplica una lista de cambios (de los plan*) a una lista de ejercicios.
 * Útil para el estado optimista del editor.
 * @template T
 * @param {T[]} exercises
 * @param {Array<{ id: string, [field: string]: unknown }>} updates
 * @returns {T[]}
 */
export function applySupersetUpdates(exercises, updates) {
  const byId = new Map((updates ?? []).map((update) => [update.id, update]))
  return (exercises ?? []).map((exercise) => {
    const update = byId.get(exercise.id)
    if (!update) return exercise
    const { id: _id, ...fields } = update
    return { ...exercise, ...fields }
  })
}
