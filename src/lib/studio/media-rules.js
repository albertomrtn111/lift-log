// Reglas puras de los medios de sala (probadas con node --test).

const YOUTUBE_ID = /^[\w-]{11}$/
const YOUTUBE_PATHS = ['shorts', 'embed', 'live', 'v']

/**
 * Id del vídeo de un enlace de YouTube, o null si no lo es.
 * @param {string} url
 */
export function youtubeId(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, '')
  let id = null
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/')[1]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = parsed.pathname.split('/')
    id = first === 'watch' ? parsed.searchParams.get('v') : YOUTUBE_PATHS.includes(first) ? second : null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

/**
 * Comprueba un enlace pegado. Solo vale https, para que nadie guarde un enlace que ejecute código.
 * @param {string} text
 * @returns {{ url: string, kind: 'youtube' | 'link' } | { error: string }}
 */
export function parseMediaLink(text) {
  const clean = String(text ?? '').trim()
  if (!clean) return { error: 'Pega un enlace.' }
  if (clean.length > 500) return { error: 'Ese enlace es demasiado largo.' }

  let parsed
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(clean) ? clean : `https://${clean}`)
  } catch {
    return { error: 'Ese enlace no es válido.' }
  }
  if (parsed.protocol !== 'https:') return { error: 'El enlace tiene que empezar por https://.' }
  if (!parsed.hostname.includes('.')) return { error: 'Ese enlace no es válido.' }

  const url = parsed.toString()
  return { url, kind: youtubeId(url) ? 'youtube' : 'link' }
}

/** @param {string} exerciseName */
export function youtubeSearchUrl(exerciseName) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} técnica`)}`
}

/** @param {string} id */
export function youtubeThumbnail(id) {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`
}

/**
 * Lo de un ejercicio: primero lo del cliente y después lo de la sala.
 * @template {{ catalog_exercise_id: string, client_id: string | null }} T
 * @param {T[]} media
 * @param {string} catalogExerciseId
 * @returns {T[]}
 */
export function mediaForExercise(media, catalogExerciseId) {
  const own = media.filter(entry => entry.catalog_exercise_id === catalogExerciseId)
  return [...own.filter(entry => entry.client_id), ...own.filter(entry => !entry.client_id)]
}

/**
 * Ejercicios con algo que ver, para marcarlos en la fila.
 * @param {{ catalog_exercise_id: string }[]} media
 * @returns {Set<string>}
 */
export function exercisesWithMedia(media) {
  return new Set(media.map(entry => entry.catalog_exercise_id))
}

/**
 * ¿Se puede enseñar la imagen de una celda? Lo de la carpeta de la sala, siempre; lo de la
 * carpeta de un cliente, solo mientras siga su consentimiento.
 * @param {string | null | undefined} imageKey
 * @param {string} coachId
 * @param {boolean} imageConsent
 */
export function attachmentImageVisible(imageKey, coachId, imageConsent) {
  if (!imageKey) return false
  return imageConsent || imageKey.startsWith(`studio-media/${coachId}/${coachId}/`)
}
