// ¿Puede el atleta enviar o cambiar las respuestas de un check-in?
//
// Estados del check-in: pending = esperando al atleta; reviewed = respondido y
// pendiente de que el coach lo cierre; archived = cerrado por el coach (al
// aprobarlo o al saltárselo) o sustituido por uno nuevo sin responder.
// Estados de la revisión del coach: draft (abierta), approved o rejected (cerrada).
//
// - open: pendiente; se rellena y se envía por primera vez.
// - correcting: ya enviado pero el coach aún no lo ha cerrado. Se deja corregir:
//   el coach todavía no ha decidido nada sobre esas respuestas, así que un error
//   del atleta (un peso mal escrito, una foto que faltaba) se arregla antes de que
//   lo revise, y el análisis de IA se rehace con lo corregido.
// - closed: el coach ya lo ha cerrado. No se toca nada: ni respuestas, ni fotos,
//   ni la aprobación ni el análisis.
// - expired: se archivó sin respuesta (lo sustituyó otro o se retiró). Tampoco se
//   puede enviar: reabrirlo crearía una revisión fantasma al coach.

/** @typedef {'open' | 'correcting' | 'closed' | 'expired'} CheckinSubmissionState */

export const CLOSED_REVIEW_STATUSES = Object.freeze(['approved', 'rejected'])

/**
 * @param {{ checkinStatus: string | null | undefined, reviewStatus?: string | null, answered?: boolean }} input
 * @returns {CheckinSubmissionState}
 */
export function getCheckinSubmissionState({ checkinStatus, reviewStatus = null, answered = false }) {
  if (reviewStatus && CLOSED_REVIEW_STATUSES.includes(reviewStatus)) return 'closed'
  if (checkinStatus === 'pending') return 'open'
  if (checkinStatus === 'reviewed') return 'correcting'
  if (checkinStatus === 'archived') return answered ? 'closed' : 'expired'
  // Estado desconocido: mejor no dejar cambiar nada
  return 'closed'
}

/**
 * Puede enviar respuestas, guardar borrador o subir y quitar fotos.
 * @param {CheckinSubmissionState} state
 */
export function canAthleteChangeCheckin(state) {
  return state === 'open' || state === 'correcting'
}

/** Solo un check-in pendiente guarda borrador; uno ya enviado se corrige y se reenvía. */
export function canSaveCheckinDraft(/** @type {CheckinSubmissionState} */ state) {
  return state === 'open'
}

const BLOCKED_COPY = Object.freeze({
  closed: Object.freeze({
    title: 'Revisión cerrada',
    message: 'Esta revisión ya la ha cerrado tu coach, así que no se pueden cambiar las respuestas ni las fotos. Si quieres contarle algo más, escríbele por el chat.',
  }),
  expired: Object.freeze({
    title: 'Revisión no disponible',
    message: 'Esta revisión ya no está abierta: tu coach la ha sustituido por otra o la ha retirado. Busca la más reciente en tus revisiones.',
  }),
})

/**
 * Texto para el atleta cuando no puede enviar, o null si puede.
 * @param {CheckinSubmissionState} state
 * @returns {{ title: string, message: string } | null}
 */
export function checkinBlockedCopy(state) {
  if (state === 'closed' || state === 'expired') return BLOCKED_COPY[state]
  return null
}
