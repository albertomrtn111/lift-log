# NexTrain MCP

Servidor MCP remoto y multiusuario para entrenadores. Se despliega como Supabase Edge Function y usa Supabase Auth como servidor OAuth 2.1.

## URL de producción

`https://kqwstdbdocbynvijnpka.supabase.co/functions/v1/nexttrain-mcp`

Cada entrenador conecta esta URL desde su cliente MCP. El cliente abre el login de NexTrain, muestra `/oauth/consent` y recibe un token de usuario. Todas las consultas se ejecutan con ese token y respetan RLS.

## Herramientas

- `who_am_i`: comprueba los espacios de entrenador disponibles.
- `list_clients`: lista clientes y señales de seguimiento, paginado con `offset`, `has_more` y `next_offset`.
- `get_client_overview`: resume check-ins, tendencias, alertas, eventos y programas.
- `get_athlete_goal`: consulta el objetivo actual, su plazo y los días restantes.
- `set_athlete_goal`: crea o actualiza el objetivo actual con categoría y periodo.
- `list_client_schedule`: consulta fuerza, cardio y eventos en un rango de fechas. La fuerza sale en su fecha programada real, con estado de completada y marca de reprogramada.
- `get_body_history`: pesajes diarios, media semanal calculada, medias declaradas y medidas corporales de check-ins.
- `get_strength_results`: series confirmadas y valores editados sin confirmar, cargas, repeticiones, RIR/RPE, notas, identificadores comparables y sesiones completadas. Por defecto agrupa las series por sesión y ejercicio (`format: "flat"` mantiene una fila por serie).
- `get_checkins`: formularios enviados completos, etiquetas de preguntas y respuesta de la revisión.
- `get_cardio_results`: ejecución detallada, frecuencia cardiaca, RPE, desnivel, vueltas y actividades de Strava no enlazadas.
- `get_current_nutrition`: macros vigentes, configuración de entreno/descanso como objeto y dieta completa con comidas, opciones, alimentos, cantidades, alternativas, totales y desviaciones.
- `get_diet_plan`: detalle completo de una dieta por ID, también archivada o borrador; devuelve `updated_at` para editar.
- `get_nutrition_history`: histórico paginado de planes de macros y cabeceras de dietas.
- `search_foods`: catálogo de alimentos accesibles, macros por ración y peso por unidad.
- `preview_diet_plan`: calcula y ajusta una dieta por opciones sin guardarla.
- `create_macro_plan` / `update_macro_plan`: crea o edita macros simples o diferentes en entreno y descanso.
- `create_diet_plan` / `update_diet_plan`: crea o edita dietas por opciones, con ajuste a objetivos y conservación de identificadores.
- `get_recovery_history`: sueño y pasos diarios junto con señales subjetivas de los check-ins.
- `list_client_events`: carreras, pruebas y objetivos, pasados o futuros.
- `get_program_history`: lista de bloques con progreso temporal y de sesiones; con `program_id`, ejercicios, resultados y contexto de cambios de bloque.
- `schedule_cardio_session`: añade una sesión de cardio en modo rápido o estructurado y devuelve la sesión normalizada.
- `preview_cardio_session`: comprueba el modo, bloques, recuperaciones y totales sin guardar.
- `get_cardio_session`: lee una sesión con bloques editables y la versión para actualizarla.
- `update_cardio_session`: edita una sesión existente, mantiene su ID y no modifica los resultados reales.
- `create_strength_program`: crea un programa de fuerza completo en una sola transacción; por defecto queda en borrador.
- `update_strength_program`: cambia nombre, semanas, fecha de inicio o estado (activar, archivar, volver a borrador) de un programa de fuerza.
- `save_review_draft`: guarda en borrador el resumen interno y el mensaje para el cliente de la revisión de un check-in.
- `create_coach_task`: añade una tarea de seguimiento.
- `list_coach_tasks` / `update_coach_task`: lista las tareas (por defecto, pendientes), las edita, aplaza, completa o reabre.
- `create_client_event` / `update_client_event`: crea y edita carreras, pruebas y otros eventos del cliente.
- `get_coach_inbox`: check-ins por revisar, actividades de Strava sin enlazar y tareas pendientes de todos los clientes en una sola llamada.

