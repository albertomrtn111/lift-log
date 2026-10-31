// Catálogo de Analítica: métricas, ejes, visuales y periodos que puede combinar
// el coach en el constructor de gráficos. Cada métrica tiene una sola
// definición; el constructor y el motor (engine.js) validan contra esta lista,
// así que añadir una métrica es tocar este fichero, no la base de datos.

/**
 * @typedef {'strength' | 'body' | 'cardio' | 'tracking'} MetricSource
 * @typedef {'day' | 'week' | 'month' | 'athlete' | 'exercise' | 'muscle_group' | 'discipline' | 'none'} Dimension
 * @typedef {'kpi' | 'line' | 'bar' | 'heatmap' | 'scatter' | 'table'} Visual
 * @typedef {'kg' | '%' | 'series' | 'reps' | 'RIR' | 'sesiones' | 'km' | 'min' | 'min/km' | 'ppm' | 'm' | 'pasos' | 'h' | 'ms' | 'pts' | 'días'} MetricUnit
 * @typedef {{
 *   key: string
 *   label: string
 *   family: 'Fuerza' | 'Cuerpo' | 'Cardio' | 'Seguimiento'
 *   source: MetricSource
 *   unit: MetricUnit
 *   decimals: number
 *   description: string
 *   higherIsBetter?: boolean
 *   timeless?: boolean
 * }} MetricDefinition
 */

