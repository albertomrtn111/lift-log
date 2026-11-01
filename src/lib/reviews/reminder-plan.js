// Cuándo recordar al atleta una revisión sin responder. Puro (fechas como
// YYYY-MM-DD en la zona del planificador) para probarlo con node --test.
//
// Reglas (el cron corre una vez al día, a las 09:00):
//  - Nada antes de 20 h desde que se envió la revisión.
//  - Primer recordatorio al día siguiente del envío.
//  - Recordatorio final (también por email) la víspera de que el planificador
//    la archive al crear la siguiente. Si la revisión no tiene programación,
//    el final llega a los 3 días.
//  - Como mucho uno al día y dos en total.

const MIN_AGE_HOURS = 20
const UNSCHEDULED_FINAL_HOURS = 72

/** @param {string} dateKey @param {number} days */
export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * @param {{
 *   createdAt: string
 *   now: Date
 *   today: string
 *   archiveDate?: string | null
 *   stageSent?: number
 *   lastSentDay?: string | null
 * }} input
 * @returns {{ stage: 1 | 2; final: boolean; archivesTomorrow: boolean } | null}
 */
export function planReviewReminder({ createdAt, now, today, archiveDate = null, stageSent = 0, lastSentDay = null }) {
  if (stageSent >= 2) return null
  if (lastSentDay === today) return null

  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / 3_600_000
  if (!Number.isFinite(ageHours) || ageHours < MIN_AGE_HOURS) return null

  const archivesTomorrow = archiveDate === addDaysToDateKey(today, 1)
  if (archivesTomorrow) return { stage: 2, final: true, archivesTomorrow }
  if (stageSent === 0) return { stage: 1, final: false, archivesTomorrow }
  if (!archiveDate && ageHours >= UNSCHEDULED_FINAL_HOURS) return { stage: 2, final: true, archivesTomorrow }
  return null
}

/**
 * @param {{ final: boolean; archivesTomorrow: boolean; templateName?: string | null }} input
 */
export function buildReviewReminderCopy({ final, archivesTomorrow, templateName = null }) {
  const name = String(templateName ?? '').trim()

  if (final && archivesTomorrow) {
    return {
      title: 'Último día para enviar tu revisión',
      body: `${name ? `${name}: m` : 'M'}añana se archiva y tu entrenador no podrá revisarla.`,
    }
  }

  if (final) {
    return {
      title: 'Tu revisión sigue pendiente',
      body: `${name ? `${name}: t` : 'T'}u entrenador la está esperando para ajustar tu plan.`,
    }
  }

  return {
    title: 'Tienes una revisión pendiente',
    body: `${name ? `${name}: t` : 'T'}u entrenador la necesita para ajustar tu plan.`,
  }
}

/**
 * Clave única por revisión y etapa: candado para no repetir recordatorios.
 * @param {string} checkinId
 * @param {number} stage
 */
export function reviewReminderKey(checkinId, stage) {
  return `review-reminder:${checkinId}:${stage}`
}
