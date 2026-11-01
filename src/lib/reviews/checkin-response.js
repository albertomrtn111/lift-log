// `checkins.submitted_at` tenía DEFAULT now() en la base de datos, así que las
// revisiones que se envían al atleta nacen con submitted_at = created_at aunque
// nadie las haya respondido. Solo el formulario del atleta (form-submit) fija una
// fecha de respuesta real y pasa el estado a 'reviewed'.
//
// Estados: pending = enviada y esperando al atleta; reviewed = respondida;
// archived = sustituida por una nueva (respondida o no).

/**
 * Fecha real en que el atleta respondió la revisión, o null si no la ha respondido.
 *
 * @param {{ status: string | null, submitted_at: string | null, created_at: string }} checkin
 * @returns {string | null}
 */
export function getCheckinResponseDate(checkin) {
  if (!checkin.submitted_at) return null
  if (checkin.status === 'pending') return null
  // Respaldo del DEFAULT now(): misma marca de tiempo que la creación.
  if (new Date(checkin.submitted_at).getTime() === new Date(checkin.created_at).getTime()) return null
  return checkin.submitted_at
}

/**
 * @param {{ status: string | null, submitted_at: string | null, created_at: string }} checkin
 * @returns {boolean}
 */
export function hasAthleteResponse(checkin) {
  return getCheckinResponseDate(checkin) !== null
}
