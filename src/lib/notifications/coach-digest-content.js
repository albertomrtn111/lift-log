// Contenido del resumen diario del coach. Puro para probarlo con node --test.
// Recibe los datos ya filtrados y decide qué secciones salen, en qué orden y
// con qué textos. Si no hay nada que contar, no hay resumen.

/** @typedef {{ clientId: string; name: string; detail?: string }} DigestItem */

/**
 * @typedef {{
 *   reviewsToValidate: Array<DigestItem & { aiReady: boolean }>
 *   reviewsUnanswered: Array<DigestItem & { days: number }>
 *   messagesUnanswered: Array<DigestItem & { hours: number }>
 *   expiring: Array<DigestItem & { what: string; endDate: string; daysLeft: number }>
 *   tasksToday: Array<{ title: string; clientName?: string | null; overdue: boolean }>
 *   reviewsGoingOut: DigestItem[]
 * }} DigestData
 */

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

/** @param {number} daysLeft */
function whenLabel(daysLeft) {
  if (daysLeft < 0) return `venció hace ${plural(-daysLeft, 'día', 'días')}`
  if (daysLeft === 0) return 'vence hoy'
  if (daysLeft === 1) return 'vence mañana'
  return `vence en ${daysLeft} días`
}

/**
 * @param {DigestData} data
 * @returns {{
 *   total: number
 *   headline: string
 *   sections: Array<{ key: string; title: string; tab: 'checkins' | 'messages' | 'plan' | 'tasks' | 'calendar'; items: Array<{ clientId?: string; label: string; detail: string }> }>
 * }}
 */
export function buildCoachDigest(data) {
  /** @type {ReturnType<typeof buildCoachDigest>['sections']} */
  const sections = []

  if (data.reviewsToValidate.length > 0) {
    const withAi = data.reviewsToValidate.filter((item) => item.aiReady).length
    sections.push({
      key: 'reviews-to-validate',
      title: withAi > 0
        ? `Revisiones por validar (${data.reviewsToValidate.length}, ${withAi} con borrador de IA)`
        : `Revisiones por validar (${data.reviewsToValidate.length})`,
      tab: 'checkins',
      items: data.reviewsToValidate.map((item) => ({
        clientId: item.clientId,
        label: item.name,
        detail: item.aiReady ? 'Borrador de IA listo' : 'Sin borrador de IA',
      })),
    })
  }

  if (data.messagesUnanswered.length > 0) {
    sections.push({
      key: 'messages-unanswered',
      title: `Mensajes sin contestar (${data.messagesUnanswered.length})`,
      tab: 'messages',
      items: data.messagesUnanswered.map((item) => ({
        clientId: item.clientId,
        label: item.name,
        detail: item.hours >= 48 ? `Esperando desde hace ${Math.floor(item.hours / 24)} días` : `Esperando desde hace ${Math.floor(item.hours)} h`,
      })),
    })
  }

  if (data.reviewsUnanswered.length > 0) {
    sections.push({
      key: 'reviews-unanswered',
      title: `Revisiones sin responder por el atleta (${data.reviewsUnanswered.length})`,
      tab: 'checkins',
      items: data.reviewsUnanswered.map((item) => ({
        clientId: item.clientId,
        label: item.name,
        detail: `Enviada hace ${plural(item.days, 'día', 'días')}`,
      })),
    })
  }

  if (data.expiring.length > 0) {
    sections.push({
      key: 'expiring',
      title: `Planes y objetivos que caducan (${data.expiring.length})`,
      tab: 'plan',
      items: [...data.expiring]
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .map((item) => ({
          clientId: item.clientId,
          label: item.name,
          detail: `${item.what}: ${whenLabel(item.daysLeft)}`,
        })),
    })
  }

  if (data.tasksToday.length > 0) {
    const overdue = data.tasksToday.filter((task) => task.overdue).length
    sections.push({
      key: 'tasks',
      title: overdue > 0
        ? `Tareas de hoy (${data.tasksToday.length}, ${overdue} vencidas)`
        : `Tareas de hoy (${data.tasksToday.length})`,
      tab: 'tasks',
      items: data.tasksToday.map((task) => ({
        label: task.title,
        detail: [task.overdue ? 'Vencida' : null, task.clientName].filter(Boolean).join(' · '),
      })),
    })
  }

  if (data.reviewsGoingOut.length > 0) {
    sections.push({
      key: 'reviews-going-out',
      title: `Revisiones que salen hoy (${data.reviewsGoingOut.length})`,
      tab: 'calendar',
      items: data.reviewsGoingOut.map((item) => ({ clientId: item.clientId, label: item.name, detail: 'Se envían a las 09:00' })),
    })
  }

  const actionable = data.reviewsToValidate.length + data.messagesUnanswered.length
    + data.reviewsUnanswered.length + data.expiring.length + data.tasksToday.length
  const total = actionable + data.reviewsGoingOut.length

  const parts = [
    data.reviewsToValidate.length ? plural(data.reviewsToValidate.length, 'revisión por validar', 'revisiones por validar') : null,
    data.messagesUnanswered.length ? plural(data.messagesUnanswered.length, 'mensaje sin contestar', 'mensajes sin contestar') : null,
    data.expiring.length ? plural(data.expiring.length, 'plan que caduca', 'planes que caducan') : null,
    data.tasksToday.length ? plural(data.tasksToday.length, 'tarea', 'tareas') : null,
  ].filter(Boolean)

  return {
    total,
    headline: parts.length > 0
      ? parts.join(' · ')
      : data.reviewsGoingOut.length > 0
        ? `Hoy ${data.reviewsGoingOut.length === 1 ? 'sale' : 'salen'} ${plural(data.reviewsGoingOut.length, 'revisión', 'revisiones')}`
        : 'Todo al día',
    sections,
  }
}

