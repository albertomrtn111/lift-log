// Entornos del coach: Online y Sala (probado con node --test).

export const ENVIRONMENT_COOKIE = 'nt_entorno'
export const ENVIRONMENT_HOME = { online: '/coach/dashboard', sala: '/coach/sala' }

const SALA_PATHS = ['/coach/sala']
// Lo que se usa igual en los dos entornos: al entrar no se cambia de entorno.
const SHARED_PATHS = ['/coach/messages', '/coach/members', '/coach/settings']

const under = (/** @type {string} */ path, /** @type {string} */ base) => path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}-`)

/**
 * En qué entorno está una pantalla. Las compartidas se quedan en el que venías.
 * @param {string | null | undefined} path
 * @param {'online' | 'sala'} previous
 * @returns {'online' | 'sala'}
 */
export function environmentForPath(path, previous) {
  const clean = String(path ?? '')
  if (SALA_PATHS.some(base => under(clean, base))) return 'sala'
  if (SHARED_PATHS.some(base => under(clean, base))) return previous
  return 'online'
}

/**
 * El entorno de un espacio: sin sala, siempre Online; solo con sala, siempre Sala; con los dos, el último.
 * @param {{ studio: boolean, online: boolean, saved: string | null | undefined }} space
 * @returns {{ environment: 'online' | 'sala', canSwitch: boolean }}
 */
export function spaceEnvironment({ studio, online, saved }) {
  if (!studio) return { environment: 'online', canSwitch: false }
  if (!online) return { environment: 'sala', canSwitch: false }
  return { environment: saved === 'sala' ? 'sala' : 'online', canSwitch: true }
}
