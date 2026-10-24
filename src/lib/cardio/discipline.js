// Disciplina de una sesión de cardio y su métrica de intensidad.
//
// Las sesiones guardan el deporte en campos distintos según su origen: el
// coach usa `activity_type` ("Bicicleta") y `training_type` ("rodaje"), y las
// importadas de Strava guardan su tipo en crudo ("Ride", "MountainBikeRide",
// "VirtualRide"…). Se buscan palabras clave en todos ellos en vez de exigir una
// coincidencia exacta, que dejaba las bicis de Strava como Running.
//
// Puro (sin dependencias) para probarlo con node --test.

/** @typedef {'running' | 'bicicleta' | 'natacion' | 'hibrido'} CardioDiscipline */

// «ride» sin la t de «strides» (ejercicio de carrera); sin «velo», que choca con «velocidad»
const BIKE = /bike|bici|cycl|ciclismo|(^|[^t])ride/
const SWIM = /swim|nataci|natació/
const HYBRID = /hybrid|h[ií]brid|hyrox|mixed/

function normalize(value) {
  return String(value ?? '').toLowerCase().trim()
}

function matches(values, pattern) {
  return values.some((value) => pattern.test(value))
}

/**
 * Disciplina a partir de cualquier combinación de campos (tipo de actividad,
 * tipo de entrenamiento, tipo de Strava). Sin pistas de otro deporte, carrera.
 * @param {...(string | null | undefined)} values
 * @returns {CardioDiscipline}
 */
export function cardioDiscipline(...values) {
  const normalized = values.map(normalize).filter(Boolean)
  if (matches(normalized, BIKE)) return 'bicicleta'
  if (matches(normalized, SWIM)) return 'natacion'
  if (matches(normalized, HYBRID)) return 'hibrido'
  return 'running'
}

/** En bici la intensidad se expresa en velocidad, no en ritmo por kilómetro */
export function usesSpeed(discipline) {
  return discipline === 'bicicleta'
}

/** km/h a partir de distancia (km) y duración (min) */
export function speedKmh(distanceKm, durationMin) {
  const km = Number(distanceKm)
  const min = Number(durationMin)
  if (!(km > 0) || !(min > 0)) return null
  return km / (min / 60)
}

/** km/h a partir de un ritmo en segundos por kilómetro */
export function speedFromPaceSeconds(secondsPerKm) {
  const seconds = Number(secondsPerKm)
  return seconds > 0 ? 3600 / seconds : null
}

/** «23,4 km/h» */
export function formatSpeed(kmh) {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh) || kmh <= 0) return null
  return `${kmh.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`
}

/** «4:35/km» */
export function formatPacePerKm(secondsPerKm) {
  const seconds = Number(secondsPerKm)
  if (!(seconds > 0) || !Number.isFinite(seconds)) return null
  let minutes = Math.floor(seconds / 60)
  let rest = Math.round(seconds % 60)
  if (rest === 60) {
    minutes += 1
    rest = 0
  }
  return `${minutes}:${String(rest).padStart(2, '0')}/km`
}

/**
 * Texto de intensidad para guardar o mostrar: velocidad en bici, ritmo en el
 * resto. Si falta distancia o tiempo, se usa el ritmo conocido.
 */
export function formatCardioIntensity({ discipline, distanceKm, durationMin, paceSecondsPerKm }) {
  if (usesSpeed(discipline)) {
    return formatSpeed(speedKmh(distanceKm, durationMin) ?? speedFromPaceSeconds(paceSecondsPerKm))
  }
  return formatPacePerKm(paceSecondsPerKm)
}