/**
 * Días enteros entre dos fechas YYYY-MM-DD (to - from).
 * @param {string} from
 * @param {string} to
 */
export function daysBetweenKeys(from, to) {
  const toUtc = (/** @type {string} */ key) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000)
}

/**
 * Fin de un programa de fuerza: su fecha de fin o, si no tiene, el final de
 * sus semanas. null si no se puede saber.
 * @param {{ effective_from?: string | null; effective_to?: string | null; total_weeks?: number | null }} program
 */
export function trainingProgramEndDate(program) {
  const candidates = []
  if (program.effective_to) candidates.push(program.effective_to.slice(0, 10))
  if (program.effective_from && program.total_weeks && program.total_weeks > 0) {
    const [y, m, d] = program.effective_from.slice(0, 10).split('-').map(Number)
    candidates.push(new Date(Date.UTC(y, m - 1, d + program.total_weeks * 7 - 1)).toISOString().slice(0, 10))
  }
  if (candidates.length === 0) return null
  return candidates.sort()[0]
}

/**
 * Resumen semanal del coach (lunes): cómo fue la semana pasada y qué viene.
 * @param {{
 *   reviewsSent: number
 *   reviewsAnswered: number
 *   reviewsApproved: number
 *   athleteMessages: number
 *   coachMessages: number
 *   silentAthletes: Array<{ clientId: string; name: string }>
 *   reviewsThisWeek: number
 *   expiringThisWeek: number
 * }} data
 */
export function buildCoachWeeklyDigest(data) {
  const answerRate = data.reviewsSent > 0 ? Math.round((data.reviewsAnswered / data.reviewsSent) * 100) : null
  const lastWeek = [
    {
      label: 'Revisiones respondidas',
      detail: data.reviewsSent > 0
        ? `${data.reviewsAnswered} de ${data.reviewsSent} enviadas (${answerRate} %)`
        : `${data.reviewsAnswered} (no se envió ninguna)`,
    },
    { label: 'Revisiones validadas', detail: String(data.reviewsApproved) },
    { label: 'Mensajes', detail: `${data.athleteMessages} de tus atletas · ${data.coachMessages} tuyos` },
  ]
  const ahead = [
    { label: 'Revisiones que salen esta semana', detail: String(data.reviewsThisWeek) },
    { label: 'Planes y objetivos que caducan', detail: String(data.expiringThisWeek) },
  ]
  const silent = data.silentAthletes.map((athlete) => ({
    clientId: athlete.clientId,
    label: athlete.name,
    detail: 'Sin responder revisiones en 14 días',
  }))

  /** @type {Array<{ key: string; title: string; tab: 'checkins' | 'messages' | 'plan' | 'tasks' | 'calendar'; items: Array<{ clientId?: string; label: string; detail: string }> }>} */
  const sections = [
    { key: 'last-week', title: 'La semana pasada', tab: 'calendar', items: lastWeek },
    { key: 'this-week', title: 'Esta semana', tab: 'calendar', items: ahead },
  ]
  if (silent.length > 0) {
    sections.push({ key: 'silent', title: `Atletas sin respuesta (${silent.length})`, tab: 'checkins', items: silent })
  }

  return {
    headline: answerRate === null
      ? `${data.reviewsAnswered} revisiones respondidas la semana pasada`
      : `${answerRate} % de revisiones respondidas la semana pasada`,
    sections,
  }
}
