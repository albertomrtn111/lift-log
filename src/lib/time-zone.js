// «Hoy» en la zona horaria del espacio de trabajo (coaches.timezone). Puro para
// usarlo en servidor y navegador y probarlo con node --test.
//
// El servidor de la web va en UTC: con new Date() o toISOString() «hoy» cambia a
// las 01:00 o las 02:00 en España. El MCP hace lo mismo con todayIn (shared.ts).

/** Sin zona guardada, el espacio trabaja en hora de Madrid. */
export const DEFAULT_TIME_ZONE = 'Europe/Madrid'

/**
 * Zona IANA válida; una vacía o desconocida cae en la zona por defecto.
 * @param {unknown} value
 * @returns {string}
 */
export function resolveTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value.trim() })
    return value.trim()
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/**
 * Fecha (YYYY-MM-DD) de un instante en una zona horaria; por defecto, hoy.
 * @param {string | null | undefined} timeZone
 * @param {Date} [now]
 * @returns {string}
 */
export function todayKeyIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
