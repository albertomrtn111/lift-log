// Bandeja de actividades de Strava pendientes: agrupación por día y textos.
// Puro (fechas como YYYY-MM-DD) para poder probarlo con node --test.

export interface InboxActivityLike {
    id: string
    local_date: string
    distance_meters: number | null
    moving_time_seconds: number | null
}

export interface InboxDayGroup<T extends InboxActivityLike> {
    date: string
    label: string
    items: T[]
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function toUtcDate(dateKey: string) {
    const [y, m, d] = dateKey.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
}

export function daysBetween(fromKey: string, toKey: string) {
    return Math.round((toUtcDate(toKey).getTime() - toUtcDate(fromKey).getTime()) / 86_400_000)
}

/** «Hoy», «Ayer» o «Lunes 6 oct» */
export function dayLabel(dateKey: string, todayKey: string) {
    const diff = daysBetween(dateKey, todayKey)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    const date = toUtcDate(dateKey)
    const weekday = WEEKDAYS[date.getUTCDay()]
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** Agrupa por día manteniendo el orden cronológico de entrada */
export function groupByDay<T extends InboxActivityLike>(activities: T[], todayKey: string): InboxDayGroup<T>[] {
    const groups: InboxDayGroup<T>[] = []
    for (const activity of activities) {
        const last = groups[groups.length - 1]
        if (last && last.date === activity.local_date) {
            last.items.push(activity)
        } else {
            groups.push({ date: activity.local_date, label: dayLabel(activity.local_date, todayKey), items: [activity] })
        }
    }
    return groups
}

/** «12,4 km · 1 h 05 min» de todo lo pendiente */
export function inboxTotals(activities: InboxActivityLike[]) {
    const meters = activities.reduce((sum, a) => sum + (Number(a.distance_meters) || 0), 0)
    const seconds = activities.reduce((sum, a) => sum + (Number(a.moving_time_seconds) || 0), 0)
    const km = (meters / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })
    const totalMinutes = Math.round(seconds / 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const time = hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`
    return { km, time, hasDistance: meters > 0 }
}

/** Rango de fechas de la bandeja: «del 3 al 12 oct» o «del 28 sep al 3 oct» */
export function inboxRange(activities: InboxActivityLike[]) {
    if (activities.length === 0) return ''
    const dates = activities.map(a => a.local_date).sort()
    const first = toUtcDate(dates[0])
    const last = toUtcDate(dates[dates.length - 1])
    if (dates[0] === dates[dates.length - 1]) return `el ${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]}`
    const sameMonth = first.getUTCMonth() === last.getUTCMonth() && first.getUTCFullYear() === last.getUTCFullYear()
    return sameMonth
        ? `del ${first.getUTCDate()} al ${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]}`
        : `del ${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]} al ${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]}`
}

export const RPE_LABELS: Record<number, string> = {
    1: 'Muy suave', 2: 'Muy suave', 3: 'Suave', 4: 'Suave', 5: 'Moderado',
    6: 'Moderado', 7: 'Duro', 8: 'Duro', 9: 'Muy duro', 10: 'Máximo',
}
