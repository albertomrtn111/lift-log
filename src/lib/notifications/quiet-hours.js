// Horas de silencio y zona horaria de cada usuario. Puro para probarlo con
// node --test.

/** @param {string | null | undefined} tz */
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * «HH:MM» o «HH:MM:SS» → minutos desde medianoche; null si no es una hora.
 * @param {string | null | undefined} time
 */
export function minutesOfDay(time) {
  const match = String(time ?? '').match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/**
 * Fecha y minuto del día en una zona horaria.
 * @param {Date} date
 * @param {string} tz
 */
export function zonedClock(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (/** @type {string} */ type) => parts.find((part) => part.type === type)?.value || '0'
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
  }
}

/**
 * Si ahora es hora de silencio, devuelve cuándo termina; si no, null.
 * El tramo puede cruzar la medianoche (22:00 → 08:00).
 * @param {{ now: Date; tz: string; enabled: boolean; start: string; end: string }} input
 * @returns {Date | null}
 */
export function quietHoursEnd({ now, tz, enabled, start, end }) {
  if (!enabled) return null
  const from = minutesOfDay(start)
  const to = minutesOfDay(end)
  if (from === null || to === null || from === to) return null

  const { minutes } = zonedClock(now, isValidTimezone(tz) ? tz : 'Europe/Madrid')
  let untilEnd = null
  if (from < to) {
    if (minutes >= from && minutes < to) untilEnd = to - minutes
  } else if (minutes >= from) {
    untilEnd = 24 * 60 - minutes + to
  } else if (minutes < to) {
    untilEnd = to - minutes
  }
  if (untilEnd === null) return null

  const startOfMinute = Math.floor(now.getTime() / 60_000) * 60_000
  return new Date(startOfMinute + untilEnd * 60_000)
}

const ATHLETE_KIND_LABELS = {
  message: ['mensaje de tu entrenador', 'mensajes de tu entrenador'],
  review_created: ['revisión nueva', 'revisiones nuevas'],
  review_reminder: ['recordatorio de revisión', 'recordatorios de revisión'],
  review_approved: ['respuesta a tu revisión', 'respuestas a tus revisiones'],
  review_feedback: ['respuesta a tu revisión', 'respuestas a tus revisiones'],
  plan_updated: ['cambio en tu plan', 'cambios en tu plan'],
  strava_activity: ['actividad importada', 'actividades importadas'],
}

const COACH_KIND_LABELS = {
  message: ['mensaje', 'mensajes'],
  checkin_submitted: ['revisión respondida', 'revisiones respondidas'],
  onboarding_submitted: ['formulario inicial', 'formularios iniciales'],
  tasks_same_day: ['recordatorio de tareas', 'recordatorios de tareas'],
  tasks_day_before: ['recordatorio de tareas', 'recordatorios de tareas'],
}

/**
 * Push único que sale al terminar las horas de silencio.
 * @param {string[]} kinds  qué avisos se retuvieron (uno por aviso)
 * @param {'client' | 'coach'} audience
 */
export function buildHeldSummaryCopy(kinds, audience) {
  /** @type {Record<string, [string, string]>} */
  const labels = /** @type {any} */ (audience === 'coach' ? COACH_KIND_LABELS : ATHLETE_KIND_LABELS)
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const kind of kinds) {
    const label = labels[kind]
    const key = label ? label[1] : 'otros'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const parts = [...counts.entries()].map(([plural, count]) => {
    if (plural === 'otros') return `${count} ${count === 1 ? 'aviso' : 'avisos'}`
    const label = Object.values(labels).find((pair) => pair[1] === plural)
    return `${count} ${count === 1 ? label?.[0] : plural}`
  })
  const body = parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`

  return {
    title: kinds.length === 1 ? 'Tienes un aviso nuevo' : `Tienes ${kinds.length} avisos nuevos`,
    body: `Mientras descansabas: ${body}.`,
  }
}

export const DEFAULT_CLIENT_DELIVERY_SETTINGS = {
  reviews_email_enabled: true,
  quiet_hours_enabled: true,
  quiet_start: '22:00',
  quiet_end: '08:00',
  timezone: null,
  workout_reminder_enabled: false,
  workout_reminder_time: '08:00',
  week_summary_enabled: true,
}

export const DEFAULT_COACH_QUIET_HOURS = {
  quiet_hours_enabled: false,
  quiet_start: '22:00',
  quiet_end: '08:00',
}

/** @param {unknown} value @param {string} fallback */
function normalizeHour(value, fallback) {
  const minutes = minutesOfDay(typeof value === 'string' ? value : null)
  if (minutes === null) return fallback
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Ajustes de entrega del atleta: email de revisiones, horas de silencio, zona
 * horaria, entreno del día y resumen semanal. Lo que no sea válido vuelve a su
 * valor por defecto.
 * @param {Record<string, unknown> | null | undefined} input
 */
export function sanitizeClientDeliverySettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  const defaults = DEFAULT_CLIENT_DELIVERY_SETTINGS
  return {
    reviews_email_enabled: typeof source.reviews_email_enabled === 'boolean' ? source.reviews_email_enabled : defaults.reviews_email_enabled,
    quiet_hours_enabled: typeof source.quiet_hours_enabled === 'boolean' ? source.quiet_hours_enabled : defaults.quiet_hours_enabled,
    quiet_start: normalizeHour(source.quiet_start, defaults.quiet_start),
    quiet_end: normalizeHour(source.quiet_end, defaults.quiet_end),
    timezone: isValidTimezone(/** @type {string} */ (source.timezone)) ? /** @type {string} */ (source.timezone) : null,
    workout_reminder_enabled: typeof source.workout_reminder_enabled === 'boolean' ? source.workout_reminder_enabled : defaults.workout_reminder_enabled,
    workout_reminder_time: normalizeHour(source.workout_reminder_time, defaults.workout_reminder_time),
    week_summary_enabled: typeof source.week_summary_enabled === 'boolean' ? source.week_summary_enabled : defaults.week_summary_enabled,
  }
}

/**
 * Horas de silencio del coach (su zona horaria está en coaches.timezone).
 * @param {Record<string, unknown> | null | undefined} input
 */
export function sanitizeCoachQuietHours(input) {
  const source = input && typeof input === 'object' ? input : {}
  const defaults = DEFAULT_COACH_QUIET_HOURS
  return {
    quiet_hours_enabled: typeof source.quiet_hours_enabled === 'boolean' ? source.quiet_hours_enabled : defaults.quiet_hours_enabled,
    quiet_start: normalizeHour(source.quiet_start, defaults.quiet_start),
    quiet_end: normalizeHour(source.quiet_end, defaults.quiet_end),
  }
}
