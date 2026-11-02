# Avisos de novedades (una sola vez)

Hoja que sube al entrar en la app del atleta con «hay algo nuevo, ve a configurarlo». Cada atleta ve cada aviso **una vez**: lo completa o lo descarta («Ahora no», la X o tocar fuera) y no vuelve a salir en ningún dispositivo.

## Piezas

| Pieza | Qué hace |
|---|---|
| `src/lib/announcements/catalog.js` | **El catálogo.** Un aviso = una entrada. Es lo único que se toca para añadir uno. |
| `src/lib/announcements/announcements.js` | Lógica pura: qué avisos tocan (público, fechas, ya vistos, `when`) y validación del catálogo. Tests en `scripts/announcements.test.mjs`. |
| `src/lib/announcements/data.ts` | Servidor: lee lo ya visto (`user_announcements`) y el contexto del atleta (foto, Strava, bienvenida). Guarda descartado/completado. |
| `src/components/announcements/AnnouncementHost.tsx` | Montado en `app/(app)/layout.tsx`. Pide el aviso pendiente 1,2 s después de entrar; si hay otro diálogo abierto (feedback de Strava, notificaciones…), espera a que se cierre. |
| `user_announcements` | Tabla (migración `20261101120000_user_announcements.sql`): una fila por usuario y aviso con `dismissed` o `completed`. RLS: cada usuario solo ve y escribe las suyas. |

Sin la tabla (migración sin aplicar) no sale ningún aviso: no habría forma de guardar que se descartó.

## Añadir un aviso nuevo

1. Añade una entrada al final de `ANNOUNCEMENTS` en `catalog.js`:

```js
{
    id: 'strava-zonas',                 // nuevo y en kebab-case; no se reutiliza nunca
    audience: 'athlete',
    icon: 'watch',                      // camera, sparkles, watch, bell, clipboard o calendar
    eyebrow: 'Novedad',
    title: 'Tus zonas de pulso, desde Strava',
    body: 'Ahora tu plan usa tus zonas reales. Revísalas en tu perfil.',
    action: { type: 'link', label: 'Ver mis zonas', href: '/profile' },
    dismissLabel: 'Ahora no',           // opcional
    startsAt: '2026-12-01',             // opcional: no sale antes
    endsAt: '2027-01-31',               // opcional: deja de salir
    when: (context) => context.stravaConnected,   // opcional: a quién le toca
},
```

2. `node --test scripts/announcements.test.mjs` comprueba que el catálogo está bien escrito (ids únicos, iconos, rutas, fechas).
3. Despliega como siempre. No hace falta migración.

Reglas:

- **Orden**: en cada visita sale el primer aviso pendiente del catálogo; el siguiente, en la próxima visita.
- **Botón `link`**: lleva a esa pantalla y cuenta como completado.
- **`when`** recibe `{ hasAvatar, stravaConnected, onboarding, accountCreatedAt }`. Si necesitas otro dato, añádelo en `getAthleteContext` (`data.ts`) y en el `@typedef AnnouncementContext`. Si `when` deja de cumplirse (por ejemplo, ya tiene foto), el aviso no sale aunque no lo haya visto.
- **Cambiar el texto** de un aviso publicado: mismo `id` (quien ya lo vio no lo vuelve a ver). Para volver a enseñarlo a todos, `id` nuevo.
- **Una acción especial** (como elegir la foto dentro del propio aviso): nuevo `type` en `AnnouncementAction` y su bloque en `AnnouncementSheet`.
- Para avisos del coach habría que añadir el público `coach` y montar `AnnouncementHost` en su layout; la tabla ya sirve.

## Primer aviso: foto de perfil

`profile-photo`: a los atletas sin foto (`profiles.avatar_url` vacío) que no dijeron ya «Ahora no» a la foto en la bienvenida. La foto se elige en el propio aviso; se reduce a JPEG de 800 px antes de subirla (las del móvil superan el límite de 2 MB del bucket `avatars`).
