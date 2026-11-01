/**
 * Catálogo de avisos de novedades. Para añadir uno nuevo basta con añadir una
 * entrada aquí (ver docs/avisos-novedades.md):
 *
 * - `id` estable y nuevo: lo que se guarda en user_announcements. No se
 *   reutiliza nunca; si cambias el texto de un aviso ya publicado, el id se
 *   queda igual (quien lo vio no lo vuelve a ver).
 * - El orden importa: en cada visita sale el primero pendiente.
 * - `eyebrow` es la línea pequeña de encima del título («Novedad», «Completa tu perfil»…).
 * - `when` decide a quién le toca con lo que hay en AnnouncementContext.
 *   Cuando deja de cumplirse (por ejemplo, ya tiene foto), el aviso no sale.
 *
 * @type {import('./announcements.js').Announcement[]}
 */
export const ANNOUNCEMENTS = [
    {
        id: 'profile-photo',
        audience: 'athlete',
        icon: 'camera',
        eyebrow: 'Completa tu perfil',
        title: 'Ponte una foto de perfil',
        body: 'Con tu foto la cuenta queda completa y se ve mucho más profesional. Son diez segundos y puedes cambiarla cuando quieras desde tu perfil.',
        action: { type: 'avatar-upload', label: 'Elegir foto' },
        dismissLabel: 'Ahora no',
        startsAt: '2026-11-01',
        // Quien dijo «Ahora no» a la foto en la bienvenida ya fue preguntado
        when: (context) => !context.hasAvatar && !context.onboarding.photo,
    },
]