Prompts: `revision_semanal`, `preparar_bloque_siguiente` y `bandeja_del_dia`.

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
- `get_program_history` acepta `as_of_date` para evaluar el progreso en una fecha concreta; si se omite, usa el día actual en la zona horaria del espacio de trabajo.
- Las sesiones previstas por la plantilla actual son una estimación; las sesiones pasadas sin confirmación no se presentan como omisiones verificadas. No existe estado de «omitida» ni semanas de descarga estructuradas: esos campos son `null`. Los cambios de bloque se infieren por el inicio del siguiente programa y los bloques de descarga solo se sugieren por su nombre.
- La recuperación diaria disponible contiene sueño, pasos y notas. Energía, estrés, hambre, rendimiento y molestias proceden de check-ins.
- Los eventos no tienen distancia estructurada; solo se extrae si aparece una cantidad explícita en su texto.
- Las consultas históricas admiten rangos acotados y paginación donde la respuesta puede ser larga.

## Contrato de cardio del MCP

- `planning_mode` es obligatorio: `quick` para texto libre y `structured` solo para bloques ejecutables. La presencia de bloques no decide el modo.
- En `quick` se envían descripción, distancia/duración objetivo y notas; no se admiten bloques ni `target_pace`, y `planned_structure` se guarda como `null`.
- En `structured`, cada bloque incluye `type` y `description`. Los bloques sin series usan `distance_m` (metros totales); los de tipo `intervals` usan `repetitions` y `distance_per_rep_m` (metros de **cada** repetición) o `duration_per_rep_seconds`.
- `recovery_seconds` y `recovery_distance_m` son **por pausa**, no totales. `recovery_type` distingue `passive` (parado, cero metros) de `active` (con desplazamiento). Si se indica distancia de recuperación se deduce `active`; si solo hay tiempo se deduce `passive`. Indicar distancia con `passive` es un error. Para trote de recuperación por tiempo, indicar expresamente `active`.
- `recovery_after_last_rep` es `false` por defecto: cuatro repeticiones generan tres recuperaciones. `true` añade una cuarta pausa. La app, el MCP y el análisis posterior de ejecución usan esta misma regla; los bloques antiguos con `restAfterLastRep=true` se respetan.
- `recovery_target_pace` permite estimar metros de una recuperación activa por tiempo. Nunca se utiliza el ritmo de trabajo para estimar la recuperación. Solo se interpretan ritmos numéricos inequívocos (`5:30/km`, `2:10/100 m`; sin unidad, por km salvo natación). Z2, "suave", rangos, FC y vatios no permiten inventar distancia o duración.
- La respuesta distingue suma completa, estimada y parcial con `normalized.totals`. Solo las sumas completas se usan automáticamente como objetivo. Cuando faltan datos se devuelve la suma conocida y el objetivo automático queda `null`. Un objetivo global explícito puede acompañar bloques parciales, pero no puede ser menor que lo ya contabilizado.
- Para sumas completas exactas, una discrepancia de más de 2 m o 0,1 min rechaza el guardado. Las estimaciones por ritmo admiten una tolerancia del 2% en distancia y 5% en tiempo. `distance_validation` y `duration_validation` señalan origen y estado; `totals.breakdown` desglosa calentamiento, trabajo, recuperaciones y vuelta a la calma.
- El objetivo global admite `target_distance_m` como alternativa a `target_distance_km`, especialmente en natación. No enviar ambas unidades.
- La respuesta devuelve `normalized.planning_mode`, validación de distancia y duración, desglose, objetivos y ambas estructuras tal como quedaron normalizadas.
- Los bloques ambiguos del contrato anterior no se interpretan como series: el editor pasa a texto libre y mantiene la descripción existente. Cambiar al modo estructurado no inserta una plantilla de 3×1000.

### Edición de cardio (MCP 0.6.0)

Leer primero `get_cardio_session(client_id, session_id)`. Devuelve `editable_plan` con distancias en metros/tiempos en segundos y `expected_updated_at`. Al editar, enviar ese valor sin truncar ni recalcular; un cambio simultáneo rechaza el guardado.

`update_cardio_session` admite `name`, `scheduled_date`, notas, objetivos y modo. Omitir `planning_mode` conserva el existente. Para pasar de rápida a estructurada, enviar `planning_mode="structured"` y todos los `blocks`. Para pasar a rápida, enviar `planning_mode="quick"` y una descripción; se vacía `planned_structure`. Enviar bloques en una sesión rápida sin cambiar el modo se rechaza.

`blocks` reemplaza todos los bloques. Se recalculan los objetivos al cambiar modo/bloques para no conservar kilómetros o tiempos del entrenamiento anterior. Un objetivo global nuevo debe enviarse expresamente cuando los bloques sean parciales. Los cambios de nombre, fecha o notas conservan el resto de la planificación. No se pueden editar con esta herramienta la finalización, los resultados reales ni los datos de Strava. Todas las consultas y escrituras filtran entrenador, cliente y sesión.

