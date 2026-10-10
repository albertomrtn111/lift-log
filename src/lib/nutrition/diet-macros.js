// Motor de macros de la dieta por opciones.
//
// Funciones puras (sin Supabase) para que el editor del coach, la IA y la app
// del cliente calculen exactamente lo mismo. Los alimentos vienen de `foods`:
// macros por `serving_size_g` gramos (100 en casi todos) y, si se prescriben en
// unidades, `unit_weight_g` (1 huevo = 60 g).

/**
 * @typedef {Object} FoodMacros
 * @property {number} kcal
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 * @property {number} [serving_size_g]
 * @property {number | null} [unit_weight_g]
 * @property {string | null} [food_group]
 */

/**
 * @typedef {Object} Macros
 * @property {number} kcal
 * @property {number} protein_g
 * @property {number} carbs_g
 * @property {number} fat_g
 */

/**
 * @typedef {Object} DietItem
 * @property {string} [id]
 * @property {FoodMacros | null} [food]
 * @property {number | null} [quantity_g]
 * @property {boolean} [locked]          No lo toca "Ajustar al objetivo"
 * @property {boolean} [is_alternative]  Alternativa de otro ítem: no suma
 * @property {number | null} [alternative_group]
 * @property {'kcal' | 'protein' | 'carbs' | 'fat' | null} [equivalence_basis]
 */

/**
 * @typedef {Object} MacroTarget
 * @property {number | null} [kcal]
 * @property {number | null} [protein_g]
 * @property {number | null} [carbs_g]
 * @property {number | null} [fat_g]
 */

export const MACRO_KEYS = /** @type {const} */ (['kcal', 'protein_g', 'carbs_g', 'fat_g'])

