import { AVATARS_AREA } from './storage/media-refs.js'

/**
 * Fotos de perfil de los atletas en el panel del coach. Lógica pura
 * (testeada en scripts/); la consulta está en athlete-avatars-data.ts.
 *
 * @typedef {{ id: string, auth_user_id?: string | null, user_id?: string | null }} AthleteAvatarSource
 * @typedef {{ id: string, avatar_url: string | null }} ProfileAvatarRow
 * @typedef {{ r2PublicUrl?: string | null, supabaseUrl?: string | null }} AvatarOrigins
 */

/**
 * Usuarios de la cuenta del atleta, en orden de preferencia: `auth_user_id`
 * es el enlace canónico y `user_id` queda de las altas antiguas.
 * @param {AthleteAvatarSource} client
 * @returns {string[]}
 */
function accountIdsOf(client) {
    const ids = [client.auth_user_id, client.user_id].filter(id => typeof id === 'string' && id !== '')
    return Array.from(new Set(/** @type {string[]} */ (ids)))
}

/**
 * Ids de `profiles` que hay que leer para una lista de atletas. Los que aún
 * no tienen cuenta no aportan ninguno.
 * @param {AthleteAvatarSource[]} clients
 * @returns {string[]}
 */
export function athleteProfileIds(clients) {
    return Array.from(new Set(clients.flatMap(accountIdsOf)))
}

/**
 * Dónde guarda la app las fotos de perfil: el bucket público de R2
 * (`R2_PUBLIC_URL/avatars/…`) y, si R2 no está configurado, el bucket
 * `avatars` de Supabase.
 * @param {AvatarOrigins} origins
 * @returns {string[]}
 */
function avatarUrlPrefixes({ r2PublicUrl, supabaseUrl }) {
    /** @param {string | null | undefined} base */
    const trim = base => (base ?? '').trim().replace(/\/+$/, '')
    const prefixes = []
    if (trim(r2PublicUrl)) prefixes.push(`${trim(r2PublicUrl)}/${AVATARS_AREA}/`)
    if (trim(supabaseUrl)) prefixes.push(`${trim(supabaseUrl)}/storage/v1/object/public/${AVATARS_AREA}/`)
    return prefixes
}

/**
 * Solo enseñamos fotos que ha subido la app. El atleta escribe
 * `profiles.avatar_url` él mismo, y una URL de fuera haría que el navegador
 * del coach pidiera una imagen a un servidor ajeno.
 * @param {string | null | undefined} url
 * @param {AvatarOrigins} origins
 * @returns {boolean}
 */
export function isAthleteAvatarUrl(url, origins) {
    if (!url) return false
    return avatarUrlPrefixes(origins).some(prefix => url.startsWith(prefix) && url.length > prefix.length)
}

/**
 * Foto de cada atleta, por id de atleta (`clients.id`). Los que no tienen
 * cuenta, foto o una URL válida no aparecen, y se pintan con iniciales.
 * @param {AthleteAvatarSource[]} clients
 * @param {ProfileAvatarRow[]} profiles
 * @param {AvatarOrigins} origins
 * @returns {Map<string, string>}
 */
export function avatarUrlsByClient(clients, profiles, origins) {
    /** @type {Map<string, string>} */
    const byProfile = new Map()
    for (const profile of profiles) {
        if (isAthleteAvatarUrl(profile.avatar_url, origins)) {
            byProfile.set(profile.id, /** @type {string} */ (profile.avatar_url))
        }
    }

    /** @type {Map<string, string>} */
    const byClient = new Map()
    for (const client of clients) {
        const url = accountIdsOf(client).map(id => byProfile.get(id)).find(Boolean)
        if (url) byClient.set(client.id, url)
    }
    return byClient
}