Ejemplo: 2 km/12 min de calentamiento + 4×1000 m/4 min con recuperaciones activas de 250 m/90 s + 1 km/6 min de vuelta a la calma suma **7,75 km y 38,5 min**. Activar la recuperación final da **8 km y 40 min**. Son tres o cuatro recuperaciones respectivamente, sin sumar las pausas dos veces.

La app usa el mismo motor al guardar desde el editor y para las tarjetas y métricas semanales/mensuales. Las sumas completas prevalecen sobre agregados antiguos erróneos sin modificar registros históricos en la base de datos; cuando faltan datos, el resumen de carga se etiqueta como parcial. Una recuperación antigua por tiempo sin tipo guardado queda indeterminada, no se supone parada; el editor permite elegir su tipo. La modalidad (running, natación, bicicleta) se guarda de forma consistente con el editor.

Pruebas: `node --test scripts/cardio-structure.test.mjs scripts/cardio-analysis.test.mjs scripts/cardio-planning-card-summary.test.mjs scripts/mcp-cardio-plan.test.mjs` y `deno test supabase/functions/nexttrain-mcp/cardio.test.ts`. `scripts/cardio-editor-preview.tsx` permite montar el formulario real en un servidor local sin conexión a Supabase; `scripts/cardio-editor-browser.mjs` comprueba crear, guardar, reabrir y editar en 375 px y escritorio, incluidos metros de natación y recuperaciones fraccionarias. Acepta `CARDIO_PREVIEW_URL`, `CARDIO_PLAYWRIGHT_MODULE` (si se usa un navegador del entorno) y `CARDIO_SCREENSHOT`.

## Nutrición (MCP 0.5.0)

### Lectura

`get_current_nutrition` mantiene `macro_target` y `active_diet_plan`, pero ahora incluye toda la estructura normalizada de la dieta. Si no existe estructura normalizada, lee el JSON legado y conserva las cantidades textuales originales. `macro_target.day_type_config` se convierte de texto JSON a `{ training, rest }`. Una configuración corrupta se señala en `warnings`.

Cada opción devuelve `totals`, `totals_complete` y `comparison` respecto al objetivo de la comida. Cada alimento indica `macro_source`: `food_catalog` cuando se calcula a partir de gramos y catálogo, `stored_snapshot` cuando solo hay macros guardados, o `unavailable` si no se puede calcular. No se inventan valores para texto libre. La energía del catálogo puede diferir de 4P+4HC+9G por fibra y redondeos.

Se elige **una opción por comida**. Las alternativas dentro de una opción no se suman al alimento principal. `days.<tipo>.selectable_totals_range` expresa los mínimos y máximos posibles por macro al elegir opciones; no es el total de comer todas las opciones ni garantiza que todos los extremos se consigan con la misma selección. `totals_complete=false` advierte de componentes no contabilizados.

`on_date` comprueba vigencia de macros y dieta. `app_active_diet_plan` muestra por separado la dieta que la app considera activa por estado, por si sus fechas no cubren la consulta. Para consultar una dieta histórica usa su ID con `get_diet_plan`. `day_type` opcional selecciona el objetivo de entreno o descanso, sin inferirlo por actividad.

### Macros

Los campos de objetivo son `protein_g`, `carbs_g`, `fat_g` y `kcal` opcional; las kcal omitidas se calculan como 4P+4HC+9G. Se rechaza una diferencia superior al mayor de 50 kcal o el 5%. Ejemplo de creación:

```json
{
  "client_id": "UUID_DEL_CLIENTE",
  "name": "Bloque de recomposición",
  "effective_from": "2026-10-12",
  "day_type_config": {
    "training": { "protein_g": 160, "carbs_g": 300, "fat_g": 60 },
    "rest": { "protein_g": 160, "carbs_g": 200, "fat_g": 60 }
  }
}
```

Para un plan simple se usa `target` en lugar de `day_type_config`. Crear un plan cierra los planes anteriores que se solapen el día previo al nuevo inicio, conservando el histórico. Un plan con la misma fecha de inicio o un plan futuro solapado debe editarse o cambiarse de fecha. La edición usa `plan_id` y conserva los campos omitidos; para editar un plan con tipos de día se envían ambos tipos en `day_type_config`. Los cambios concurrentes se comprueban antes de guardar.

### Dietas por opciones

