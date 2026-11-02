/**
 * Fotos de perfil de los atletas en el panel del coach. Lógica pura
 * (testeada en scripts/); la consulta está en athlete-avatars-data.ts.
 *
 * @typedef {{ id: string, auth_user_id?: string | null, user_id?: string | null }} AthleteAvatarSource
 * @typedef {{ id: string, avatar_url: string | null }} ProfileAvatarRow
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
 * Solo enseñamos fotos del bucket público `avatars` de nuestro Supabase. El
 * atleta escribe `profiles.avatar_url` él mismo, y una URL de fuera haría que
 * el navegador del coach pidiera una imagen a un servidor ajeno.
 * @param {string | null | undefined} url
 * @param {string | null | undefined} supabaseUrl
 * @returns {boolean}
 */
export function isAvatarBucketUrl(url, supabaseUrl) {
    if (!url || !supabaseUrl) return false
    const prefix = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/avatars/`
    return url.startsWith(prefix) && url.length > prefix.length
}

/**
 * Foto de cada atleta, por id de atleta (`clients.id`). Los que no tienen
 * cuenta, foto o una URL válida no aparecen, y se pintan con iniciales.
 * @param {AthleteAvatarSource[]} clients
 * @param {ProfileAvatarRow[]} profiles
 * @param {string | null | undefined} supabaseUrl
 * @returns {Map<string, string>}
 */
export function avatarUrlsByClient(clients, profiles, supabaseUrl) {
    /** @type {Map<string, string>} */
    const byProfile = new Map()
    for (const profile of profiles) {
        if (isAvatarBucketUrl(profile.avatar_url, supabaseUrl)) {
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
