function assertBillingMonth(year: number, month: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Periodo de facturación inválido.')
    }
}

export function getBillingPeriodFromDate(date: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!match) throw new Error('Fecha de alta inválida.')

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    assertBillingMonth(year, month)

    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() + 1 !== month
        || parsed.getUTCDate() !== day
    ) throw new Error('Fecha de alta inválida.')

    return { year, month }
}

/** Last calendar day as YYYY-MM-DD, without converting local midnight to UTC. */
export function getLastDayOfBillingMonth(year: number, month: number) {
    assertBillingMonth(year, month)
    const day = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
