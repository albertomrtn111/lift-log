# NexTrain (lift-log)

SaaS de entrenamiento para coaches y atletas: Next.js 14 (App Router) + Supabase, desplegado con Docker en un servidor propio y un servidor MCP como Edge Function de Supabase.

## Desplegar en producción

Lee `docs/despliegue.md` antes de desplegar nada. Resumen:

- **Web** («actualiza el servidor»): `scripts/deploy-web.sh check` y después `scripts/deploy-web.sh`. Despliega `origin/main` en `/srv/NextTrain`, guarda imágenes de rollback y comprueba que la web responde.
- **MCP**: `scripts/deploy-mcp.sh` (requiere `npx -y supabase@latest login`, que hace el dueño).
- **Migraciones**: se aplican en Supabase antes de desplegar el código que las usa, y solo con permiso del dueño.

## Antes de tocar datos

No hay staging: el `.env.local` apunta a la base de datos de producción. Lee `docs/entorno-de-pruebas.md`.

## Fotos y archivos

Las fotos están en Cloudflare R2, no en Supabase Storage. No vuelvas a subir archivos a Supabase Storage. Detalles en `docs/almacenamiento-r2.md`.

- **Subidas:** siempre por `POST /api/media/upload`. Comprueba permisos y convierte a WebP. Desde el cliente se llama con `uploadMedia` (`src/lib/media-upload.ts`).
- **Check-ins y chat:** van al bucket privado y se sirven por `/api/media/{clave}`.
- **Fotos de perfil:** van al bucket público (`R2_PUBLIC_URL`).

## Tareas pendientes

Se llevan en Notion: espacio Ascentechlabs → página «NexTrain» → bases **Tareas** y **Proyectos**. El `CLAUDE.md` de la carpeta de trabajo (`~/Desktop/SaasEntrenamientos_IA/CLAUDE.md`) explica cómo usarlas.

- Si el dueño dice «déjalo en pendientes», crea ahí la tarea.
- Al abrir un PR o desplegar, actualiza el estado de la tarea.

## Pruebas

- `node --test scripts/*.test.mjs`
- `npx tsc --noEmit -p .`
- MCP: `npx -y deno@2.1.4 test --node-modules-dir=none --allow-env --allow-read supabase/functions/nexttrain-mcp/`