const BASIS_TO_KEY = { kcal: 'kcal', protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g' }

const GRAM_UNITS = new Set(['g', 'gr', 'grs', 'gramo', 'gramos', 'ml'])
const COUNT_UNITS = new Set([
  'unidad', 'unidades', 'uds', 'ud', 'u', 'ración', 'racion', 'raciones', 'lata', 'latas',
  'rebanada', 'rebanadas', 'rbn', 'onza', 'onzas', 'taza', 'tazas',
])

export function emptyMacros() {
  return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
}

function round1(value) {
  return Math.round(value * 10) / 10
}

/**
 * Gramos que representa una cantidad escrita por el coach.
 * Devuelve null cuando no es medible ("libre", "opcional", unidades sin peso).
 * @param {number | null | undefined} quantity
 * @param {string | null | undefined} unit
 * @param {FoodMacros | null | undefined} food
 */
export function toGrams(quantity, unit, food) {
  if (quantity === null || quantity === undefined || !Number.isFinite(Number(quantity))) return null
  const normalized = String(unit ?? '').trim().toLowerCase()
  if (GRAM_UNITS.has(normalized)) return Number(quantity)
  if (COUNT_UNITS.has(normalized) && food?.unit_weight_g) return Number(quantity) * Number(food.unit_weight_g)
  return null
}

/**
 * Macros de `grams` gramos de un alimento.
 * @param {FoodMacros} food
 * @param {number} grams
 * @returns {Macros}
 */
export function macrosForGrams(food, grams) {
  const base = Number(food.serving_size_g) > 0 ? Number(food.serving_size_g) : 100
  const factor = Number(grams) / base
  return {
    kcal: round1(Number(food.kcal) * factor),
    protein_g: round1(Number(food.protein_g) * factor),
    carbs_g: round1(Number(food.carbs_g) * factor),
    fat_g: round1(Number(food.fat_g) * factor),
  }
}

/**
 * Macros de un ítem, o null si no cuenta (texto libre, sin gramos).
 * @param {DietItem} item
 * @returns {Macros | null}
 */
export function itemMacros(item) {
  if (!item?.food || item.quantity_g === null || item.quantity_g === undefined) return null
  return macrosForGrams(item.food, item.quantity_g)
}

/**
 * Totales de una opción. Las alternativas no suman: el atleta come una u otra.
 * @param {DietItem[]} items
 * @returns {Macros & { uncounted: number }}
 */
export function optionTotals(items) {
  const totals = emptyMacros()
  let uncounted = 0
  for (const item of items ?? []) {
    if (item.is_alternative) continue
    const macros = itemMacros(item)
    if (!macros) {
      uncounted += 1
      continue
    }
    for (const key of MACRO_KEYS) totals[key] += macros[key]
  }
  for (const key of MACRO_KEYS) totals[key] = round1(totals[key])
  return { ...totals, uncounted }
}

// ---------------------------------------------------------------------------
// Desviación respecto al objetivo
// ---------------------------------------------------------------------------

/** Tolerancias: dentro de la primera es "ok", hasta la segunda "warn". */
const TOLERANCE = {
  kcal: { abs: 25, pct: [0.05, 0.12] },
  protein_g: { abs: 4, pct: [0.08, 0.15] },
  carbs_g: { abs: 6, pct: [0.08, 0.15] },
  fat_g: { abs: 3, pct: [0.1, 0.2] },
}

/**
 * Compara totales con el objetivo de la comida, macro a macro.
 * @param {Macros} totals
 * @param {MacroTarget | null | undefined} target
 */
export function compareToTarget(totals, target) {
  /** @type {Record<string, { target: number, value: number, diff: number, pct: number, status: 'ok' | 'warn' | 'off' }>} */
  const result = {}
  let worst = /** @type {'ok' | 'warn' | 'off' | 'none'} */ ('none')
  const rank = { none: -1, ok: 0, warn: 1, off: 2 }

  for (const key of MACRO_KEYS) {
    const goal = target?.[key]
    if (goal === null || goal === undefined || !(Number(goal) > 0)) continue
    const value = Number(totals[key]) || 0
    const diff = round1(value - Number(goal))
    const pct = diff / Number(goal)
    const tolerance = TOLERANCE[key]
    const absDiff = Math.abs(diff)
    const status = absDiff <= tolerance.abs || Math.abs(pct) <= tolerance.pct[0]
      ? 'ok'
      : Math.abs(pct) <= tolerance.pct[1] ? 'warn' : 'off'
    result[key] = { target: Number(goal), value, diff, pct, status }
    if (rank[status] > rank[worst]) worst = status
  }

  return { byMacro: result, status: worst }
}

// ---------------------------------------------------------------------------
// Equivalencias (alternativas dentro de una opción)
// ---------------------------------------------------------------------------

/**
 * Macro que debe igualar una alternativa según el tipo de alimento.
 * @param {FoodMacros | null | undefined} food
 * @returns {'kcal' | 'protein' | 'carbs' | 'fat'}
 */
export function defaultEquivalenceBasis(food) {
  switch (food?.food_group) {
    case 'carbs':
    case 'fruit':
      return 'carbs'
    case 'protein':
    case 'dairy':
      return 'protein'
    case 'fat':
      return 'fat'
    case 'vegetable':
      return 'kcal'
    default: {
      if (!food) return 'kcal'
      const p = Number(food.protein_g) * 4
      const c = Number(food.carbs_g) * 4
      const f = Number(food.fat_g) * 9
      if (p >= c && p >= f) return 'protein'
      if (c >= f) return 'carbs'
      return 'fat'
    }
  }
}

/**
 * Redondeo "de dieta": gramos limpios, o unidades enteras si se pesa por unidad
 * (nadie prescribe medio huevo o medio yogur).
 * @param {number} grams
 * @param {FoodMacros | null | undefined} food
 * @param {{ preferUnits?: boolean }} [options]
 */
export function roundGrams(grams, food, options = {}) {
  if (!Number.isFinite(grams) || grams <= 0) return 0
  if (options.preferUnits && food?.unit_weight_g) {
    const units = Math.max(1, Math.round(grams / Number(food.unit_weight_g)))
    return round1(units * Number(food.unit_weight_g))
  }
  if (grams < 20) return Math.max(1, Math.round(grams))
  return Math.round(grams / 5) * 5
}

/**
 * Gramos de `altFood` que aportan lo mismo que `referenceGrams` de `referenceFood`
 * en el macro `basis`. Null si el alternativo no tiene ese macro.
 * @param {FoodMacros} referenceFood
 * @param {number} referenceGrams
 * @param {FoodMacros} altFood
 * @param {'kcal' | 'protein' | 'carbs' | 'fat'} [basis]
 * @param {{ preferUnits?: boolean }} [options]
 */
export function equivalentGrams(referenceFood, referenceGrams, altFood, basis, options = {}) {
  const resolvedBasis = basis ?? defaultEquivalenceBasis(referenceFood)
  const key = BASIS_TO_KEY[resolvedBasis]
  const referenceAmount = macrosForGrams(referenceFood, referenceGrams)[key]
  const altPerGram = Number(altFood[key]) / (Number(altFood.serving_size_g) > 0 ? Number(altFood.serving_size_g) : 100)
  if (!(altPerGram > 0)) return null
  return roundGrams(referenceAmount / altPerGram, altFood, options)
}

/**
 * Recalcula los gramos de las alternativas de cada grupo a partir del ítem de
 * referencia (el primero no alternativo del grupo). Devuelve ítems nuevos.
 * @template {DietItem} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function syncAlternatives(items) {
  const references = new Map()
  for (const item of items) {
    if (item.alternative_group === null || item.alternative_group === undefined) continue
    if (!item.is_alternative && !references.has(item.alternative_group)) references.set(item.alternative_group, item)
  }

  return items.map((item) => {
    if (!item.is_alternative || item.locked) return item
    const reference = references.get(item.alternative_group)
    if (!reference?.food || !item.food || !reference.quantity_g) return item
    const grams = equivalentGrams(
      reference.food,
      reference.quantity_g,
      item.food,
      item.equivalence_basis ?? defaultEquivalenceBasis(reference.food)
    )
    return grams === null ? item : { ...item, quantity_g: grams }
  })
}

// ---------------------------------------------------------------------------
// Ajustar una opción al objetivo de la comida
// ---------------------------------------------------------------------------

/**
 * Resuelve A x = b (n pequeño) por eliminación gaussiana con pivoteo parcial.
 * @param {number[][]} A
 * @param {number[]} b
 */
function solveLinear(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = M[row][col] / M[col][col]
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Todas las combinaciones de una lista de opciones por posición */
function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((prefix) => list.map((value) => [...prefix, value])), [[]])
}