1. Buscar IDs de alimentos con `search_foods`.
2. Construir `meals`: cada comida lleva `name`, `day_type` (`default`, `training`, `rest` o día semanal), `target` opcional y una o varias `options`.
3. Cada opción lleva `name` e `items`. Para un alimento calculable se indica `food_id` y `quantity_g`, o cantidad en unidades con peso conocido. `locked=true` impide ajustar su cantidad. Los textos libres usan `name` y notas y quedan sin macros calculables.
4. Enviar `daily_targets` por tipo de día permite repartir sus macros entre comidas, respetando las proporciones propuestas. `adjust_to_targets=true` (por defecto) ajusta cantidades con el mismo motor de la app. `strict_targets=true` rechaza opciones fuera de tolerancia, sin objetivo o con macros incompletos; por defecto devuelve advertencias para permitir dietas con notas o alimentos libres.
5. Usar `preview_diet_plan` para revisar cantidades y desviaciones; luego `create_diet_plan` guarda en `draft` por defecto. `status="active"` archiva la dieta activa anterior dentro de la misma transacción. Una dieta con inicio futuro debe ser borrador.

Ejemplo de estructura, sustituyendo IDs por resultados reales del catálogo:

```json
{
  "client_id": "UUID_DEL_CLIENTE",
  "name": "Dieta con opciones",
  "effective_from": "2026-10-12",
  "status": "draft",
  "daily_targets": {
    "training": { "protein_g": 160, "carbs_g": 300, "fat_g": 60 },
    "rest": { "protein_g": 160, "carbs_g": 200, "fat_g": 60 }
  },
  "meals": [
    {
      "name": "Comida", "day_type": "training",
      "options": [
        { "name": "Arroz con pollo", "items": [
          { "food_id": "UUID_ARROZ", "quantity_g": 100 },
          { "food_id": "UUID_POLLO", "quantity_g": 150 },
          { "food_id": "UUID_ACEITE", "quantity_g": 10 }
        ] },
        { "name": "Pasta con pollo", "items": [
          { "food_id": "UUID_PASTA", "quantity_g": 110 },
          { "food_id": "UUID_POLLO", "quantity_g": 150 },
          { "food_id": "UUID_ACEITE", "quantity_g": 10 }
        ] }
      ]
    },
    {
      "name": "Comida", "day_type": "rest",
      "options": [
        { "name": "Arroz con pollo", "items": [
          { "food_id": "UUID_ARROZ", "quantity_g": 80 },
          { "food_id": "UUID_POLLO", "quantity_g": 150 },
          { "food_id": "UUID_ACEITE", "quantity_g": 10 }
        ] }
      ]
    }
  ]
}
```

El ejemplo muestra el contrato; para repartir un día completo hay que añadir todas sus comidas. El ajuste tiene límites de cantidades y no garantiza que cualquier combinación de alimentos alcance cualquier objetivo: se informa de la desviación real.

Las alternativas de un alimento comparten `alternative_group` y exactamente una tiene `is_alternative=false`. Las demás usan `is_alternative=true` y `equivalence_basis` opcional (`kcal`, `protein`, `carbs`, `fat`). El motor calcula gramos equivalentes; no presupone igualdad de todos los macros.

Para editar, leer `get_diet_plan` y enviar `plan_id` y `expected_updated_at` exacto. Los campos de cabecera omitidos se conservan. Si se envía `meals`, reemplaza la estructura completa: conservar los IDs existentes de comida, opción y alimento; los nuevos no llevan ID. También se conservan IDs por posición si se omiten. Reordenar comidas/opciones exige sus IDs. No se pueden eliminar comidas u opciones con registros del atleta; crear un plan nuevo conserva ese historial. Una edición obsoleta se rechaza antes de tocar los datos.

La dieta por opciones y el plan de macros son registros independientes: `daily_targets` ajusta las comidas, pero no crea ni modifica `macro_plans`. Para cambiar ambos se utilizan sus respectivas herramientas.

### Guardado y acceso

La función `save_nexttrain_nutrition_plan` guarda cabecera y estructura en una transacción, con `SECURITY INVOKER`, RLS y comprobación explícita de membresía owner/coach y pertenencia del cliente. `anon` no tiene permiso de ejecución. Un error revierte también cualquier archivo/cierre de planes anteriores. Las macros de alimentos se vuelven a calcular desde el catálogo en la base de datos.

Verificación: `node --test scripts/mcp-nutrition.test.mjs scripts/diet-macros.test.mjs`, `deno check supabase/functions/nexttrain-mcp/index.ts`, `deno test supabase/functions/nexttrain-mcp/nutrition.test.ts`. La prueba SQL `supabase/tests/mcp_nutrition_atomic_save.sql` utiliza un cliente temporal con rol `authenticated` y termina con `ROLLBACK` explícito.

## Fuerza y cartera (MCP 0.6.1)

