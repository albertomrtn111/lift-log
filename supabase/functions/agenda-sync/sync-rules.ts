// Reglas de sincronización, sin red ni base de datos.

/** Por debajo de esta parte de lo habitual, la respuesta se trata como incompleta. */
export const INCOMPLETE_RATIO = 0.6

/** Ventana de cada pasada: la rápida mira hoy y mañana; la completa, de 7 días atrás a 21 adelante. */
export function syncWindow(kind: 'quick' | 'full', today: string) {
  const shift = (days: number) => {
    const date = new Date(`${today}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  return kind === 'quick' ? { from: today, to: shift(1) } : { from: shift(-7), to: shift(21) }
}

/**
 * Una respuesta con muy pocas citas puede ser un fallo de conexión, no una agenda vacía. El umbral
 * sale de lo que suele traer este centro: uno pequeño puede tener pocas citas sin que falle nada.
 */
export function isIncomplete(count: number, typical: number | null) {
  return typical !== null && typical > 0 && count < typical * INCOMPLETE_RATIO
}

/** Citas guardadas de la ventana que ya no aparecen. Si la respuesta es incompleta, no se quita ninguna. */
export function vanished(storedIds: string[], seenIds: string[], incomplete: boolean) {
  if (incomplete) return []
  const seen = new Set(seenIds)
  return storedIds.filter((id) => !seen.has(id))
}

/** Una cuenta suave de lo habitual, para que un día raro no mueva mucho el umbral. */
export function nextTypical(typical: number | null, count: number) {
  return typical === null ? count : Math.round(typical * 0.7 + count * 0.3)
}
