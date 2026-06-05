# Cardio Progress Analysis Design

## Objetivo

Redisenar `Progreso > Cardio` para que el coach pueda analizar una sesion sin tener que abrir siempre el detalle, y para que el detalle permita comparar lo pautado contra lo realizado con una lectura tipo Garmin/Strava.

La prioridad visual es:

1. Kilometros realizados.
2. Diferencial contra lo programado.
3. Ritmo, RPE y pulso.
4. Feedback del atleta.
5. Entreno programado.
6. Analisis por bloques y graficas en el detalle.

## Fuentes de datos

La app ya guarda datos de Strava en:

- `cardio_sessions`: resumen real de la sesion, pulso, RPE, feedback y estructura planificada.
- `strava_activity_streams`: streams completos cuando Strava los devuelve.
- `strava_activity_laps`: laps devueltos por Strava y metricas derivadas.

Strava documenta endpoints para laps de actividad (`/activities/{id}/laps`) y streams de actividad (`/activities/{id}/streams`). La UX no dependera de que el atleta tenga Strava Premium ni de que Strava muestre splits visuales en su interfaz. El analisis principal se calculara con streams propios cuando existan.

## Resumen Semanal

Encima de la lista se mostrara un resumen compacto:

- `km hechos / km planificados`.
- Diferencial: `+4.0 km`, `-2.0 km` o `0.0 km`.
- RPE medio si existe.
- FC media si existe.
- Ritmo medio si existe.
- Numero de sesiones por revisar.

Debe ser escaneable en desktop y convertirse en cards/chips compactos en movil.

## Card Cerrada de Sesion

Cada sesion cerrada mostrara:

- Titulo, fecha, disciplina y estado.
- Dato principal grande: km realizados.
- Debajo: diferencial vs plan.
- Linea de rendimiento: ritmo medio, FC media/maxima, RPE.
- Preview de feedback si existe.
- Resumen compacto del entreno programado si existe estructura.

La card no debe obligar a abrir detalle para saber si la sesion fue bien o mal.

## Detalle de Sesion

Al desplegar una sesion se mostrara:

1. Cabecera de analisis:
   - Km realizados.
   - Diferencial vs plan.
   - Ritmo medio.
   - RPE.
   - FC media y maxima.
   - Feedback del atleta visible arriba.

2. Entreno programado:
   - Bloques pautados renderizados con claridad.
   - Ejemplo: calentamiento, serie, recuperacion, vuelta a la calma.

3. Tabla de ejecucion por bloques:
   - Filas separadas para recuperaciones.
   - Ejemplo: `Calentamiento`, `Serie 1`, `Rec 1`, `Serie 2`, `Rec 2`, `Serie 3`, `Vuelta calma`.
   - Columnas en desktop: bloque, objetivo, real, ritmo, FC media, FC maxima, diferencia.
   - En movil se renderizara como tarjetas/filas apiladas, no como una tabla ancha que fuerce overflow.

4. Graficas:
   - Ritmo.
   - Pulso.
   - Eje automatico:
     - Distancia si el plan esta pautado por distancia.
     - Tiempo si el plan esta pautado por duracion.
     - En planes mixtos, distancia si existe stream de distancia; si no, tiempo.

## Motor de Segmentacion

Se creara un helper independiente para partir una actividad real segun la estructura planificada.

Entrada:

- `CardioStructure` con bloques estructurados.
- Streams de Strava: tiempo, distancia, velocidad/ritmo, pulso.
- Laps de Strava como fallback.

Salida:

- Segmentos calculados con:
  - etiqueta de bloque.
  - tipo: calentamiento, trabajo, recuperacion, vuelta a la calma.
  - objetivo legible.
  - distancia real.
  - duracion real.
  - ritmo medio.
  - FC media.
  - FC maxima.
  - FC inicial y final si existen.
  - diferencia contra objetivo.

Reglas:

- Si hay estructura y streams suficientes, cortar por lo pautado.
- Para bloques por distancia, avanzar por stream de distancia.
- Para bloques por duracion, avanzar por stream de tiempo.
- Para intervalos, expandir `sets` en filas de trabajo y recuperacion.
- Si no hay streams suficientes, usar laps de Strava.
- Si no hay laps utiles, mostrar la actividad completa como un unico segmento.

## Compatibilidad

- Sesiones antiguas con descripcion libre se seguiran mostrando.
- Sesiones sin estructura tendran resumen completo y detalle basico.
- El analisis por bloques solo aparecera cuando haya estructura o laps suficientes.
- No se hara migracion destructiva de sesiones antiguas.

## Movil

La pantalla debe funcionar en 360-390px:

- Cards en una columna.
- Detalle sin tabla horizontal obligatoria.
- Graficas con altura fija y labels compactos.
- Textos largos con `break-words`/`min-w-0`.
- Acciones y desplegables con targets tactiles comodos.

## Testing

- Unit tests del motor de segmentacion:
  - plan por distancia.
  - plan por tiempo.
  - plan mixto.
  - expansion de intervalos con recuperaciones.
  - fallback a laps.
  - fallback a actividad completa.
- Regression tests para resumen de estructura antigua.
- Build completo de Next.
- Verificacion movil del flujo si hay navegador/Playwright disponible.

