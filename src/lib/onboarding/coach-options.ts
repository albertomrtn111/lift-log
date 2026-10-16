/** Opciones de "Tu espacio está listo" (compartidas entre cliente y servidor) */

export const DISCIPLINES = [
    { id: 'strength', label: 'Fuerza' },
    { id: 'running', label: 'Running' },
    { id: 'hybrid', label: 'Híbrido' },
    { id: 'nutrition', label: 'Nutrición' },
] as const

export const EXPECTED_ATHLETES = [
    { id: '1-10', label: '1–10' },
    { id: '11-25', label: '11–25' },
    { id: '26-50', label: '26–50' },
    { id: '50+', label: 'Más de 50' },
] as const

export type DisciplineId = (typeof DISCIPLINES)[number]['id']
export type ExpectedAthletesId = (typeof EXPECTED_ATHLETES)[number]['id']

export function isDisciplineId(value: unknown): value is DisciplineId {
    return DISCIPLINES.some(option => option.id === value)
}

export function isExpectedAthletesId(value: unknown): value is ExpectedAthletesId {
    return EXPECTED_ATHLETES.some(option => option.id === value)
}
