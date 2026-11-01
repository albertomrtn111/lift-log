// Reglas puras para preparar las fotos del chat antes de subirlas (probadas
// con node --test). El trabajo con canvas está en chat-image.ts.

/** Lado mayor de las fotos enviadas: nítidas en pantalla y de pocos cientos de KB */
export const CHAT_IMAGE_MAX_SIDE = 2048
export const CHAT_IMAGE_QUALITY = 0.82

/**
 * @param {string} mime
 * @param {string} name
 */
export function isHeic(mime, name) {
  return /^image\/hei[cf]/i.test(mime) || /\.(heic|heif)$/i.test(name)
}

/**
 * Fotos que se recomprimen a JPEG. GIF (animación) y SVG se envían tal cual.
 * Algunos navegadores entregan las HEIC sin tipo, por eso se mira también el nombre.
 *
 * @param {string} mime
 * @param {string} name
 */
export function shouldPrepareImage(mime, name) {
  return isHeic(mime, name) || /^image\/(jpeg|png|webp|bmp)$/i.test(mime)
}

/**
 * Tamaño final conservando la proporción; nunca se amplía.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [maxSide]
 * @returns {{ width: number, height: number }}
 */
export function fitWithin(width, height, maxSide = CHAT_IMAGE_MAX_SIDE) {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** «IMG_0042.HEIC» → «IMG_0042.jpg» @param {string} name */
export function jpegFileName(name) {
  const base = name.replace(/\.[^./]+$/, '') || 'foto'
  return `${base}.jpg`
}
