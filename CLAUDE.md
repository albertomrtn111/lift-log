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
- **Check-ins, chat e imágenes de sala:** van al bucket privado y se sirven por `/api/media/{clave}`.
- **Fotos de perfil:** van al bucket público (`R2_PUBLIC_URL`).

## Notion: tareas

Las tareas y los proyectos se llevan en Notion, espacio Ascentechlabs, página [NexTrain](https://app.notion.com/p/40ceecf751d180b9ac5cc58a9c60f56b). Se usan con el conector de Notion.

| Base | Data source |
| --- | --- |
| Tareas | `collection://6b7c9b9f-000e-48c0-b4f4-bb5eb36bd449` |
| Proyectos | `collection://13bbcead-f740-4130-ab52-d7a5d2ee26f2` |

No hay base de Reuniones.

**Permiso:** Notion lo gestionan los agentes (decisión del dueño del 2026-11-03). Cambia estados, comenta, crea y ordena tareas, y añade propiedades, opciones o vistas sin pedir permiso. No se borra nada: lo que sobre va a la papelera.

### Campos de Tareas

- **Tarea** (título) e **ID** (`NXT-n`, automático).
- **Estado:** Pendiente, Stand-by, En curso, En revisión, Bloqueada o Hecha.
- **Prioridad:** Alta, Media o Baja.
- **Tipo:** Bug, Mejora, Funcionalidad, Infraestructura o Negocio.
- **Área:** App coach, App atleta, Infraestructura, Base de datos, IA / MCP, Web comercial o Negocio.
- **PR** (URL), **Desplegado** (fecha), **Esperando a** (solo en Bloqueadas; añade la opción si falta).
- **Proyecto** (relación), **Responsable**, **Fecha límite** y **Notas**.
- **Responsable:** pon al dueño (`3fbd872b-594c-81c6-a0c0-00026f3aa95a`) solo en tareas que tiene que hacer él, como pasos en paneles o cuentas externas.
- Si no existe el proyecto de una tarea, créalo en **Proyectos** (Idea, Planificado, En curso, Bloqueado o Hecho).

Vistas útiles: Default view (abiertas), Tablero, Por proyecto, ⛔ Bloqueadas (por «Esperando a»), 🔍 En revisión y ✅ Completadas.

Tareas abiertas en SQL:

```sql
SELECT "userDefined:ID", "Tarea", "Estado", "Prioridad", "Área", "Esperando a", "PR"
FROM "collection://6b7c9b9f-000e-48c0-b4f4-bb5eb36bd449"
WHERE "Estado" <> 'Hecha'
ORDER BY "Prioridad", "userDefined:ID"
```

El plan de Notion limita las consultas SQL por hora. Si se agotan, consulta la vista con `mode: "view"` o usa la búsqueda.

### Ciclo de una tarea (obligatorio en cada sesión)

Notion tiene que reflejar siempre el estado real. Actualízalo en el momento en que cambia, no al final de la sesión ni solo si el dueño lo pide. Cada cambio de estado lleva un comentario de una línea con la fecha y el motivo.

| Estado | Cuándo | Qué rellenar |
| --- | --- | --- |
| Pendiente | Recién creada | Cuerpo con **Qué pasa / Qué se espera / Hecho cuando** |
| Stand-by | Aparcada a propósito por el dueño | Comentario con el motivo |
| En curso | Al empezar a trabajar en ella | — |
| En revisión | PR abierto, falta fusionar o comprobar | PR |
| Bloqueada | Depende de un tercero | Esperando a y, en el comentario, qué se ha pedido y a quién |
| Hecha | Desplegado y comprobado en producción | Desplegado y comentario con lo que cambió |

- **Trabajo sin tarea:** si el dueño pide algo que no está en Notion y lleva código o un cambio visible, crea la tarea aunque la cierres el mismo día.
- **«Déjalo en pendientes», «apúntalo», «mételo como tarea»:** crea la tarea enlazada a su proyecto.
- **Lo que queda pendiente al terminar algo:** va a una tarea nueva, no solo al chat.
- **Si el dueño dice que algo ya está resuelto o pedido:** actualízalo en ese momento, con un comentario.
- **Duplicados:** antes de crear una tarea, busca en las abiertas. Si dos son lo mismo, enlázalas en un comentario y gestiónalas juntas, sin borrar.
- **Sesiones en paralelo:** cada sesión actualiza solo las tareas en las que trabaja.

### Al subir a producción

1. Al abrir el PR: cita la tarea por su ID (`NXT-n`) en la descripción y pásala a **En revisión** con el PR relleno.
2. Al desplegar y comprobar: pásala a **Hecha** con **Desplegado** y un comentario con lo que cambió.

## Pruebas

- `node --test scripts/*.test.mjs`
- `npx tsc --noEmit -p .`
- MCP: `npx -y deno@2.1.4 test --node-modules-dir=none --allow-env --allow-read supabase/functions/nexttrain-mcp/`