- `create_strength_program` llama a `create_nexttrain_strength_program`, que crea programa, días y ejercicios en una transacción con `SECURITY INVOKER`, RLS y comprobación de membresía y cliente. Cualquier error revierte todo; ya no se intenta borrar a posteriori. También crea las columnas por defecto de la app (`training_columns`). Con `status="active"` archiva antes el programa activo anterior del cliente, igual que la app y como exige el índice `unique_active_program_per_client`, y devuelve `archived_program_ids`; un programa activo no puede empezar en el futuro.
- `list_clients` obtiene el último check-in enviado de cada cliente con `nexttrain_latest_checkins` (`DISTINCT ON`), en lugar de un límite global que podía marcar como `sin_checkin` a clientes con check-ins antiguos. Si la consulta falla, la herramienta devuelve error en vez de omitir los check-ins.
- La migración añade el índice `idx_checkins_coach_client_submitted_at` para esa consulta.
- Todas las fechas de entrada se validan como fechas reales (`2026-02-31` se rechaza).

Despliegue: aplicar la migración `20261015140000_mcp_strength_program_atomic_save.sql` antes de desplegar la función. Verificación: `supabase/tests/mcp_strength_program_atomic_save.sql` (8 verificaciones; termina con `ROLLBACK`).

## Respuestas compactas y código común (MCP 0.7.0)

- Todas las herramientas devuelven el JSON en una sola línea, sin sangría, para gastar menos tokens. El contenido y los nombres de campo no cambian.
- `list_clients` acepta `offset` (por defecto 0) y devuelve `has_more` y `next_offset`, como el resto de listas. El orden es `full_name` y después `id`, para que las páginas no se solapen con nombres repetidos. Los últimos check-ins se consultan solo para los clientes de la página.
- `shared.ts` reúne lo que antes estaba copiado en `index.ts`, `history.ts`, `nutrition.ts` y `cardio.ts`: validación de fechas, `day`/`addDays`, `rows`, `allRows`, `inBatches`, `jsonResult`, `toolError`, `audit`, `resolveCoach`, `requireClient` y las anotaciones de lectura y escritura.
- `createToolRunner` es el envoltorio común de las herramientas con espacio de entrenador: resuelve el `coach_id`, comprueba el cliente si se indica, registra la auditoría (`record_id` o `result_count` cuando aplica) y convierte los errores en `toolError` con el mismo mensaje que antes. Las validaciones previas, como el orden de fechas en `set_athlete_goal` o `list_client_schedule`, siguen respondiendo antes de consultar la base de datos y sin auditoría.
- Los módulos de historial, nutrición y cardio aceptan sustitutos de `resolveCoach`, `requireClient`, `jsonResult`, `toolError` y `audit` para las pruebas; por defecto usan los de `shared.ts`.
- Nutrición mantiene sus mensajes de error y su paginación de 500 filas (hasta 10 500 por consulta).
- Una fecha con formato incorrecto muestra ahora en todas las herramientas el mismo aviso: «Usa el formato YYYY-MM-DD».

Verificación: `node --test scripts/mcp-strength-progress.test.mjs scripts/mcp-nutrition.test.mjs scripts/mcp-cardio-plan.test.mjs`, `deno check supabase/functions/nexttrain-mcp/index.ts`, `deno test supabase/functions/nexttrain-mcp/nutrition.test.ts supabase/functions/nexttrain-mcp/cardio.test.ts`. No requiere migraciones.

## Planificación real y zona horaria (MCP 0.8.0)

### Fuerza en `list_client_schedule`

La fuerza sigue la misma lógica que el calendario de la app (`getWeeklySchedule` en la planificación del coach y `getClientWeeklySchedule` en la del atleta):

- Cada fila de `scheduled_strength_sessions` del cliente aparece en su `scheduled_date`, con su `is_completed`. La app guarda ahí la finalización: al marcar la sesión o al registrar un ejercicio (`markStrengthSessionCompleted` / `autoMarkStrengthDayComplete`). Mover una sesión en el calendario cambia la fecha de esa fila; mover un día de plantilla crea la fila.
- Cuentan también las filas de programas archivados, igual que en la app. `program_status` indica el estado del programa.
- El programa activo (el más reciente con días de la semana asignados) completa los días que no tienen fila: `weeks` semanas (4 si falta) desde el lunes de la semana de `effective_from`, por `default_weekday`. Igual que en la app, no se usa `effective_to` y la primera semana incluye los días anteriores al inicio dentro de esa semana.
- Un día de plantilla se oculta cuando, en la misma semana de lunes a domingo, existe una fila del mismo día del programa. Por eso una sesión reprogramada solo aparece en su fecha nueva. Para aplicar esta regla se leen siempre las semanas completas que cubren el rango, aunque este empiece o acabe a mitad de semana.

Campos nuevos en los elementos `kind: "strength"` (se mantienen `date`, `program_id`, `program_name`, `week`, `day_id`, `day_name` y `exercises`):

