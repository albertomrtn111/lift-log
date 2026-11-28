// Reglas puras de las revisiones del coach: qué campos se pueden guardar desde la
// pantalla y cuándo una revisión y su check-in van juntos. Sin base de datos, para
// usarlas en las acciones y en el análisis de IA y probarlas con node --test.

/** Campos de texto que el coach puede editar en una revisión. */
const TEXT_FIELDS = ['summary', 'message_to_client']
/** Campos JSON que el coach puede editar en una revisión. */
const JSON_FIELDS = ['analysis', 'proposal']

/** Los únicos campos de reviews que se guardan desde la pantalla del coach. */
export const EDITABLE_REVIEW_FIELDS = Object.freeze([...TEXT_FIELDS, ...JSON_FIELDS])

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * @param {object} obj
 * @param {string} key
 */
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Se queda solo con los campos editables y con el tipo correcto: texto o null en
 * summary y message_to_client, objeto o null en analysis y proposal. Lo demás se ignora.
 *
 * @param {unknown} input
 * @returns {{
 *   summary?: string | null,
 *   message_to_client?: string | null,
 *   analysis?: Record<string, unknown> | null,
 *   proposal?: Record<string, unknown> | null,
 * }}
 */
export function pickEditableReviewFields(input) {
  /** @type {Record<string, unknown>} */
  const out = {}
  if (!isPlainObject(input)) return out

  for (const key of TEXT_FIELDS) {
    if (!hasOwn(input, key)) continue
    const value = input[key]
    if (value === null || typeof value === 'string') out[key] = value
  }

  for (const key of JSON_FIELDS) {
    if (!hasOwn(input, key)) continue
    const value = input[key]
    if (value === null || isPlainObject(value)) out[key] = value
  }

  return out
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isId(value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * La revisión es de ese check-in y los dos son del mismo espacio y del mismo atleta.
 *
 * @param {{ checkin_id?: unknown, coach_id?: unknown, client_id?: unknown } | null | undefined} review
 * @param {{ id?: unknown, coach_id?: unknown, client_id?: unknown } | null | undefined} checkin
 * @returns {boolean}
 */
export function reviewMatchesCheckin(review, checkin) {
  if (!review || !checkin) return false
  if (!isId(review.checkin_id) || !isId(checkin.id) || review.checkin_id !== checkin.id) return false
  if (!isId(review.coach_id) || review.coach_id !== checkin.coach_id) return false
  if (!isId(review.client_id) || review.client_id !== checkin.client_id) return false
  return true
}

/**
 * La revisión es del espacio indicado y, si se indica, de ese atleta. Sin espacio no vale nada.
 *
 * @param {{ coach_id?: unknown, client_id?: unknown } | null | undefined} review
 * @param {{ coachId?: string | null, clientId?: string | null } | null | undefined} scope
 * @returns {boolean}
 */
export function reviewInScope(review, scope) {
  if (!review || !scope || !isId(scope.coachId)) return false
  if (review.coach_id !== scope.coachId) return false
  if (scope.clientId != null && review.client_id !== scope.clientId) return false
  return true
}
