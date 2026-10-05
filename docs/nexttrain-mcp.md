# NexTrain MCP

Servidor MCP remoto y multiusuario para entrenadores. Se despliega como Supabase Edge Function y usa Supabase Auth como servidor OAuth 2.1.

## URL de producción

`https://kqwstdbdocbynvijnpka.supabase.co/functions/v1/nexttrain-mcp`

Cada entrenador conecta esta URL desde su cliente MCP. El cliente abre el login de NexTrain, muestra `/oauth/consent` y recibe un token de usuario. Todas las consultas se ejecutan con ese token y respetan RLS.

## Herramientas

- `who_am_i`: comprueba los espacios de entrenador disponibles.
- `list_clients`: lista clientes y señales de seguimiento.
- `get_client_overview`: resume check-ins, tendencias, alertas, eventos y programas.
- `list_client_schedule`: consulta fuerza, cardio y eventos en un rango de fechas.
- `schedule_cardio_session`: añade una sesión de cardio.
- `create_strength_program`: crea un programa de fuerza completo; por defecto queda en borrador.
- `create_coach_task`: añade una tarea de seguimiento.

## Seguridad

- OAuth 2.1 con PKCE y consentimiento explícito.
- Una instancia MCP nueva por petición, compatible con Edge Functions sin estado.
- Ninguna herramienta usa la clave administrativa de Supabase.
- RLS delimita los datos al entrenador autenticado.
- Las escrituras comprueban la membresía y la pertenencia del cliente antes de insertar.
- Las acciones de escritura se anuncian como aditivas y no idempotentes al cliente MCP.

## Ajustes requeridos en Supabase

1. Activar Authentication > OAuth Server.
2. Configurar Authorization path como `/oauth/consent`.
3. Activar dynamic client registration.
4. Mantener Site URL en `https://nexttrain.ascenttech.cloud`.
5. Desplegar `nexttrain-mcp` con la verificación JWT del gateway desactivada. La función valida OAuth dentro de `withSupabase({ auth: 'user' })`; esto permite que el descubrimiento OAuth sin sesión responda correctamente.