/** Error relativo cuadrático respecto al objetivo en los macros usados */
function targetError(totals, target, keys) {
  return keys.reduce((sum, key) => {
    const goal = Number(target[key])
    return sum + ((Number(totals[key]) - goal) / Math.max(1, goal)) ** 2
  }, 0)
}

const MIN_SCALE = 0.3
const MAX_SCALE = 3
// Regularización hacia las cantidades del coach, relativa a la escala del
// problema: solo decide cuando hay varias soluciones (p. ej. dos fuentes de HC)
const RIDGE_FACTOR = 1e-3

/**
 * Busca un multiplicador por ítem ajustable que acerque la opción al objetivo,
 * cambiando lo mínimo las proporciones que puso el coach (regresión ridge hacia
 * 1 con límites). Después redondea gramos y recalcula alternativas.
 *
 * - Solo se usan los macros con objetivo. Si hay P/C/G se ignoran las kcal
 *   (salen solas); si solo hay kcal, se escala todo por igual.
 * - Ítems bloqueados, alternativas y texto libre no se tocan, pero sus macros
 *   sí cuentan para el total.
 *
 * @template {DietItem & { unit_based?: boolean }} T
 * @param {T[]} items
 * @param {MacroTarget} target
 * @param {{ skipUnitPass?: boolean }} [options]
 * @returns {{ items: T[], totals: Macros & { uncounted: number }, changed: boolean }}
 */
