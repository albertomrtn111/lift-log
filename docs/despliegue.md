# Despliegue en producción

Cómo actualizar NexTrain en producción. Si eres un chat nuevo, sigue esto en vez de improvisar.

| Qué | Dónde corre | Cómo se despliega |
|---|---|---|
| Web (Next.js) y recordatorios de suplementos | Servidor propio, Docker + Traefik | `scripts/deploy-web.sh` |
| MCP de NexTrain | Edge Function de Supabase `nexttrain-mcp` | `scripts/deploy-mcp.sh` (ver `docs/nexttrain-mcp.md`) |
| Base de datos | Supabase `SaaS Asesorias` (ref `kqwstdbdocbynvijnpka`) | Migraciones de `supabase/migrations/`, a mano y con permiso |

Solo hay producción: no existe staging (ver `docs/entorno-de-pruebas.md`).

## Reglas

- **Desplegar solo cuando el dueño lo pida.** «Súbelo», «actualiza el servidor» o «despliega» cuentan como petición.
- **Siempre desde `main`.** Los cambios llegan a main por PR; el servidor nunca despliega una rama.
- **Migraciones antes que el código.** Si main trae migraciones nuevas, se aplican en Supabase primero, con permiso del dueño. Desplegar código que usa tablas o funciones que no existen rompe la web.
- **La clave SSH no sale del Mac.** Los scripts solo usan su ruta; nunca copies ni muestres su contenido.
- **El servidor aloja más cosas** (otras apps, n8n, Traefik). Toca solo los servicios `nexttrain_app` y `supplement_reminder_worker`; no reinicies Traefik ni cambies su red.
- **Nunca toques `/srv/NextTrain/.env`.** Es el único fichero sin seguimiento que debe haber allí. No lo sustituyas por el `.env.local` del Mac (apunta a lo mismo, pero el del servidor tiene sus propias claves).

## Web: `scripts/deploy-web.sh`

```bash
scripts/deploy-web.sh check      # solo comprobaciones: revisión actual → main, servidor limpio, migraciones
scripts/deploy-web.sh            # despliega origin/main
scripts/deploy-web.sh status     # revisión del servidor, contenedores e imágenes de rollback
scripts/deploy-web.sh rollback <revisión>
```

El despliegue:

1. Compara la revisión del servidor con `origin/main`; si ya está al día, no hace nada.
2. Para si el servidor tiene cambios locales además de `.env`, o ficheros que no son del usuario `alberto`.
3. Lista las migraciones añadidas entre las dos revisiones. Si hay alguna, para hasta que confirmes que están aplicadas con `MIGRATIONS_APPLIED=1 scripts/deploy-web.sh`. Para comprobarlo, compáralas con `list_migrations` del MCP de Supabase: allí aparecen con la fecha de aplicación como versión, no con la del nombre del fichero.
4. Etiqueta las imágenes actuales como `rollback-<revisión anterior>`.
5. Hace `git fetch` y `git merge --ff-only` en `/srv/NextTrain`.
6. Lanza la build y el reinicio con `nohup`, desacoplados del SSH, porque las builds largas cortaban la conexión: `docker compose build nexttrain_app supplement_reminder_worker && docker compose up -d --no-deps …`. El log queda en `/tmp/nexttrain-build.log` del servidor.
7. Espera a `DEPLOY_OK` (unos 3-6 minutos) y comprueba que `https://nexttrain.ascenttech.cloud/login` responde 200. Las páginas privadas devuelven 307 (redirección al login) sin sesión: es lo normal.

Variables opcionales: `NEXTTRAIN_SSH_KEY` (por defecto `/Users/albertomrtn/SERVIDORALBERTO@2026`) y `NEXTTRAIN_SSH_HOST` (por defecto `alberto@72.61.167.159`).

### Volver atrás

`scripts/deploy-web.sh status` lista las imágenes `rollback-*`. `scripts/deploy-web.sh rollback <revisión>` vuelve a poner esas imágenes como `latest` y reinicia los dos servicios en unos segundos, sin build. El código de `/srv/NextTrain` sigue en la revisión nueva; el siguiente despliegue reconstruye desde main, así que arregla el fallo en main antes de desplegar otra vez.

Las migraciones no se deshacen con el rollback: si una migración rompió algo, hay que corregirla con otra migración.

## Problemas conocidos

### Ficheros de root

Si alguna vez se ejecutó algo como root en `/srv/NextTrain`, `git merge` falla por permisos y `check` lo avisa. `alberto` no tiene sudo, pero sí Docker; se arregla con la propia imagen de la app:

```bash
docker run --rm --user 0 --entrypoint chown -v /srv/NextTrain:/w nexttrain-nexttrain_app:latest -R 1001:1001 /w
```

(1001 es el uid de `alberto` en el servidor.)

### Cambios locales en el servidor

Si `check` muestra ficheros modificados además de `.env`, alguien editó en el servidor. No uses `git reset --hard` a ciegas: compáralos con main (`git diff`) y, si son iguales a lo que ya está en main, apártalos con `git stash push --include-untracked -m deploy-<fecha> -- . ':(exclude).env'` antes de desplegar.

### La conexión SSH se corta

Es normal en builds largas y por eso la build va con `nohup`. Si el script se interrumpe, la build sigue en el servidor: consulta `tail /tmp/nexttrain-build.log` o `scripts/deploy-web.sh status`.

## MCP

`scripts/deploy-mcp.sh` despliega la Edge Function `nexttrain-mcp` desde `origin/main`, después de `deno check` y de todas las pruebas. Necesita una sesión de la CLI de Supabase en el Mac (`npx -y supabase@latest login`, la hace el dueño en el navegador). Detalles en `docs/nexttrain-mcp.md`, sección «Despliegue».