- `source`: `scheduled_session` (fila guardada) o `program_template` (día previsto por la plantilla, sin fila).
- `session_id`: ID de la fila, o `null` en los días de plantilla.
- `is_completed`: `true` solo si la fila está marcada como completada. Los días de plantilla siempre son `false`; que no esté marcada no demuestra que se omitiera.
- `rescheduled` y `original_date`: si la fila cae en otra fecha que el mismo día de la plantilla en esa semana, `rescheduled=true` y `original_date` es la fecha de la plantilla. La base de datos no guarda la fecha original: se deduce de la plantilla de la semana, como hace la app al mostrar «Ajustada». Si una sesión se mueve a otra semana, la app y el MCP la comparan con la plantilla de la semana de destino, y en la semana de origen vuelve a aparecer el día de plantilla.
- `extra_session`: `true` si la fila no sustituye a ningún día de la plantilla en esa semana (sesión añadida, duplicada o de otro programa). En la app se muestra como «Manual».
- `program_status`: estado del programa de la fila.
- `week` de una fila se calcula con el programa de esa fila y es `null` fuera de sus semanas. Los ejercicios se ordenan por `order_index`.

Todas las consultas filtran por `coach_id` y `client_id` además de RLS. Los programas de las filas que no son el activo se leen con el mismo filtro.

### «Hoy» en la zona del espacio de trabajo

- `resolveCoach` lee `coaches.timezone` en la misma consulta de la membresía (`coaches(timezone)`), sin consultas extra. Si falta o no es una zona IANA válida, se usa `Europe/Madrid`, como en la app (`src/data/billing.ts`).
- `createToolRunner` calcula una vez por petición `timeZone` y `today` con `todayIn(timeZone)` (`Intl.DateTimeFormat('en-CA', { timeZone })`) y los pasa a cada herramienta.
- Usan ese día: `checkin_atrasado` en `list_clients` y en `get_client_overview`, `days_until_end` y `deadline_status` del objetivo, la ventana de cardio y los próximos eventos del resumen, los rangos por defecto del historial (`get_body_history`, `get_recovery_history`, `list_client_events`, `get_strength_results`, `get_cardio_results`), `as_of_date` por defecto en `get_program_history` y `on_date` por defecto en `get_current_nutrition`.
- `list_clients` y `get_client_overview` devuelven `today` para que se vea qué día se usó.
- No cambian: las fechas que ya son días (`scheduled_date`, `event_date`…), ni las marcas de tiempo `updated_at`. Las fechas de envío de check-ins (`submitted_at`) y sus filtros por rango siguen en UTC.
- Las funciones SQL `create_nexttrain_strength_program` y `save_nexttrain_nutrition_plan` siguen usando `current_date` de Postgres (UTC) para rechazar un programa o una dieta activos con inicio futuro. Entre las 00:00 y las 02:00 en España pueden rechazar una fecha de inicio de hoy. Cambiarlo requiere una migración aparte.

### Código y pruebas

- `list_clients` pasa a `clients.ts` y `list_client_schedule` a `schedule.ts`. Aceptan los sustitutos de pruebas de `ToolHelpers`, que ahora incluye `now` opcional para fijar el reloj.
- `buildStrengthSchedule` es la función pura que resuelve la fuerza; `clientAttentionFlags` calcula las señales de cada cliente.

Verificación: `npx -y deno@2.1.4 check --node-modules-dir=none supabase/functions/nexttrain-mcp/index.ts`, `npx -y deno@2.1.4 test --node-modules-dir=none --allow-env --allow-read supabase/functions/nexttrain-mcp/` (incluye `schedule.test.ts` y `timezone.test.ts`) y `node --test scripts/mcp-*.test.mjs`. No requiere migraciones.

## Respuestas estructuradas y resultados agrupados (MCP 0.9.0)

### JSON compacto

Las respuestas ya se devolvían en una sola línea desde la 0.7.0 (`jsonResult` en `shared.ts`); no ha hecho falta cambiarlo.

### `structuredContent` y `outputSchema` (MCP 2025-06-18)

- Cada respuesta correcta incluye `structuredContent` con los mismos datos que el texto JSON. El texto se mantiene, como recomienda la especificación, para los clientes que no leen `structuredContent`. Ambos se generan a partir de la misma serialización, así que coinciden exactamente.
- Todas las herramientas declaran `outputSchema` (`output-schemas.ts`). Se añade en `index.ts` con `withOutputSchemas(new McpServer(...))`, sin tocar cada registro. Un esquema explícito en el registro tiene prioridad.
- El SDK valida `structuredContent` contra el esquema y, si no encaja, convierte la respuesta en error. Por eso los esquemas solo fijan las claves de primer nivel y sus tipos, y los objetos anidados admiten campos extra (`z.looseObject`). Los errores (`isError`) no se validan.
- Contrapartida: un cliente que entregue al modelo tanto el texto como `structuredContent` enviaría los datos dos veces. Los clientes habituales usan uno u otro.

