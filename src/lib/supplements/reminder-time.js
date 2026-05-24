/**
 * @typedef {{ date: string; time: string }} ReminderTarget
 */

/**
 * @param {Date} date
 * @param {string} timezone
 * @returns {ReminderTarget}
 */
export function dateTimeInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/**
 * @param {{
 *   now?: Date;
 *   timezone: string;
 *   requestedDate?: string | null;
 *   requestedTime?: string | null;
 *   lookbackMinutes?: number;
 * }} options
 * @returns {ReminderTarget[]}
 */
export function getReminderTargets({
  now = new Date(),
  timezone,
  requestedDate = null,
  requestedTime = null,
  lookbackMinutes = 5,
}) {
  if (requestedDate && requestedTime) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && /^\d{2}:\d{2}$/.test(requestedTime)) {
      return [{ date: requestedDate, time: requestedTime }]
    }
    return []
  }

  const safeLookbackMinutes = Math.min(30, Math.max(1, Number(lookbackMinutes) || 5))
  const seen = new Set()
  const targets = []

  for (let offset = safeLookbackMinutes - 1; offset >= 0; offset -= 1) {
    const candidate = new Date(now.getTime() - offset * 60_000)
    const target = dateTimeInTimezone(candidate, timezone)
    const key = `${target.date}|${target.time}`
    if (!seen.has(key)) {
      seen.add(key)
      targets.push(target)
    }
  }

  return targets
}
