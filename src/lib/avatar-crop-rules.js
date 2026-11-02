// Geometría del encuadre de la foto de perfil (probada con node --test). El
// componente con canvas y gestos está en components/profile/AvatarCropDialog.tsx.
//
// El círculo queda fijo en el centro de la pantalla y la foto se mueve debajo.
// Las distancias van en «diámetros del círculo» (1 = el círculo entero), así el
// encuadre no cambia si la pantalla gira o cambia de tamaño. Con zoom 1 el lado
// corto de la foto mide lo mismo que el círculo; el único límite es que el
// círculo no se salga de la foto, de modo que puede llegar hasta cualquier
// borde (la foto se descentra todo lo que haga falta).

export const AVATAR_CROP_MAX_ZOOM = 4
/** Lado mayor de la copia de trabajo: suficiente para recortar a 512 px con zoom 4 */
export const AVATAR_CROP_WORKING_SIDE = 2048

/**
 * @typedef {{ zoom: number, x: number, y: number }} CropState
 * x, y: desplazamiento del centro de la foto respecto al centro del círculo.
 */

/** @returns {CropState} */
export function initialCrop() {
  return { zoom: 1, x: 0, y: 0 }
}

/**
 * Tamaño de la foto en pantalla (en diámetros) para un zoom.
 * @param {number} width @param {number} height @param {number} zoom
 */
export function displaySize(width, height, zoom) {
  const shortSide = Math.min(width, height)
  return { width: (width / shortSide) * zoom, height: (height / shortSide) * zoom }
}

/**
 * Zoom entre 1 y el máximo, y la foto siempre cubriendo el círculo.
 * @param {CropState} state @param {number} width @param {number} height
 * @returns {CropState}
 */
export function clampCrop(state, width, height) {
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, 1, AVATAR_CROP_MAX_ZOOM)
  const size = displaySize(width, height, zoom)
  const maxX = Math.max(0, (size.width - 1) / 2)
  const maxY = Math.max(0, (size.height - 1) / 2)
  return { zoom, x: clamp(state.x, -maxX, maxX), y: clamp(state.y, -maxY, maxY) }
}

/**
 * Mueve la foto (dx, dy en diámetros).
 * @param {CropState} state @param {number} dx @param {number} dy
 * @param {number} width @param {number} height
 */
export function panCrop(state, dx, dy, width, height) {
  return clampCrop({ zoom: state.zoom, x: state.x + dx, y: state.y + dy }, width, height)
}

/**
 * Cambia el zoom dejando quieto el punto de la foto que está bajo `focus`
 * (el centro del pellizco o el puntero; en diámetros desde el centro del círculo).
 * @param {CropState} state @param {number} zoom
 * @param {{ x: number, y: number }} focus
 * @param {number} width @param {number} height
 */
export function zoomCrop(state, zoom, focus, width, height) {
  const nextZoom = clamp(zoom, 1, AVATAR_CROP_MAX_ZOOM)
  const ratio = nextZoom / state.zoom
  return clampCrop({
    zoom: nextZoom,
    x: focus.x - (focus.x - state.x) * ratio,
    y: focus.y - (focus.y - state.y) * ratio,
  }, width, height)
}

/**
 * Cuadrado de la foto (en px enteros de la imagen) que queda dentro del círculo.
 * @param {CropState} state @param {number} width @param {number} height
 * @returns {{ sx: number, sy: number, size: number }}
 */
export function cropRect(state, width, height) {
  const { zoom, x, y } = clampCrop(state, width, height)
  const shortSide = Math.min(width, height)
  const exact = shortSide / zoom
  // Px enteros: drawImage no interpola medio píxel en los bordes
  const size = Math.max(1, Math.min(shortSide, Math.round(exact)))
  return {
    sx: clamp(Math.round(width / 2 - (0.5 + x) * exact), 0, width - size),
    sy: clamp(Math.round(height / 2 - (0.5 + y) * exact), 0, height - size),
    size,
  }
}

/**
 * Lado del cuadrado resultante: el del recorte, sin pasar de `maxSide`.
 * @param {number} cropSize @param {number} maxSide
 */
export function outputSide(cropSize, maxSide) {
  return Math.max(1, Math.min(maxSide, Math.round(cropSize)))
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
