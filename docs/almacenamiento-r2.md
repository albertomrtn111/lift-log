# Fotos en Cloudflare R2

Desde noviembre de 2026 las fotos se guardan en Cloudflare R2 y no en Supabase Storage. El motivo es el límite de 1 GB del plan de Supabase: las fotos de check-in ocupaban 1,14 GB.

## Arquitectura

| Qué | Bucket de R2 | Clave | Qué se guarda en la BD | Cómo se ve |
|---|---|---|---|---|
| Fotos de perfil | `R2_BUCKET` (público) | `avatars/{userId}/avatar-{ts}.webp` | `profiles.avatar_url` = URL pública | Directamente desde `R2_PUBLIC_URL` |
| Fotos de check-in | `R2_PRIVATE_BUCKET` (privado) | `checkin-media/{coachId}/{clientId}/{checkinId}/{archivo}.webp` | `checkin_media.bucket = 'r2'`, `path` = clave | `/api/media/{clave}`, tras comprobar permisos |
| Adjuntos del chat | `R2_PRIVATE_BUCKET` (privado) | `chat-media/{coachId}/{clientId}/{uuid}-{nombre}` | `messages.attachment_url` = `r2:` + clave | `/api/media/{clave}`, tras comprobar permisos |
| Huérfanos de Supabase | `R2_PRIVATE_BUCKET` | `orphans/{bucket}/{ruta}` | — | No se muestran |

- **Hacen falta dos buckets.** R2 publica el bucket entero (r2.dev o dominio propio), así que en el bucket público cualquier archivo se puede leer conociendo su URL. Las fotos de check-in y del chat van en otro bucket sin acceso público.
- **Las subidas pasan por el servidor** (`POST /api/media/upload`):
  1. El navegador reduce la foto a 1600 px en JPEG (512 px en el avatar), así se sube rápido con mala cobertura y las HEIC del iPhone se convierten en Safari.
  2. El servidor comprueba la sesión y los permisos, convierte la foto a WebP de 1600 px como máximo (calidad 80, sin metadatos ni ubicación) con `sharp` y la guarda en R2.
  - La conversión a WebP la hace el servidor porque Safari no genera WebP desde un canvas.
  - GIF, audio y documentos del chat se guardan tal cual.
- **Las lecturas privadas también pasan por el servidor** (`GET /api/media/{clave}`). Comprueba la sesión y los mismos permisos que las políticas de Supabase (`src/lib/storage/media-access.ts`) y entrega el archivo con `Cache-Control: private, max-age=3600`:
  - Check-ins: coach activo del espacio (`is_coach_member`) o el propio atleta.
  - Chat: coach activo del espacio, o el atleta de esa conversación.
  - Con `R2_PRIVATE_DELIVERY=redirect`, en lugar de entregar el archivo redirige a una URL firmada de 5 minutos.
- **Borrar** una foto de check-in: `DELETE /api/media/{clave}`, con los mismos permisos.
- **Si R2 no está configurado**, o falta `R2_PRIVATE_BUCKET`, las subidas van a Supabase Storage como antes, aunque ya en WebP. Por eso el código se puede desplegar antes de crear el bucket privado o de migrar.
- Las filas antiguas (`bucket = 'checkin-media'` o `attachment_url` sin `r2:`) se siguen leyendo de Supabase con URL firmada hasta que se migran.

### ¿Subidas desde el servidor o directas desde el navegador?

Todo pasa por el servidor. Las credenciales de R2 nunca llegan al navegador y todas las peticiones a la API de R2 salen del servidor. Por eso **se puede filtrar el token por la IP del servidor**.

| | Todo por el servidor (elegido) | URLs firmadas directas desde el navegador |
|---|---|---|
| Filtro del token por IP | Sí | No: la petición firmada sale de la IP del usuario y el filtro la bloquea, tanto al subir como al leer |
| WebP en todos los móviles | Sí (`sharp` en el servidor) | No: Safari no genera WebP |
| Permisos y tamaño | Se comprueban antes de guardar | La URL firmada se puede reutilizar mientras dure |
| CORS en R2 | No hace falta | Hay que configurarlo |
| Carga del servidor | Las fotos pasan por él: unos 0,5-3 MB por subida y ~100 KB por foto vista | Ninguna |
| Enlace filtrado | `/api/media/…` exige sesión y permisos en cada petición | Cualquiera puede abrir la URL firmada mientras no caduque |

Con el volumen actual (≈ 500 fotos y ~100 KB por foto en WebP), la carga extra del servidor es despreciable. Si algún día lo fuera, `R2_PRIVATE_DELIVERY=redirect` reparte las lecturas privadas con URLs firmadas de 5 minutos, pero entonces el token no se puede filtrar por IP.

**Para filtrar el token por IP:** en Cloudflare, R2 → *Manage R2 API Tokens* → editar el token → *Client IP Address Filtering* → *Include*:
- La IPv4 pública del servidor, la de `NEXTTRAIN_SSH_HOST` en `docs/despliegue.md`. El contenedor `nexttrain_app` sale por ella; compruébalo con `docker exec nexttrain_app node -e "fetch('https://api.ipify.org').then(r=>r.text()).then(console.log)"`.
- La IPv6 del servidor, como rango `/64` (`curl -6 https://api64.ipify.org` en el servidor). El host sale por IPv6 por defecto, así que hace falta si se ejecuta algo fuera de Docker, como el script de migración.

Mientras el filtro esté activo, el script de migración **no funciona desde el Mac**. Haz la migración antes de activarlo, o añade temporalmente la IP de tu casa.

## Configuración en Cloudflare

