export const AGE_GROUPS = [
    { key: 'under18', label: 'Menores de 18', color: '#2563eb' },
    { key: '18to30', label: '18–30', color: '#0d9488' },
    { key: '31to40', label: '31–40', color: '#d97706' },
    { key: '41to60', label: '41–60', color: '#7c3aed' },
    { key: 'over60', label: 'Más de 60', color: '#dc2626' },
]

const SPAIN_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
})

/** @param {string | null | undefined} birthDate @param {Date} today */
export function getAge(birthDate, today = new Date()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? '')
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const birth = new Date(Date.UTC(year, month - 1, day))
    if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
        return null
    }

    const todayParts = Object.fromEntries(
        SPAIN_DATE_FORMATTER.formatToParts(today).map((part) => [part.type, Number(part.value)])
    )
    let age = todayParts.year - year
    if (todayParts.month < month || (todayParts.month === month && todayParts.day < day)) {
        age -= 1
    }
    return age >= 0 ? age : null
}

/** @param {number} age */
export function getAgeGroupKey(age) {
    if (age < 18) return 'under18'
    if (age <= 30) return '18to30'
    if (age <= 40) return '31to40'
    if (age <= 60) return '41to60'
    return 'over60'
}

/**
 * @param {string[]} activeClientIds
 * @param {{ client_id: string, birth_date: string | null }[]} baselines
 * @param {Date} today
 */
export function buildAgeDistribution(activeClientIds, baselines, today = new Date()) {
    const birthDateByClient = new Map(baselines.map((row) => [row.client_id, row.birth_date]))
    const counts = Object.fromEntries(AGE_GROUPS.map((group) => [group.key, 0]))
    let unknown = 0

    for (const clientId of activeClientIds) {
        const age = getAge(birthDateByClient.get(clientId), today)
        if (age === null) {
            unknown += 1
        } else {
            counts[getAgeGroupKey(age)] += 1
        }
    }

    return {
        groups: AGE_GROUPS.map((group) => ({ ...group, count: counts[group.key] })),
        known: activeClientIds.length - unknown,
        unknown,
        total: activeClientIds.length,
    }
}
