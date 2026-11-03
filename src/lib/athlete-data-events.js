// Aviso entre pantallas de la app del atleta: «estos datos han cambiado».
//
// Las pantallas del atleta cargan sus datos en el navegador y no se enteran de
// lo que cambia fuera de ellas: otra pestaña de la misma pantalla (Comidas →
// Macros), el diálogo global de Strava, el coach desde su portal o el botón
// «Hecho» de un push. Quien cambia algo lanza este evento y las pantallas que
// muestran esos datos se recargan (useAthleteLiveRefresh).

export const ATHLETE_DATA_CHANGED_EVENT = 'athlete:data-changed'

/**
 * Ámbitos de datos. `diet-plan` es el plan que pone el coach (macros, dieta,
 * lista de suplementos), distinto de lo que registra el atleta (`nutrition`,
 * `supplements`): solo cambia por avisos del coach.
 *
 * @typedef {'training' | 'cardio' | 'nutrition' | 'supplements' | 'diet-plan' | 'metrics' | 'reviews' | 'profile'} AthleteDataScope
 */

/**
 * @param {AthleteDataScope[]} scopes
 */
export function notifyAthleteDataChanged(scopes) {
  if (typeof window === 'undefined' || scopes.length === 0) return
  window.dispatchEvent(new CustomEvent(ATHLETE_DATA_CHANGED_EVENT, { detail: { scopes } }))
}

/**
 * Qué datos del atleta ha podido cambiar un aviso nuevo de `client_notifications`.
 * Los avisos los crea el servidor cuando el coach cambia el plan, responde una
 * revisión, etc.; su URL dice qué pantalla mirar. Los mensajes no cambian datos
 * de ninguna pantalla (el chat tiene su propio Realtime).
 *
 * @param {{ type?: string | null, url?: string | null }} notification
 * @returns {AthleteDataScope[]}
 */
export function scopesForNotification(notification) {
  if (!notification || notification.type === 'message') return []
  const path = (notification.url || '').split(/[?#]/)[0]

  if (path.startsWith('/routine')) return ['training']
  if (path.startsWith('/planning')) return ['cardio', 'training']
  if (path.startsWith('/diet')) return ['diet-plan', 'nutrition', 'supplements']
  if (path.startsWith('/summary') || path.startsWith('/progress') || path.startsWith('/forms')) return ['reviews', 'metrics']
  if (path.startsWith('/profile')) return ['profile']
  if (notification.type === 'check_in') return ['reviews']
  return []
}

/**
 * ¿Le interesa a una pantalla que escucha `wanted` un aviso con `changed`?
 *
 * @param {readonly AthleteDataScope[]} wanted
 * @param {readonly AthleteDataScope[] | undefined} changed
 */
export function scopesOverlap(wanted, changed) {
  if (!changed || changed.length === 0) return false
  return changed.some((scope) => wanted.includes(scope))
}
