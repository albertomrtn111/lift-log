/** Reglas de la lista y la ficha de clientes de la sala, sin dependencias para probarlas con node --test. */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

function parts(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''))
    return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null
}

const dayNumber = (year, month, day) => Date.UTC(year, month - 1, day) / 86400000

/**
 * Edad y cumpleaños a partir de la fecha de nacimiento (AAAA-MM-DD) y de hoy.
 * `soon` dice si es hoy, mañana o dentro de una semana.
 * @param {string | null | undefined} birthday
 * @param {string} today
 */
export function birthdayInfo(birthday, today) {
    const born = parts(birthday)
    const now = parts(today)
    if (!born || !now) return null
    let age = now.year - born.year
    if (now.month < born.month || (now.month === born.month && now.day < born.day)) age--
    // El 29 de febrero se celebra el 28 los años que no son bisiestos.
    const leap = year => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const dayIn = year => (born.month === 2 && born.day === 29 && !leap(year) ? 28 : born.day)
    let next = dayNumber(now.year, born.month, dayIn(now.year))
    const current = dayNumber(now.year, now.month, now.day)
    if (next < current) next = dayNumber(now.year + 1, born.month, dayIn(now.year + 1))
    const days = next - current
    return {
        age,
        label: `${born.day} ${MONTHS[born.month - 1]}`,
        days,
        soon: days === 0 ? 'Cumple hoy' : days === 1 ? 'Cumple mañana' : days <= 7 ? `Cumple en ${days} días` : null,
    }
}

/** Minúsculas, sin tildes ni signos. */
export function nameKey(text) {
    return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** ¿El nombre tiene todas las palabras buscadas? */
export function nameMatches(name, query) {
    const words = nameKey(query).split(' ').filter(Boolean)
    const key = nameKey(name)
    return words.every(word => key.includes(word))
}

/**
 * Clientes de la lista según el ámbito: los míos (los que llevo o no lleva nadie) o todo el centro.
 * @template {{ id: string, fullName: string, professionalIds: string[] }} T
 * @param {T[]} clients
 * @param {{ query?: string, scope?: 'mine' | 'all', userId?: string | null }} options
 * @returns {T[]}
 */
export function visibleClients(clients, { query = '', scope = 'all', userId = null } = {}) {
    return clients.filter(client => {
        if (query && !nameMatches(client.fullName, query)) return false
        if (scope === 'mine' && userId) {
            return client.professionalIds.length === 0 || client.professionalIds.includes(userId)
        }
        return true
    })
}

/** El ámbito con el que se abre: los míos si llevo a alguien; si no, todo el centro. */
export function defaultScope(clients, userId) {
    return userId && clients.some(client => client.professionalIds.includes(userId)) ? 'mine' : 'all'
}

/** Objetivos para guardar: sin vacíos ni espacios de más, como mucho 12 de 200 caracteres. */
export function cleanObjectives(points) {
    return (points ?? [])
        .map(point => String(point ?? '').replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 12)
}

const REASONS = { name: 'mismo nombre', email: 'mismo email', phone: 'mismo teléfono' }

/** «mismo email · de baja · lo lleva Marcos». */
export function duplicateText(match) {
    const people = match.professionals?.length ? `lo lleva ${match.professionals.join(', ')}` : 'sin profesional'
    return [REASONS[match.reason], match.active === false ? 'de baja' : '', people].filter(Boolean).join(' · ')
}
