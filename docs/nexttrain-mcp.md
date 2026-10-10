# NexTrain MCP

Servidor MCP remoto y multiusuario para entrenadores. Se despliega como Supabase Edge Function y usa Supabase Auth como servidor OAuth 2.1.

## URL de producción

`https://kqwstdbdocbynvijnpka.supabase.co/functions/v1/nexttrain-mcp`

Cada entrenador conecta esta URL desde su cliente MCP. El cliente abre el login de NexTrain, muestra `/oauth/consent` y recibe un token de usuario. Todas las consultas se ejecutan con ese token y respetan RLS.

## Herramientas

- `who_am_i`: comprueba los espacios de entrenador disponibles.
- `list_clients`: lista clientes y señales de seguimiento.
- `get_client_overview`: resume check-ins, tendencias, alertas, eventos y programas.
- `get_athlete_goal`: consulta el objetivo actual, su plazo y los días restantes.
- `set_athlete_goal`: crea o actualiza el objetivo actual con categoría y periodo.
- `list_client_schedule`: consulta fuerza, cardio y eventos en un rango de fechas.
- `get_body_history`: pesajes diarios, media semanal calculada, medias declaradas y medidas corporales de check-ins.
- `get_strength_results`: series confirmadas y valores editados sin confirmar, cargas, repeticiones, RIR/RPE, notas, identificadores comparables y sesiones completadas.
- `get_checkins`: formularios enviados completos, etiquetas de preguntas y respuesta de la revisión.
- `get_cardio_results`: ejecución detallada, frecuencia cardiaca, RPE, desnivel, vueltas y actividades de Strava no enlazadas.
- `get_current_nutrition`: objetivo de calorías y macros vigente, con fechas y plan de dieta activo.
- `get_recovery_history`: sueño y pasos diarios junto con señales subjetivas de los check-ins.
- `list_client_events`: carreras, pruebas y objetivos, pasados o futuros.
- `get_program_history`: lista de bloques con progreso temporal y de sesiones; con `program_id`, ejercicios, resultados y contexto de cambios de bloque.
- `schedule_cardio_session`: añade una sesión de cardio en modo rápido o estructurado y devuelve la sesión normalizada.
- `create_strength_program`: crea un programa de fuerza completo; por defecto queda en borrador.
- `create_coach_task`: añade una tarea de seguimiento.

## Seguridad

- OAuth 2.1 con PKCE y consentimiento explícito.
- Una instancia MCP nueva por petición, compatible con Edge Functions sin estado.
- Ninguna herramienta usa la clave administrativa de Supabase.
- RLS delimita los datos al entrenador autenticado.
- Las escrituras comprueban la membresía y la pertenencia del cliente antes de insertar.
- El objetivo actual se consulta y actualiza bajo el token del coach; RLS limita cada fila a su espacio.
- Las herramientas declaran si son de solo lectura, idempotentes o modifican datos.
- Cada nueva consulta comprueba membresía activa y pertenencia del cliente antes de leer, además de usar RLS.

## Fidelidad de los datos

- La media semanal calculada usa solo pesajes diarios disponibles. La media que declaró el atleta en un check-in se devuelve aparte.
- La fecha exacta de una serie solo está disponible si se guardó `performed_at`; en los demás casos se devuelve `recorded_at` y la fecha prevista o programada. Una sesión reprogramada se enlaza por programa, día y semana solo si hay una coincidencia única.
- `execution_status` distingue `confirmed` (serie marcada completada), `logged` (registro explícito con fecha de realización o confirmación) y `recorded_unverified` (valor editado sin confirmar). Las series prescritas que no se editaron no aparecen en `results`. Una sesión marcada completa no confirma automáticamente sus series. `data_quality` cuenta por separado series confirmadas, valores no confirmados y sesiones completas sin series confirmadas.
- `exercise_id` identifica el ejercicio dentro del programa. `comparison_exercise_id` usa el identificador del catálogo cuando existe para comparar programas; si falta, solo es estable dentro del programa (`comparison_scope`).
- El progreso de programas separa semana natural actual, semanas naturales completas, semanas con una sesión marcada completa y semanas con series confirmadas (estas últimas solo en el detalle del bloque; `null` en la lista). `estimated_end_date` se calcula a partir del inicio y duración si no se guardó `effective_to`; `end_date_source` indica el origen.
- `get_program_history` acepta `as_of_date` para evaluar el progreso en una fecha concreta; si se omite, usa la fecha UTC actual.
- Las sesiones previstas por la plantilla actual son una estimación; las sesiones pasadas sin confirmación no se presentan como omisiones verificadas. No existe estado de «omitida» ni semanas de descarga estructuradas: esos campos son `null`. Los cambios de bloque se infieren por el inicio del siguiente programa y los bloques de descarga solo se sugieren por su nombre.
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
