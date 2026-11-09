// Reglas puras de las notas de voz y los audios del chat (probadas con node --test).
//
// Las notas se graban, si el navegador sabe, en AAC dentro de MP4, que se oye en
// cualquier móvil. Si no (Firefox, Chrome en algunos Android), en WebM u Ogg con Opus.
// Después el servidor convierte todo audio del chat a M4A (AAC) con ffmpeg.

/** Por orden de preferencia. «audio/mp4» a secas puede ser Opus en Chrome: va detrás de WebM. */
export const VOICE_MIME_CANDIDATES = /** @type {const} */ ([
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
])

/**
 * Primer formato de grabación que admite el navegador, o '' para dejar que elija él.
 * @param {(type: string) => boolean} isTypeSupported
 */
export function pickVoiceMimeType(isTypeSupported) {
  for (const type of VOICE_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      // Algunos navegadores lanzan con tipos que no conocen
    }
  }
  return ''
}

/** @param {string} mime */
export function voiceNoteExtension(mime) {
  const type = String(mime || '').toLowerCase()
  if (type.includes('mp4') || type.includes('aac') || type.includes('m4a')) return 'm4a'
  if (type.includes('ogg')) return 'ogg'
  return 'webm'
}

/** @param {Date} [date] */
export function voiceNoteFileName(mime, date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `nota-de-voz-${stamp}.${voiceNoteExtension(mime)}`
}

const AUDIO_EXTENSIONS = /\.(m4a|mp4a|aac|mp3|wav|wave|ogg|oga|opus|webm|weba|flac|amr|3gp|caf|aif|aiff)$/i

/**
 * ¿Es un audio? Por el tipo o, si el navegador no lo da, por la extensión.
 * @param {string} mime
 * @param {string} fileName
 */
export function isAudioFile(mime, fileName) {
  const type = String(mime || '').toLowerCase()
  if (type.startsWith('audio/')) return true
  if (type && type !== 'application/octet-stream') return false
  return AUDIO_EXTENSIONS.test(String(fileName || ''))
}

/**
 * Contenedor de un audio por sus primeros bytes, o null si no se reconoce.
 * Una nota de voz de WebM sin su primer byte (0x1A) ya no se reconoce: está dañada.
 * @param {Uint8Array} bytes
 * @returns {'webm' | 'mp4' | 'ogg' | 'mp3' | 'wav' | 'flac' | 'amr' | 'caf' | null}
 */
export function sniffAudioContainer(bytes) {
  if (!bytes || bytes.length < 4) return null
  const at = (offset, ...values) => values.every((value, index) => bytes[offset + index] === value)
  const ascii = (offset, text) => at(offset, ...Array.from(text, (char) => char.charCodeAt(0)))
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'webm'
  if (bytes.length >= 8 && ascii(4, 'ftyp')) return 'mp4'
  if (ascii(0, 'OggS')) return 'ogg'
  if (ascii(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3'
  if (bytes.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav'
  if (ascii(0, 'fLaC')) return 'flac'
  if (ascii(0, '#!AMR')) return 'amr'
  if (ascii(0, 'caff')) return 'caf'
  return null
}

export const DAMAGED_RECORDING_MESSAGE = 'La grabación ha salido dañada. Vuelve a grabarla.'

/**
 * Problema de una grabación recién hecha, antes de subirla, o null si parece buena.
 * Solo mira el principio: sin cabecera reconocible ningún reproductor la abre.
 * @param {Uint8Array} head primeros bytes de la grabación
 */
export function voiceRecordingProblem(head) {
  return sniffAudioContainer(head) ? null : DAMAGED_RECORDING_MESSAGE
}
