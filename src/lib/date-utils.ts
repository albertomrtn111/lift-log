/**
 * Timezone-safe date utilities.
 *
 * These helpers avoid the classic UTC-shift bug where
 * `new Date('2026-03-05').toISOString()` → "2026-03-04T23:00:00Z"
 * in UTC+1 timezones like Europe/Madrid.
 */

/**
 * Convert a Date object to a local "YYYY-MM-DD" string
 * without any UTC conversion.
 *
 * Use this instead of `date.toISOString().split('T')[0]`.
 */
export function toLocalDateStr(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/**
 * Parse a "YYYY-MM-DD" string into a local Date (midnight local time).
 *
 * Use this instead of `new Date('YYYY-MM-DD')`, which parses as UTC midnight
 * and then shifts to the previous day in positive-offset timezones.
 */
export function parseLocalDate(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d)
}
