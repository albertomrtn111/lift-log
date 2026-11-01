// ¿Está el atleta viendo la pantalla a la que lleva un aviso? Si es así, el
// aviso se marca como leído solo. Puro para probarlo con node --test.

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

  // Un aviso de una revisión concreta solo se da por visto si se abre esa revisión.
  const checkin = target.searchParams.get('checkin')
  if (checkin) return current.get('checkin') === checkin

  // Si el aviso apunta a una pestaña y el atleta está en otra, no lo ha visto.
  const tab = target.searchParams.get('tab')
  const currentTab = current.get('tab')
  if (tab && currentTab && tab !== currentTab) return false

  return true
}
