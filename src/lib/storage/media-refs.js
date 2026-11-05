// Reglas puras de dónde vive cada archivo (probadas con node --test).
//
// Las fotos privadas se guardan en el bucket privado de R2 con estas claves:
//   checkin-media/{coachId}/{clientId}/{checkinId}/{archivo}
//   chat-media/{coachId}/{clientId}/{archivo}
//   studio-media/{coachId}/{clientId o coachId}/{archivo}  (con el coachId, es de toda la sala)
// y las fotos de perfil, en el bucket público: avatars/{userId}/{archivo}.
//
// En la base de datos:
//   checkin_media: bucket = 'r2' y path = clave completa («checkin-media/…»).
//                  Las filas antiguas tienen bucket = 'checkin-media' y la ruta de Supabase.
//   messages.attachment_url: 'r2:' + clave. Sin prefijo, es una ruta de Supabase (chat-media).
//   profiles.avatar_url: URL pública completa.

export const R2_BUCKET_MARKER = 'r2'
export const R2_REF_PREFIX = 'r2:'

/** Carpetas privadas de R2 y su bucket de Supabase equivalente */
export const PRIVATE_AREAS = /** @type {const} */ (['checkin-media', 'chat-media', 'studio-media'])
export const AVATARS_AREA = 'avatars'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE_RE = /^[A-Za-z0-9._-]{1,120}$/

/** @param {unknown} value */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Nombre de archivo seguro para una clave: sin tildes, rutas ni espacios.
 * @param {string} name
 */
export function sanitizeFileName(name) {
  const clean = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(-80)
  return clean || 'archivo'
}

/** «IMG_0042.HEIC» → «IMG_0042.webp» @param {string} name @param {string} ext */
export function withExtension(name, ext) {
  const base = String(name || '').replace(/\.[^./]+$/, '') || 'foto'
  return `${base}.${ext}`
}

/**
 * Comprueba una clave privada de R2 y devuelve sus partes, o null si no es válida.
 * Solo se aceptan claves con la forma exacta de las que crea la app, para que nadie
 * pueda pedir «../» ni carpetas de otro coach con una ruta inventada.
 *
 * @param {string} key
 * @returns {{ area: 'checkin-media' | 'chat-media' | 'studio-media', coachId: string, clientId: string, checkinId: string | null, fileName: string } | null}
 */
export function parsePrivateKey(key) {
  if (typeof key !== 'string') return null
  const parts = key.split('/')
  const [area, coachId, clientId] = parts
  if (!isUuid(coachId) || !isUuid(clientId)) return null
  if (area === 'checkin-media' && parts.length === 5) {
    const [, , , checkinId, fileName] = parts
    if (!isUuid(checkinId) || !FILE_RE.test(fileName) || fileName.startsWith('.')) return null
    return { area, coachId, clientId, checkinId, fileName }
  }
  if ((area === 'chat-media' || area === 'studio-media') && parts.length === 4) {
    const fileName = parts[3]
    if (!FILE_RE.test(fileName) || fileName.startsWith('.')) return null
    return { area, coachId, clientId, checkinId: null, fileName }
  }
  return null
}

/**
 * @param {{ coachId: string, clientId: string, checkinId: string, fileName: string }} p
 */
export function checkinKey({ coachId, clientId, checkinId, fileName }) {
  return `checkin-media/${coachId}/${clientId}/${checkinId}/${fileName}`
}

/** @param {{ coachId: string, clientId: string, fileName: string }} p */
export function chatKey({ coachId, clientId, fileName }) {
  return `chat-media/${coachId}/${clientId}/${fileName}`
}

/** @param {{ coachId: string, folderId: string, fileName: string }} p */
export function studioKey({ coachId, folderId, fileName }) {
  return `studio-media/${coachId}/${folderId}/${fileName}`
}

/** @param {{ userId: string, fileName: string }} p */
export function avatarKey({ userId, fileName }) {
  return `${AVATARS_AREA}/${userId}/${fileName}`
}

/**
 * Clave de R2 de un adjunto del chat, o null si sigue en Supabase.
 * @param {string | null | undefined} attachmentUrl
 */
export function chatAttachmentR2Key(attachmentUrl) {
  if (typeof attachmentUrl !== 'string' || !attachmentUrl.startsWith(R2_REF_PREFIX)) return null
  return attachmentUrl.slice(R2_REF_PREFIX.length)
}

/**
 * Clave de R2 de una foto de check-in a partir de su `path`, o null si sigue en Supabase.
 * Las rutas antiguas empiezan por el uuid del coach, nunca por «checkin-media/».
 * @param {string | null | undefined} path
 */
export function checkinPathR2Key(path) {
  return typeof path === 'string' && path.startsWith('checkin-media/') ? path : null
}

/**
 * ¿El adjunto pertenece a esta conversación? Acepta rutas de Supabase y de R2.
 * @param {string} attachmentUrl
 * @param {string} coachId
 * @param {string} clientId
 */
export function isChatAttachmentOf(attachmentUrl, coachId, clientId) {
  const key = chatAttachmentR2Key(attachmentUrl)
  if (key) {
    const parsed = parsePrivateKey(key)
    return !!parsed && parsed.area === 'chat-media' && parsed.coachId === coachId && parsed.clientId === clientId
  }
  return typeof attachmentUrl === 'string'
    && attachmentUrl.startsWith(`${coachId}/${clientId}/`)
    && !attachmentUrl.includes('..')
}

/** URL de la app que sirve un archivo privado de R2 tras comprobar permisos. @param {string} key */
export function privateMediaUrl(key) {
  return `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Clave dentro del bucket público a partir de una URL pública de avatar, o null.
 * @param {string | null | undefined} url
 * @param {string | null | undefined} publicBaseUrl
 */
export function avatarKeyFromPublicUrl(url, publicBaseUrl) {
  if (!url || !publicBaseUrl) return null
  const base = publicBaseUrl.replace(/\/+$/, '') + '/'
  if (!url.startsWith(base)) return null
  const key = url.slice(base.length).split('?')[0]
  return key.startsWith(`${AVATARS_AREA}/`) ? key : null
}