1. **Bucket privado.** R2 → *Create bucket* → `nextrain-private`. Déjalo sin acceso público: en *Settings*, «Public access» desactivado y sin dominio propio.
2. **Token.** Edita el token actual: *Object Read & Write* para los buckets `nextrain` y `nextrain-private`. El token actual solo ve `nextrain`.
3. **Variables** en `.env.local` y en `/srv/NextTrain/.env`:
   - `R2_PRIVATE_BUCKET=nextrain-private`
   - Opcional: `R2_PRIVATE_DELIVERY=proxy`, que ya es el valor por defecto.
4. **Dominio propio para el bucket público** (recomendado; `r2.dev` tiene límite de velocidad y Cloudflare no lo recomienda para producción):
   1. El dominio tiene que estar en Cloudflare, en la misma cuenta. Si `ascenttech.cloud` tiene hoy el DNS en Hostinger, hay que pasarlo a Cloudflare (gratis): se copian los registros y se cambian los nameservers en Hostinger. Si no, usa otro dominio que ya esté en Cloudflare.
   2. R2 → `nextrain` → *Settings* → *Custom Domains* → *Connect Domain* → por ejemplo `media.ascenttech.cloud`. Cloudflare crea el DNS y el certificado.
   3. Cambia `R2_PUBLIC_URL=https://media.ascenttech.cloud` en `.env.local` y en el servidor, y reinicia la app.
   4. Actualiza los avatares que ya se hayan guardado (con permiso, en el SQL Editor):
      ```sql
      update profiles set avatar_url = replace(avatar_url, '<URL r2.dev antigua>', 'https://media.ascenttech.cloud')
      where avatar_url like '<URL r2.dev antigua>/%';
      ```
   5. Desactiva el acceso por `r2.dev` en *Settings* → *Public Development URL*.

Tras cambiar el `.env` del servidor hay que recrear el contenedor para que lo lea: `docker compose up -d --no-deps nexttrain_app supplement_reminder_worker` en `/srv/NextTrain`. También vale el siguiente despliegue.

## Migración de los archivos existentes

Script: `scripts/migrate-storage-to-r2.mjs`. Se ejecuta en el Mac desde la raíz del repo, con `--env-file=.env.local`.

- Sin `--apply`, ninguna orden escribe nada.
- Es reanudable: lo que ya apunta a R2 se salta, y si se corta, se vuelve a lanzar igual.
- Las claves de destino son deterministas, así que repetir una copia es inofensivo.

```bash
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs plan
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs copy --limit=5 --backup-dir=$HOME/nexttrain-fotos-originales --apply
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs copy --backup-dir=$HOME/nexttrain-fotos-originales --apply
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs verify
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs delete-supabase
node --env-file=.env.local scripts/migrate-storage-to-r2.mjs delete-supabase --apply --yes-delete
```

- `copy` descarga cada archivo y guarda el original en `--backup-dir`. Después lo convierte a WebP de 1600 px (los avatares, a 512 px), lo sube a R2, comprueba el tamaño y cambia la fila de la BD. Solo la cambia si sigue apuntando al archivo de Supabase.
  - Cada copia se anota en `r2-migration-log.jsonl`. **No borres ese fichero:** `rollback` y `delete-supabase` lo necesitan.
  - `--keep-format` copia los originales sin convertirlos.
- `verify` comprueba que cada fila que apunta a R2 tiene su archivo allí, y cuenta lo que sigue en Supabase.
- `rollback --apply` devuelve las filas a Supabase. Solo funciona mientras no se haya borrado nada de Supabase.
- `delete-supabase` borra solo los archivos que cumplen las tres condiciones:
  - están en el registro;
  - su copia existe en R2;
  - la BD ya no apunta a Supabase.

  Lo demás se conserva y se lista. Si después de copiar se subió algo a Supabase, vuelve a lanzar `copy` antes.

Estimación con una muestra de 10 fotos reales: de 29,9 MB a 0,8 MB en WebP (3 %). Los 1,14 GB actuales quedarían en unos 35-40 MB en R2.

## Cómo comprobar que todo carga desde R2 (antes de borrar)

1. `verify` dice «Sin archivo en R2: 0» y «Check-ins que siguen en Supabase: 0».
2. Entra como coach en la web y abre la galería de un atleta (*Workspace → Galería*) y las fotos de un check-in.
3. En las herramientas de desarrollo del navegador, en la pestaña *Red* y filtrando por `media`, las fotos salen de `/api/media/checkin-media/…`, con estado 200 y tipo `image/webp`. No debe aparecer ninguna petición a `supabase.co/storage`.
4. Abre una de esas URLs en una ventana privada, sin sesión: tiene que dar **401**. Con la sesión de un atleta de otro espacio, **403**.
5. Como atleta, sube una foto en un check-in y otra en el chat. Aparecen bien y en la BD quedan `bucket = 'r2'` y `attachment_url` con `r2:`.
6. Cambia la foto de perfil. La URL nueva empieza por `R2_PUBLIC_URL`.
7. En el panel de R2, el bucket privado tiene unos 480 objetos.

Cuando todo esto esté bien, ya se puede ejecutar `delete-supabase`.

## Código

- `src/lib/storage/media-refs.js`: reglas puras de claves y referencias. Pruebas: `scripts/media-refs.test.mjs`.
- `src/lib/storage/r2.ts`: cliente S3 de R2 y configuración.
- `src/lib/storage/media-access.ts`: permisos, copiados de las políticas de Storage.
- `src/lib/storage/webp.ts`: conversión con `sharp`.
- `app/api/media/upload/route.ts`: subidas.
- `app/api/media/[...key]/route.ts`: lectura y borrado de privadas.
- `src/lib/media-upload.ts`: subida desde el navegador con progreso.
