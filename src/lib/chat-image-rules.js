// Reglas puras para preparar las fotos del chat antes de subirlas (probadas
// con node --test). El trabajo con canvas está en chat-image.ts.

/**
 * Lado mayor de las fotos guardadas (chat y check-ins): nítidas en pantalla y de
 * unos cientos de KB. El servidor las guarda en WebP con este mismo límite.
 */
export const MEDIA_IMAGE_MAX_SIDE = 1600
export const MEDIA_WEBP_QUALITY = 80
/** Lado mayor de las fotos de perfil */
export const AVATAR_MAX_SIDE = 512

export const CHAT_IMAGE_MAX_SIDE = MEDIA_IMAGE_MAX_SIDE
/** JPEG intermedio del navegador: algo más alto porque el servidor vuelve a comprimir */
export const CHAT_IMAGE_QUALITY = 0.88

/**
 * @param {string} mime
 * @param {string} name
 */
export function isHeic(mime, name) {
  return /^image\/hei[cf]/i.test(mime) || /\.(heic|heif)$/i.test(name)
}

const RAW_EXTENSIONS = /\.(dng|raw|cr2|cr3|nef|arw|orf|rw2|raf|srw|pef)$/i

/**
 * Fotos RAW de cámara: Apple ProRAW (.dng) y las de las réflex. Pesan 25-75 MB y
 * ni los navegadores ni el servidor las muestran.
 *
 * @param {string} mime
 * @param {string} name
 */
export function isRawPhoto(mime, name) {
  return /^image\/(x-)?(adobe-)?(dng|raw)|^image\/x-(canon|nikon|sony|panasonic|olympus|fuji)/i.test(mime)
    || RAW_EXTENSIONS.test(name)
}

/**
 * Formatos que cualquier navegador muestra tal cual.
 * @param {string} mime
 */
export function isWebDisplayable(mime) {
  return /^image\/(jpeg|png|webp|gif|avif)$/i.test(String(mime).split(';')[0].trim())
}

/**
 * Fotos que se intentan recomprimir: cualquier imagen salvo GIF (animación) y SVG,
 * que se envían tal cual. Incluye HEIC, RAW (DNG del iPhone con ProRAW) y TIFF.
 * Algunos navegadores entregan HEIC o DNG sin tipo, por eso se mira también el nombre.
 *
 * @param {string} mime
 * @param {string} name
 */
export function shouldPrepareImage(mime, name) {
  if (/^image\/(gif|svg)/i.test(mime)) return false
  if (/^image\//i.test(mime)) return true
  return isHeic(mime, name) || isRawPhoto(mime, name)
    || (!mime && /\.(jpe?g|png|webp|bmp|tiff?|avif)$/i.test(name))
}

/**
 * Tipos que piden los selectores de fotos. Sin «image/*», el selector del iPhone
 * convierte a JPEG las fotos HEIC y ProRAW en vez de entregar el DNG original.
 */
export const PHOTO_INPUT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'

/** Máximo que acepta el servidor para una foto (ya reducida en el móvil suele ser < 1 MB) */
export const PHOTO_MAX_BYTES = 25 * 1024 * 1024

/**
 * Motivo por el que una foto, ya preparada en el navegador, no se puede subir;
 * null si se puede. El mismo texto lo devuelve el servidor (415/413).
 *
 * @param {string} mime
 * @param {string} name
 * @param {number} size
 * @returns {string | null}
 */
export function photoUploadProblem(mime, name, size) {
  if (isRawPhoto(mime, name)) {
    return 'Esta foto está en formato RAW (DNG) y no se puede subir. En el iPhone, desactiva ProRAW en Ajustes › Cámara › Formatos, o elige otra foto.'
  }
  if (!isWebDisplayable(mime)) {
    return isHeic(mime, name)
      ? 'Esta foto está en formato HEIC y este navegador no puede convertirla. Prueba desde Safari o elige otra foto.'
      : 'Este formato de imagen no se puede usar. Elige una foto JPG o PNG.'
  }
  if (size > PHOTO_MAX_BYTES) {
    return `La foto pesa ${(size / 1024 / 1024).toFixed(0)} MB y el máximo es ${PHOTO_MAX_BYTES / 1024 / 1024} MB. Elige otra foto.`
  }
  return null
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
