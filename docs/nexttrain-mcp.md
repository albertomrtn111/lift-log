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
- `list_client_schedule`: consulta fuerza, cardio y eventos en un rango de fechas.
- `get_body_history`: pesajes diarios, media semanal calculada, medias declaradas y medidas corporales de check-ins.
- `get_strength_results`: series confirmadas y valores editados sin confirmar, cargas, repeticiones, RIR/RPE, notas, identificadores comparables y sesiones completadas.
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

## Ajustes requeridos en Supabase

1. Activar Authentication > OAuth Server.
2. Configurar Authorization path como `/oauth/consent`.
3. Activar dynamic client registration.
4. Mantener Site URL en `https://nexttrain.ascenttech.cloud`.
5. Desplegar `nexttrain-mcp` con la verificación JWT del gateway desactivada. La función valida OAuth dentro de `withSupabase({ auth: 'user' })`; esto permite que el descubrimiento OAuth sin sesión responda correctamente.