export function adjustOptionToTarget(items, target, options = {}) {
  const macroKeys = ['protein_g', 'carbs_g', 'fat_g'].filter((key) => Number(target?.[key]) > 0)
  const keys = macroKeys.length > 0 ? macroKeys : (Number(target?.kcal) > 0 ? ['kcal'] : [])
  if (keys.length === 0) return { items, totals: optionTotals(items), changed: false }

  const adjustableIdx = []
  const fixed = emptyMacros()
  items.forEach((item, index) => {
    if (item.is_alternative) return
    const macros = itemMacros(item)
    if (!macros) return
    if (item.locked || !(Number(item.quantity_g) > 0)) {
      for (const key of MACRO_KEYS) fixed[key] += macros[key]
      return
    }
    adjustableIdx.push(index)
  })
  if (adjustableIdx.length === 0) return { items, totals: optionTotals(items), changed: false }

  // M[k][i]: aporte del ítem i (con sus gramos actuales) al macro k
  const contributions = adjustableIdx.map((index) => itemMacros(items[index]))
  const M = keys.map((key) => contributions.map((macros) => macros[key]))
  const T = keys.map((key) => Number(target[key]) - fixed[key])
  // Error relativo: cada macro pesa lo mismo independientemente de su escala
  const W = keys.map((key) => 1 / Math.max(1, Number(target[key])) ** 2)

  const n = adjustableIdx.length
  let scale = new Array(n).fill(1)
  const clamped = new Array(n).fill(false)

  for (let iteration = 0; iteration < n + 1; iteration++) {
    const free = scale.map((_, i) => i).filter((i) => !clamped[i])
    if (free.length === 0) break

    // Residuo con los ítems ya fijados en su límite
    const residual = T.map((t, k) => t - scale.reduce((sum, s, i) => (clamped[i] ? sum + s * M[k][i] : sum), 0))
    const A = free.map((i) => free.map((j) => {
      let value = 0
      for (let k = 0; k < keys.length; k++) value += W[k] * M[k][i] * M[k][j]
      return value
    }))
    const ridge = RIDGE_FACTOR * Math.max(1e-9, A.reduce((sum, row, i) => sum + row[i], 0) / free.length)
    A.forEach((row, i) => { row[i] += ridge })
    const b = free.map((i) => {
      let value = ridge
      for (let k = 0; k < keys.length; k++) value += W[k] * M[k][i] * residual[k]
      return value
    })
    const solution = solveLinear(A, b)
    if (!solution) break

    let newlyClamped = false
    free.forEach((i, position) => {
      const value = solution[position]
      if (value < MIN_SCALE || value > MAX_SCALE) {
        scale[i] = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
        clamped[i] = true
        newlyClamped = true
      } else {
        scale[i] = value
      }
    })
    if (!newlyClamped) break
  }

  let changed = false
  const adjusted = items.map((item, index) => {
    const position = adjustableIdx.indexOf(index)
    if (position === -1) return item
    const grams = roundGrams(Number(item.quantity_g) * scale[position], item.food, { preferUnits: Boolean(item.unit_based) })
    if (grams !== item.quantity_g) changed = true
    return { ...item, quantity_g: grams }
  })

  // Segunda pasada: las unidades se fijan en un número entero y los alimentos en
  // gramos compensan. Se prueba redondear cada unidad hacia arriba y hacia abajo
  // (1,4 huevos puede cuadrar mejor con 2 que con 1) y se queda la mejor.
  const unitIdx = adjustableIdx.filter((index) => items[index].unit_based && items[index].food?.unit_weight_g)
  if (unitIdx.length > 0 && !options.skipUnitPass) {
    const continuous = new Map(adjustableIdx.map((index, position) => [index, Number(items[index].quantity_g) * scale[position]]))
    const choices = unitIdx.map((index) => {
      const unit = Number(items[index].food.unit_weight_g)
      const exact = (continuous.get(index) ?? 0) / unit
      const down = Math.max(1, Math.floor(exact))
      const up = Math.max(1, Math.ceil(exact))
      return down === up ? [down] : [down, up]
    })

    let best = null
    const combos = unitIdx.length <= 4 ? cartesian(choices) : [choices.map((options) => options[0])]
    for (const combo of combos) {
      const pinned = items.map((item, index) => {
        const position = unitIdx.indexOf(index)
        if (position === -1) return item
        return { ...item, quantity_g: round1(combo[position] * Number(item.food.unit_weight_g)), locked: true }
      })
      const candidate = adjustOptionToTarget(pinned, target, { skipUnitPass: true })
      const error = targetError(candidate.totals, target, keys)
      if (!best || error < best.error) best = { error, items: candidate.items }
    }

    const restored = best.items.map((item, index) => (unitIdx.includes(index) ? { ...item, locked: items[index].locked } : item))
    const changedAfter = restored.some((item, index) => item.quantity_g !== items[index].quantity_g)
    return { items: restored, totals: optionTotals(restored), changed: changedAfter }
  }

  const synced = syncAlternatives(adjusted)
  return { items: synced, totals: optionTotals(synced), changed }
}
