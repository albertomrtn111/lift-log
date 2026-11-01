/**
 * Avisos de novedades de una sola vez («hay algo nuevo en la app, ve a
 * configurarlo»). Cada usuario ve cada aviso una vez: lo descarta o lo
 * completa y no vuelve a salir (tabla user_announcements).
 * Lógica pura (testeada en scripts/). El catálogo está en catalog.js.
 *
 * @typedef {'athlete'} AnnouncementAudience
 * @typedef {'dismissed' | 'completed'} AnnouncementStatus
 * @typedef {'camera' | 'sparkles' | 'watch' | 'bell' | 'clipboard' | 'calendar'} AnnouncementIcon
 *
 * Lo que se sabe del usuario al decidir si un aviso le toca (data.ts lo rellena).
 * @typedef {{
 *   hasAvatar: boolean
 *   stravaConnected: boolean
 *   onboarding: { guided?: boolean, photo?: string, [step: string]: unknown }
 *   accountCreatedAt: string | null
 * }} AnnouncementContext
 *
 * - link: el botón lleva a una pantalla de la app y cuenta como completado.
 * - avatar-upload: se elige la foto de perfil dentro del propio aviso.
 * @typedef {{ type: 'link', label: string, href: string } | { type: 'avatar-upload', label: string }} AnnouncementAction
 *
 * @typedef {{
 *   id: string
 *   audience: AnnouncementAudience
 *   icon: AnnouncementIcon
 *   eyebrow: string
 *   title: string
 *   body: string
 *   action: AnnouncementAction
 *   dismissLabel?: string
 *   startsAt?: string
 *   endsAt?: string
 *   when?: (context: AnnouncementContext) => boolean
 * }} Announcement
 *
 * Lo que llega al navegador (sin la función `when`).
 * @typedef {Omit<Announcement, 'when' | 'startsAt' | 'endsAt' | 'audience'>} AnnouncementView
 */

export const ANNOUNCEMENT_ICONS = /** @type {const} */ (['camera', 'sparkles', 'watch', 'bell', 'clipboard', 'calendar'])

/**
 * Avisos que podrían tocarle a este usuario sin mirar su contexto: público,
 * fechas y los que ya vio. Si no queda ninguno, no hace falta leer nada más.
 * @param {Announcement[]} catalog
 * @param {{ audience: AnnouncementAudience, now: Date, seenIds: Iterable<string> }} input
 * @returns {Announcement[]}
 */
export function announcementCandidates(catalog, { audience, now, seenIds }) {
    const seen = new Set(seenIds)
    const today = now.getTime()
    return catalog.filter(announcement => {
        if (announcement.audience !== audience || seen.has(announcement.id)) return false
        if (announcement.startsAt && Date.parse(announcement.startsAt) > today) return false
        if (announcement.endsAt && Date.parse(announcement.endsAt) <= today) return false
        return true
    })
}

/**
 * El primer aviso pendiente, en el orden del catálogo (uno por visita).
 * @param {Announcement[]} candidates
 * @param {AnnouncementContext} context
 * @returns {Announcement | null}
 */
export function pickAnnouncement(candidates, context) {
    return candidates.find(announcement => !announcement.when || announcement.when(context)) ?? null
}

/**
 * @param {Announcement} announcement
 * @returns {AnnouncementView}
 */
export function toAnnouncementView(announcement) {
    const { when: _when, startsAt: _startsAt, endsAt: _endsAt, audience: _audience, ...view } = announcement
    return view
}

/**
 * Errores de forma del catálogo (los comprueba el test para que un aviso mal
 * escrito no llegue a producción).
 * @param {Announcement[]} catalog
 * @returns {string[]}
 */
export function catalogProblems(catalog) {
    /** @type {string[]} */
    const problems = []
    const ids = new Set()
    for (const announcement of catalog) {
        const label = announcement.id || '(sin id)'
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(announcement.id ?? '')) problems.push(`${label}: el id debe ser kebab-case`)
        if (ids.has(announcement.id)) problems.push(`${label}: id repetido`)
        ids.add(announcement.id)
        if (announcement.audience !== 'athlete') problems.push(`${label}: público desconocido`)
        if (!ANNOUNCEMENT_ICONS.includes(announcement.icon)) problems.push(`${label}: icono desconocido`)
        if (!announcement.title?.trim() || !announcement.body?.trim()) problems.push(`${label}: falta título o texto`)
        if (!announcement.action?.label?.trim()) problems.push(`${label}: falta el texto del botón`)
        if (announcement.action?.type === 'link' && !announcement.action.href?.startsWith('/')) problems.push(`${label}: el enlace debe ser una ruta de la app`)
        for (const key of /** @type {const} */ (['startsAt', 'endsAt'])) {
            if (announcement[key] && Number.isNaN(Date.parse(announcement[key]))) problems.push(`${label}: ${key} no es una fecha`)
        }
    }
    return problems
}