### Resultados de fuerza agrupados

`get_strength_results` y el detalle de `get_program_history` (con `program_id`) aceptan `format`:

- `grouped` (por defecto): `workouts`, con una entrada por sesión (`program_id`, `program_name`, `day_id`, `day_name`, `week_index`, `scheduled_date`, `scheduled_date_source`, `session_id`, `session_completed`). Cada sesión tiene `exercises` (`exercise_id`, `exercise`, `catalog_exercise_id`, `comparison_exercise_id`, `comparison_scope`) y cada ejercicio tiene `sets` con lo propio de la serie (`id`, `source`, `execution_status`, `set_number`, `weight_kg`, `reps`, `rir`, `rpe`, `completed`, `performed_at`, `recorded_at`, `notes`, `note_source`). En las series se omiten los campos nulos y `set_index`. `result_count` cuenta las series de la página.
- `flat`: `results`, una fila por serie con todos los campos, como hasta la 0.8.0.
- **Cambio de formato:** por defecto ya no se devuelve `results`, sino `workouts`. Para el formato anterior hay que enviar `format: "flat"`.
- La paginación (`limit`/`offset`, `result_limit`/`result_offset`) sigue contando series. Una sesión partida entre dos páginas aparece en ambas con sus series de cada página.
- En una página típica de 200 series (10 sesiones × 5 ejercicios × 4 series), el JSON agrupado ocupa un 34 % del plano (prueba en `strength-results.test.ts`).

Verificación: `npx -y deno@2.1.4 check --node-modules-dir=none supabase/functions/nexttrain-mcp/index.ts`, `npx -y deno@2.1.4 test --node-modules-dir=none --allow-env --allow-read supabase/functions/nexttrain-mcp/` y `node --test scripts/mcp-*.test.mjs`. `sdk.test.ts` usa el SDK real (`createMcpHandler`) para comprobar que `tools/list` publica los esquemas y que `tools/call` devuelve `structuredContent`. Las pruebas de cardio, nutrición, planificación, clientes e historial validan sus respuestas contra los esquemas. No requiere migraciones.

## Agenda, eventos, bandeja y prompts (MCP 0.10.0)

### Tareas del entrenador

- `list_coach_tasks`: filtra por `status` (`pending` por defecto, `completed` o `all`), `client_id` y fechas. Paginada con `has_more` y `next_offset`. Devuelve `client_name`, `overdue` (pendiente con fecha anterior a hoy, en la zona del espacio) y `updated_at`.
- `update_coach_task`: edita título, descripción, fecha (también para aplazar), prioridad y cliente (`null` lo desvincula). `status: "completed"` rellena `completed_at`, igual que la app; `status: "pending"` la reabre y lo vacía.
- Mismo mecanismo de concurrencia que cardio y nutrición: hay que enviar `expected_updated_at` (el `updated_at` leído) y la escritura se filtra por ese valor. Si la tarea cambió entretanto, no se guarda nada.
- No se borran tareas desde el MCP.

### Eventos del cliente

- `create_client_event`: mismos valores que la app. `event_type` puede ser `race` (por defecto), `test`, `camp` u `other`; `status`, `planned` (por defecto), `completed` o `cancelled`; `priority`, `a`, `b` (por defecto) o `c`. Los textos vacíos se guardan como `null`.
- `update_client_event`: edición parcial con `expected_updated_at`. `list_client_events` devuelve ahora `updated_at`. Para anular un evento se usa `status: "cancelled"`; el MCP no borra eventos.

### Bandeja del entrenador

`get_coach_inbox` reúne, solo de clientes activos (como el panel de la app):

- `checkins_to_review`: check-ins enviados que siguen en `reviewed` (la app los pasa a `archived` al aprobar), sin revisión aprobada, del más antiguo al más reciente. Incluye señales breves, `review_status`, `ai_status` y `has_draft_message`.
- `unlinked_strava_activities`: actividades no borradas sin `cardio_session_id` ni `matched_planned_session_id` de los últimos `strava_days` días (21 por defecto, como la app). `feedback_status=pending` indica que el atleta aún no las ha revisado.
- `pending_tasks`: tareas pendientes de hoy o vencidas, con `overdue`. Incluye las tareas sin cliente.
- Cada sección devuelve como mucho `limit` elementos (30 por defecto) y `has_more`. Son cuatro consultas en total y una más para los nombres, independientemente del número de clientes.

### Prompts MCP

Guían al modelo sobre qué herramientas usar y en qué orden; no modifican datos por sí mismos y piden confirmación antes de guardar.

