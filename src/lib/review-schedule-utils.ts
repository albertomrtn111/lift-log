/**
 * Calcula la siguiente fecha de revisión a partir de una fecha base.
 *
 * Este helper debe mantenerse libre de imports server-only para poder usarse
 * tanto desde server actions como desde componentes cliente.
 */
export function computeNextDueDate(frequencyDays: number, fromDate: Date = new Date()): string {
    const next = new Date(fromDate)
    next.setDate(next.getDate() + frequencyDays)
    return next.toISOString().slice(0, 10)
}
