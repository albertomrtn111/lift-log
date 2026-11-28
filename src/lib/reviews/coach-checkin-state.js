// Cómo ve el coach cada check-in en la ficha del atleta (Resumen y Revisiones).
//
// `submitted_at` es la fecha en que el atleta respondió; null = no respondió
// (desde el 2026-11-01 la columna ya no tiene DEFAULT now()).
// Estados del check-in: pending = enviado y vigente, esperando al atleta;
// reviewed = respondido; archived = cerrado por el coach o sustituido por uno
// nuevo (respondido o no). Un check-in sin respuesta que ya no está en pending
// caducó: el atleta no lo respondió a tiempo y no hay nada que revisar.

/**
 * @typedef {{
 *   status: string | null,
 *   message_to_client?: string | null,
 * }} CoachReviewLike
 *
 * @typedef {{
 *   status: string | null,
 *   submitted_at: string | null,
 *   created_at?: string | null,
 *   review?: CoachReviewLike | null,
 * }} CoachCheckinLike
 */

/**
 * answered = el atleta lo respondió; waiting = vigente y sin responder;
 * expired = sin responder y ya no vigente (caducado o sustituido).
 *
 * @param {CoachCheckinLike} checkin
 * @returns {'answered' | 'waiting' | 'expired'}
 */
export function getCheckinAnswerState(checkin) {
  if (checkin.submitted_at) return 'answered'
  return checkin.status === 'pending' ? 'waiting' : 'expired'
}

/**
 * Etiqueta del check-in en la pestaña Revisiones. `tone` decide el color.
 *
 * @param {CoachCheckinLike} checkin
 * @returns {{ tone: 'waiting' | 'expired' | 'none' | 'sent' | 'approved' | 'draft' | 'rejected', label: string }}
 */
export function getCoachCheckinBadge(checkin) {
  const state = getCheckinAnswerState(checkin)
  if (state === 'waiting') return { tone: 'waiting', label: 'Esperando respuesta' }
  if (state === 'expired') return { tone: 'expired', label: 'Caducada' }

  const review = checkin.review
  if (!review) return { tone: 'none', label: 'Sin revisión' }
  if (review.status === 'approved' && review.message_to_client?.trim()) return { tone: 'sent', label: 'Aprobada y enviada' }
  if (review.status === 'approved') return { tone: 'approved', label: 'Aprobada' }
  if (review.status === 'draft') return { tone: 'draft', label: 'Borrador' }
  return { tone: 'rejected', label: 'Rechazada' }
}

/**
 * Se puede cerrar (aprobar) o enviar feedback solo si el atleta respondió y la
 * revisión sigue abierta: sin revisión, en borrador, o aprobada sin feedback.
 *
 * @param {CoachCheckinLike} checkin
 * @returns {boolean}
 */
export function canCloseCheckinReview(checkin) {
  if (getCheckinAnswerState(checkin) !== 'answered') return false
  if (checkin.status === 'pending') return false
  const review = checkin.review
  return (
    !review ||
    review.status === 'draft' ||
    (review.status === 'approved' && !review.message_to_client?.trim())
  )
}

/**
 * Orden de la pestaña Revisiones: primero el check-in vigente que espera al
 * atleta y después el resto, del más reciente al más antiguo según la fecha de
 * respuesta (o la de envío si no se respondió). No cambia el array recibido.
 *
 * @template {CoachCheckinLike} T
 * @param {T[]} checkins
 * @returns {T[]}
 */
export function sortCheckinsForCoach(checkins) {
  const time = (/** @type {CoachCheckinLike} */ checkin) => {
    const value = checkin.submitted_at ?? checkin.created_at ?? null
    const ms = value ? new Date(value).getTime() : NaN
    return Number.isNaN(ms) ? -Infinity : ms
  }
  return [...checkins].sort((a, b) => {
    const aWaiting = getCheckinAnswerState(a) === 'waiting' ? 1 : 0
    const bWaiting = getCheckinAnswerState(b) === 'waiting' ? 1 : 0
    if (aWaiting !== bWaiting) return bWaiting - aWaiting
    const diff = time(b) - time(a)
    return diff > 0 ? 1 : diff < 0 ? -1 : 0
  })
}