- `revision_semanal` (`cliente`, `checkin_id` opcional): check-in, resumen del cliente, peso, recuperación, fuerza, cardio, planificación y nutrición. Termina con un resumen interno y un borrador de mensaje para el cliente.
- `preparar_bloque_siguiente` (`cliente`, `semanas` opcional): historial de programas, resultados agrupados, objetivo, eventos y check-ins recientes. Propone el bloque y lo crea en borrador tras la confirmación.
- `bandeja_del_dia`: `get_coach_inbox` ordenado por prioridad.
- `cliente` admite nombre o ID; si es un nombre, se busca con `list_clients`.

Verificación: `agenda.test.ts` (tareas, eventos, bandeja y prompts) y `sdk.test.ts` (`prompts/list` y `prompts/get` con el SDK real), además del resto de pruebas de Deno y node. No requiere migraciones: las tablas `coach_tasks` y `client_events` ya permiten a los miembros activos del espacio leer y escribir (`sql/create_coach_tasks.sql`, `sql/create_client_events.sql`).

## Revisiones en borrador y estado de los programas (MCP 0.11.0)

Requiere aplicar la migración `20261016120000_mcp_review_draft_and_program_update.sql` **antes** de desplegar la función.

### `save_review_draft`

- Guarda `summary` (resumen interno) y `message_to_client` (borrador del mensaje) de la revisión de un check-in enviado. Si no existe revisión, la crea en borrador con `ai_status='pending'`, igual que la app al recibir el formulario.
- Solo trabaja con revisiones en `draft`. Aprobar, enviar al cliente, notificar y archivar el check-in siguen siendo exclusivos de la app. Una revisión aprobada se rechaza.
- Concurrencia: no hay `updated_at` fiable en `reviews`, así que hay que enviar `expected_summary` y `expected_message_to_client` con los valores actuales devueltos por `get_checkins` (`null` si no hay revisión). Si alguno no coincide, no se guarda nada.
- Omitir un campo lo conserva; `null` o texto vacío lo vacía. Cada texto admite hasta 10 000 caracteres.
- Permisos: `save_nexttrain_review_draft` es `SECURITY INVOKER` con `search_path` vacío. RLS se aplica con la política `reviews_rw_member` (`is_coach_member`: miembro activo owner/coach). Además comprueba con `auth.uid()` la membresía, que el cliente pertenece al espacio y que el check-in es de ese cliente y está enviado. Solo modifica esas dos columnas. `anon` no tiene permiso de ejecución.

### `update_strength_program`

- Cambia `name`, `weeks`, `effective_from` y `status` (`draft`, `active`, `archived`) con `expected_updated_at`. `get_program_history` devuelve ahora `updated_at` de cada programa.
- Activar archiva antes el programa activo del cliente en la misma transacción, como la creación. Si no se indica fecha, el programa empieza hoy (en la zona del espacio), como `activateTrainingProgramAction`. Un programa activo no puede empezar en el futuro.
- Cambiar la fecha de inicio o las semanas recalcula `effective_to` y borra las sesiones programadas **no completadas** de ese programa, como hace la app al regenerar el calendario (`generateProgramSchedule`). La plantilla las sustituye en el calendario. La respuesta devuelve `removed_scheduled_sessions`. Las sesiones completadas se conservan.
- `update_nexttrain_strength_program` es `SECURITY INVOKER`, con RLS y comprobación de membresía y cliente.
- No edita días ni ejercicios. Eso queda para cuando se fusione el catálogo de ejercicios (`feature/mcp-exercise-catalog`), para resolver los ejercicios igual que al crear.

### Prompts

`revision_semanal` termina guardando el texto confirmado con `save_review_draft`. `preparar_bloque_siguiente` usa `update_strength_program` para activar o archivar.

Verificación:
- `coach-writes.test.ts`: parámetros, versiones, errores propios y ocultos, y «hoy» en la zona del espacio.
- `supabase/tests/mcp_review_draft_and_program_update.sql`: 9 verificaciones; termina con `ROLLBACK`.
- La prueba SQL se ha ejecutado en PGlite (Postgres 16) con un esquema mínimo. Hay que repetirla contra la base real tras aplicar la migración.

## Ajustes requeridos en Supabase

1. Activar Authentication > OAuth Server.
2. Configurar Authorization path como `/oauth/consent`.
3. Activar dynamic client registration.
4. Mantener Site URL en `https://nexttrain.ascenttech.cloud`.
5. Desplegar `nexttrain-mcp` con la verificación JWT del gateway desactivada. La función valida OAuth dentro de `withSupabase({ auth: 'user' })`; esto permite que el descubrimiento OAuth sin sesión responda correctamente.
