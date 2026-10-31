# NexTrain (lift-log)

SaaS de entrenamiento para coaches y atletas: Next.js 14 (App Router) + Supabase, desplegado con Docker en un servidor propio y un servidor MCP como Edge Function de Supabase.

## Desplegar en producción

Lee `docs/despliegue.md` antes de desplegar nada. Resumen:

- **Web** («actualiza el servidor»): `scripts/deploy-web.sh check` y después `scripts/deploy-web.sh`. Despliega `origin/main` en `/srv/NextTrain`, guarda imágenes de rollback y comprueba que la web responde.
- **MCP**: `scripts/deploy-mcp.sh` (requiere `npx -y supabase@latest login`, que hace el dueño).
- **Migraciones**: se aplican en Supabase antes de desplegar el código que las usa, y solo con permiso del dueño.

## Antes de tocar datos

No hay staging: el `.env.local` apunta a la base de datos de producción. Lee `docs/entorno-de-pruebas.md`.

## Pruebas

- `node --test scripts/*.test.mjs`
- `npx tsc --noEmit -p .`
- MCP: `npx -y deno@2.1.4 test --node-modules-dir=none --allow-env --allow-read supabase/functions/nexttrain-mcp/`
