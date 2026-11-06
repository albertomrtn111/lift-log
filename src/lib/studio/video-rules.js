// Reglas puras de los vídeos de sala (probadas con node --test).

export const MAX_VIDEO_MB = 80
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
export const MAX_VIDEO_SECONDS = 300
/** Vídeo aligerado: 720p a 1,5 Mbps, unos 11 MB por minuto. */
export const TARGET_SHORT_SIDE = 720
export const TARGET_BITS_PER_SECOND = 1_500_000
const LIGHT_ENOUGH_BITS_PER_SECOND = 2_500_000
const MIN_FRAMES_PER_SECOND = 5

/** Por orden de preferencia: mp4 se ve en todos los navegadores. */
const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

/**
 * Tamaño aligerado: el lado corto como mucho 720, sin agrandar y en números pares.
 * @param {number} width
 * @param {number} height
 */
export function targetSize(width, height) {
  const scale = Math.min(1, TARGET_SHORT_SIDE / Math.min(width, height))
  const even = (/** @type {number} */ value) => Math.max(2, Math.round((value * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/**
 * ¿Hace falta aligerarlo? Lo pequeño y ligero se sube tal cual.
 * @param {{ size: number, seconds: number, width: number, height: number }} video
 */
export function needsCompression({ size, seconds, width, height }) {
  if (Math.min(width, height) > TARGET_SHORT_SIDE) return true
  return seconds > 0 && (size * 8) / seconds > LIGHT_ENOUGH_BITS_PER_SECOND
}

/**
 * @param {(type: string) => boolean} isSupported
 * @returns {string | null}
 */
export function recorderType(isSupported) {
  return RECORDER_TYPES.find(type => isSupported(type)) ?? null
}

/**
 * Motivo por el que un vídeo no se puede usar, o null.
 * @param {number} seconds
 */
export function durationProblem(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'No se ha podido leer este vídeo.'
  if (seconds > MAX_VIDEO_SECONDS) return `El vídeo dura más de ${MAX_VIDEO_SECONDS / 60} minutos. Recórtalo antes de subirlo.`
  return null
}

/**
 * ¿Ha salido un vídeo de verdad? Si el navegador se para, queda casi sin fotogramas y sin avisar.
 * @param {number} frames
 * @param {number} seconds
 */
export function enoughFrames(frames, seconds) {
  return frames >= Math.max(2, seconds * MIN_FRAMES_PER_SECOND)
}

/**
 * Tipo real de un vídeo por sus primeros bytes: lo que diga el navegador no basta.
 * @param {Uint8Array} bytes
 * @returns {{ mime: string, ext: string } | null}
 */
export function sniffVideo(bytes) {
  if (bytes.length < 12) return null
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'video/webm', ext: 'webm' }
  }
  const text = (/** @type {number} */ from, /** @type {number} */ to) => String.fromCharCode(...bytes.slice(from, to))
  if (text(4, 8) !== 'ftyp') return null
  return text(8, 12) === 'qt  ' ? { mime: 'video/quicktime', ext: 'mov' } : { mime: 'video/mp4', ext: 'mp4' }
}

/** «Sentadilla_búlgara-2.mp4» → «Sentadilla búlgara 2» @param {string} fileName */
export function titleFromFile(fileName) {
  const clean = String(fileName ?? '').replace(/\.[^./]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.slice(0, 120) || 'Vídeo'
}

/** @param {number | null | undefined} seconds */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return ''
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** @param {number} bytes */
export function formatSize(bytes) {
  const mb = bytes / (1024 * 1024)
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1).replace('.', ',')} MB`
}
