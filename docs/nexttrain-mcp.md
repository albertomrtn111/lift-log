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
- `get_body_history`: pesajes diarios, media semanal calculada, medias declaradas y medidas corporales de check-ins.
- `get_strength_results`: series realmente registradas, cargas, repeticiones, RIR/RPE y sesiones completadas.
- `get_checkins`: formularios enviados completos, etiquetas de preguntas y respuesta de la revisión.
- `get_cardio_results`: ejecución detallada, frecuencia cardiaca, RPE, desnivel, vueltas y actividades de Strava no enlazadas.
- `get_current_nutrition`: objetivo de calorías y macros vigente, con fechas y plan de dieta activo.
- `get_recovery_history`: sueño y pasos diarios junto con señales subjetivas de los check-ins.
- `list_client_events`: carreras, pruebas y objetivos, pasados o futuros.
- `get_program_history`: lista de bloques; con `program_id`, sesiones, ejercicios y resultados de ese bloque.
- `schedule_cardio_session`: añade una sesión de cardio en modo rápido o estructurado y devuelve la sesión normalizada.
- `create_strength_program`: crea un programa de fuerza completo; por defecto queda en borrador.
- `create_coach_task`: añade una tarea de seguimiento.

## Seguridad

- OAuth 2.1 con PKCE y consentimiento explícito.
- Una instancia MCP nueva por petición, compatible con Edge Functions sin estado.
- Ninguna herramienta usa la clave administrativa de Supabase.
- RLS delimita los datos al entrenador autenticado.
- Las escrituras comprueban la membresía y la pertenencia del cliente antes de insertar.
- Las acciones de escritura se anuncian como aditivas y no idempotentes al cliente MCP.
- Cada nueva consulta comprueba membresía activa y pertenencia del cliente antes de leer, además de usar RLS.

## Fidelidad de los datos

- La media semanal calculada usa solo pesajes diarios disponibles. La media que declaró el atleta en un check-in se devuelve aparte.
- La fecha exacta de una serie solo está disponible si se guardó `performed_at`; en los demás casos se devuelve `recorded_at` y la fecha prevista.
- Las series prescritas no se presentan como resultados reales. Si nadie ha registrado cargas o repeticiones, el resultado estará vacío aunque existan entrenamientos completados.
- La recuperación diaria disponible contiene sueño, pasos y notas. Energía, estrés, hambre, rendimiento y molestias proceden de check-ins.
- Los eventos no tienen distancia estructurada; solo se extrae si aparece una cantidad explícita en su texto.
- Las consultas históricas admiten rangos acotados y paginación donde la respuesta puede ser larga.

## Contrato de cardio del MCP

- `planning_mode` es obligatorio: `quick` para texto libre y `structured` solo para bloques ejecutables. La presencia de bloques no decide el modo.
- En `quick` se envían descripción, distancia/duración objetivo y notas; no se admiten bloques ni `target_pace`, y `planned_structure` se guarda como `null`.
- En `structured`, cada bloque incluye `type` y `description`. Los bloques sin series usan `distance_m` (metros totales); los de tipo `intervals` usan `repetitions` y `distance_per_rep_m` (metros de **cada** repetición) o `duration_per_rep_seconds`. `recovery_seconds` describe la recuperación entre repeticiones, sin añadir una después de la última.
- Si el objetivo de distancia y la suma completa de bloques discrepan más de 2 m, la creación se rechaza. Si algún bloque está definido solo por tiempo, la respuesta indica validación parcial en vez de fingir un total.
- La respuesta devuelve `normalized.planning_mode`, la validación de distancia, los objetivos y las dos estructuras tal como quedaron guardadas.
- Los bloques ambiguos del contrato anterior no se interpretan como series: el editor pasa a texto libre y mantiene la descripción existente. Cambiar al modo estructurado no inserta una plantilla de 3×1000.

## Ajustes requeridos en Supabase

1. Activar Authentication > OAuth Server.
2. Configurar Authorization path como `/oauth/consent`.
3. Activar dynamic client registration.
4. Mantener Site URL en `https://nexttrain.ascenttech.cloud`.
5. Desplegar `nexttrain-mcp` con la verificación JWT del gateway desactivada. La función valida OAuth dentro de `withSupabase({ auth: 'user' })`; esto permite que el descubrimiento OAuth sin sesión responda correctamente.