/** @type {MetricDefinition[]} */
const METRIC_LIST = [
  // Fuerza: una fila por serie registrada (kg y reps), fechada con performed_at
  { key: 'e1rm', label: 'e1RM', family: 'Fuerza', source: 'strength', unit: 'kg', decimals: 1, higherIsBetter: true,
    description: 'Mejor 1RM estimado (Epley: kg × (1 + reps/30)) con series de 1 a 12 repeticiones; con más no es fiable. En el tooltip, la serie que lo da.' },
  { key: 'top_kg', label: 'Carga máxima', family: 'Fuerza', source: 'strength', unit: 'kg', decimals: 1, higherIsBetter: true,
    description: 'Kilos de la serie más pesada.' },
  { key: 'e1rm_change', label: 'Progreso e1RM', family: 'Fuerza', source: 'strength', unit: '%', decimals: 1, higherIsBetter: true,
    description: 'Cambio del e1RM (series de 1 a 12 reps) entre la primera y la última semana con series del periodo, por atleta y ejercicio (mediana si se juntan varios). Necesita dos semanas registradas.' },
  { key: 'sets', label: 'Series', family: 'Fuerza', source: 'strength', unit: 'series', decimals: 0, higherIsBetter: true,
    description: 'Series con kg y reps registrados.' },
  { key: 'sets_per_week', label: 'Series por semana', family: 'Fuerza', source: 'strength', unit: 'series', decimals: 1, higherIsBetter: true,
    description: 'Series registradas divididas entre las semanas del periodo.' },
  { key: 'tonnage', label: 'Tonelaje', family: 'Fuerza', source: 'strength', unit: 'kg', decimals: 0, higherIsBetter: true,
    description: 'Suma de kg × reps.' },
  { key: 'reps', label: 'Repeticiones', family: 'Fuerza', source: 'strength', unit: 'reps', decimals: 0,
    description: 'Suma de repeticiones registradas.' },
  { key: 'rir_avg', label: 'RIR medio', family: 'Fuerza', source: 'strength', unit: 'RIR', decimals: 1,
    description: 'Media del RIR registrado en las series que lo tienen.' },
  { key: 'rir_dev', label: 'Desviación de RIR', family: 'Fuerza', source: 'strength', unit: 'RIR', decimals: 1,
    description: 'RIR registrado menos RIR prescrito. Positivo: entrena más lejos del fallo de lo pedido.' },
  { key: 'strength_sessions', label: 'Días de fuerza', family: 'Fuerza', source: 'strength', unit: 'sesiones', decimals: 0, higherIsBetter: true,
    description: 'Días distintos con al menos una serie registrada.' },

  // Cuerpo: métricas diarias del atleta (client_metrics)
  { key: 'weight', label: 'Peso corporal', family: 'Cuerpo', source: 'body', unit: 'kg', decimals: 1,
    description: 'Media de los registros de peso.' },
  { key: 'weight_change', label: 'Cambio de peso', family: 'Cuerpo', source: 'body', unit: 'kg', decimals: 1,
    description: 'Media de los últimos 7 días con registro menos la de los 7 primeros del periodo, por atleta.' },
  { key: 'steps', label: 'Pasos', family: 'Cuerpo', source: 'body', unit: 'pasos', decimals: 0, higherIsBetter: true,
    description: 'Media de pasos diarios registrados.' },
  { key: 'sleep_h', label: 'Sueño', family: 'Cuerpo', source: 'body', unit: 'h', decimals: 1, higherIsBetter: true,
    description: 'Media de horas de sueño registradas.' },
  { key: 'sleep_score', label: 'Calidad del sueño', family: 'Cuerpo', source: 'body', unit: 'pts', decimals: 0, higherIsBetter: true,
    description: 'Media de la puntuación de sueño registrada.' },
  { key: 'hrv', label: 'VFC', family: 'Cuerpo', source: 'body', unit: 'ms', decimals: 0, higherIsBetter: true,
    description: 'Media de la variabilidad de la frecuencia cardiaca registrada.' },
  { key: 'fatigue', label: 'Fatiga', family: 'Cuerpo', source: 'body', unit: 'pts', decimals: 1,
    description: 'Media de la fatiga que registra el atleta.' },

  // Cardio: sesiones hechas en NexTrain y actividades de Strava, sin contar dos veces la misma (como Temporada)
  { key: 'cardio_km', label: 'Distancia', family: 'Cardio', source: 'cardio', unit: 'km', decimals: 1, higherIsBetter: true,
    description: 'Suma de km de las sesiones hechas y las actividades de Strava.' },
  { key: 'cardio_min', label: 'Tiempo de cardio', family: 'Cardio', source: 'cardio', unit: 'min', decimals: 0, higherIsBetter: true,
    description: 'Suma de minutos de las sesiones hechas y las actividades de Strava.' },
  { key: 'cardio_sessions', label: 'Sesiones de cardio', family: 'Cardio', source: 'cardio', unit: 'sesiones', decimals: 0, higherIsBetter: true,
    description: 'Sesiones de cardio hechas.' },
  { key: 'cardio_pace', label: 'Ritmo medio', family: 'Cardio', source: 'cardio', unit: 'min/km', decimals: 2,
    description: 'Minutos totales entre km totales. Filtra por una disciplina para que tenga sentido.' },
  { key: 'cardio_hr', label: 'FC media', family: 'Cardio', source: 'cardio', unit: 'ppm', decimals: 0,
    description: 'Media de la frecuencia cardiaca media de las sesiones que la tienen.' },
  { key: 'cardio_rpe', label: 'RPE medio', family: 'Cardio', source: 'cardio', unit: 'pts', decimals: 1,
    description: 'Media del esfuerzo percibido (RPE) de las sesiones que lo tienen.' },
  { key: 'cardio_elevation', label: 'Desnivel', family: 'Cardio', source: 'cardio', unit: 'm', decimals: 0,
    description: 'Suma del desnivel positivo de las actividades de Strava.' },

  // Seguimiento: estado actual de cada atleta, no depende del periodo
  { key: 'adherence', label: 'Adherencia de fuerza', family: 'Seguimiento', source: 'tracking', unit: '%', decimals: 0, higherIsBetter: true, timeless: true,
    description: 'Series registradas del programa activo frente a las prescritas en los últimos 28 días (o desde que empezó el programa). Necesita 7 días de programa.' },
  { key: 'block_e1rm', label: 'Δ e1RM del bloque', family: 'Seguimiento', source: 'tracking', unit: '%', decimals: 1, higherIsBetter: true, timeless: true,
    description: 'Mediana, entre los ejercicios del programa activo, del cambio de e1RM entre la primera y la última semana registrada. Mismo cálculo que el Δ de Progreso.' },
  { key: 'days_since_log', label: 'Días sin registrar fuerza', family: 'Seguimiento', source: 'tracking', unit: 'días', decimals: 0, timeless: true,
    description: 'Días desde la última serie registrada.' },
]

/** @type {Record<string, MetricDefinition>} */
export const METRICS = Object.fromEntries(METRIC_LIST.map(metric => [metric.key, metric]))

export const METRIC_FAMILIES = ['Fuerza', 'Cuerpo', 'Cardio', 'Seguimiento']

