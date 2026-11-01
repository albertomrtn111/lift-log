// ¿Está el atleta viendo la pantalla a la que lleva un aviso? Si es así, el
// aviso se marca como leído solo. Puro para probarlo con node --test.

/** Parámetros que identifican qué se mira: si el aviso los lleva, tienen que coincidir. */
const IDENTITY_PARAMS = ['checkin', 'client']

/** @param {string} url */
function parseAppUrl(url) {
  try {
    return new URL(url, 'https://app.local')
  } catch {
    return null
  }
}

/**
 * @param {string | null | undefined} notificationUrl  p. ej. «/summary?tab=revisiones&checkin=…»
 * @param {string} pathname  ruta actual, p. ej. «/summary»
 * @param {string} [search]  query actual, con o sin «?»
 */
export function notificationMatchesLocation(notificationUrl, pathname, search = '') {
  if (!notificationUrl) return false
  const target = parseAppUrl(notificationUrl)
  if (!target || target.pathname !== pathname) return false

  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  // Un aviso de una revisión o de un atleta concreto solo se da por visto si
  // se abre esa revisión o ese atleta.
  for (const param of IDENTITY_PARAMS) {
    const value = target.searchParams.get(param)
    if (value && current.get(param) !== value) return false
  }
  if (target.searchParams.get('checkin')) return true

  // Si el aviso apunta a una pestaña y el atleta está en otra, no lo ha visto.
  const tab = target.searchParams.get('tab')
  const currentTab = current.get('tab')
  if (tab && currentTab && tab !== currentTab) return false

  return true
}