/** @param {string} family */
export function metricsOfFamily(family) {
  return METRIC_LIST.filter(metric => metric.family === family)
}

/** @type {Record<Dimension, { label: string, time?: boolean }>} */
export const DIMENSIONS = {
  day: { label: 'Día', time: true },
  week: { label: 'Semana', time: true },
  month: { label: 'Mes', time: true },
  athlete: { label: 'Atleta' },
  exercise: { label: 'Ejercicio' },
  muscle_group: { label: 'Grupo muscular' },
  discipline: { label: 'Disciplina' },
  none: { label: 'Total' },
}

const TIME_DIMS = /** @type {Dimension[]} */ (['day', 'week', 'month'])

/** Ejes que admite cada fuente de datos */
const SOURCE_DIMENSIONS = {
  strength: [...TIME_DIMS, 'athlete', 'exercise', 'muscle_group', 'none'],
  body: [...TIME_DIMS, 'athlete', 'none'],
  cardio: [...TIME_DIMS, 'athlete', 'discipline', 'none'],
  tracking: ['athlete', 'none'],
}

/** Desgloses (una serie por valor) que admite cada fuente */
const SOURCE_BREAKDOWNS = {
  strength: ['athlete', 'exercise', 'muscle_group'],
  body: ['athlete'],
  cardio: ['athlete', 'discipline'],
  tracking: [],
}

/**
 * @param {string} metricKey
 * @returns {Dimension[]}
 */
export function dimensionsFor(metricKey) {
  const metric = METRICS[metricKey]
  return metric ? /** @type {Dimension[]} */ (SOURCE_DIMENSIONS[metric.source]) : []
}

/**
 * @param {string} metricKey
 * @param {Dimension} axis
 * @returns {Dimension[]}
 */
export function breakdownsFor(metricKey, axis) {
  const metric = METRICS[metricKey]
  if (!metric) return []
  return /** @type {Dimension[]} */ (SOURCE_BREAKDOWNS[metric.source]).filter(dimension => dimension !== axis)
}

export function isTimeDimension(dimension) {
  return TIME_DIMS.includes(dimension)
}

/** @type {Record<Visual, { label: string, axes: (axis: Dimension) => boolean, breakdown: boolean }>} */
export const VISUALS = {
  line: { label: 'Línea', axes: axis => isTimeDimension(axis), breakdown: true },
  bar: { label: 'Barras', axes: axis => axis !== 'none', breakdown: true },
  heatmap: { label: 'Mapa de calor', axes: axis => isTimeDimension(axis), breakdown: true },
  table: { label: 'Tabla', axes: axis => axis !== 'none', breakdown: false },
  kpi: { label: 'KPI', axes: axis => axis === 'none', breakdown: false },
  scatter: { label: 'Dispersión', axes: axis => axis === 'athlete' || axis === 'exercise', breakdown: false },
}

/**
 * Visuales que tienen sentido para una métrica (según sus ejes posibles)
 * @param {string} metricKey
 * @returns {Visual[]}
 */
export function visualsFor(metricKey) {
  const dimensions = dimensionsFor(metricKey)
  return /** @type {Visual[]} */ (Object.keys(VISUALS)).filter(visual => dimensions.some(axis => VISUALS[visual].axes(axis)))
}

/** Ejes válidos para una métrica y un visual */
export function axesFor(metricKey, visual) {
  return dimensionsFor(metricKey).filter(axis => VISUALS[visual]?.axes(axis))
}

/** Métricas que pueden ser columna de una tabla (o eje Y de una dispersión) con ese eje */
export function companionMetrics(axis) {
  return METRIC_LIST.filter(metric => SOURCE_DIMENSIONS[metric.source].includes(axis))
}

export const PERIODS = {
  '4w': { label: '4 semanas', days: 28 },
  '8w': { label: '8 semanas', days: 56 },
  '12w': { label: '12 semanas', days: 84 },
  '6m': { label: '6 meses', days: 182 },
  '1y': { label: '1 año', days: 365 },
  custom: { label: 'Fechas', days: 0 },
}

export const DISCIPLINE_LABELS = {
  run: 'Carrera',
  bike: 'Bici',
  swim: 'Natación',
  other: 'Otro cardio',
}

/** Paleta de series: distinguible en claro y oscuro */
export const SERIES_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#64748b']
