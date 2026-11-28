// Decisiones del webhook de Strava. Son funciones puras (sin red ni base de
// datos) para poder probarlas con node --test; client.ts hace las llamadas.
//
// Regla general: un aviso del webhook solo desconecta a un atleta o da por
// borrada una actividad si la API de Strava lo confirma. Si la comprobación
// falla, tarda demasiado o la respuesta no es clara, no se toca nada.

// Strava espera la respuesta del webhook en unos 2 segundos.
export const STRAVA_CHECK_TIMEOUT_MS = 1200
export const STRAVA_SUBSCRIPTION_LOOKUP_TIMEOUT_MS = 800
// El id de nuestra suscripción casi nunca cambia: se pide a Strava cada 6 horas.
export const STRAVA_SUBSCRIPTION_CACHE_MS = 6 * 60 * 60 * 1000
// Si Strava no responde, se vuelve a intentar a los 5 minutos.
export const STRAVA_SUBSCRIPTION_RETRY_MS = 5 * 60 * 1000
// Si llega un aviso con otro id y el dato guardado tiene más de 10 minutos, se
// vuelve a pedir por si la suscripción se ha creado de nuevo.
export const STRAVA_SUBSCRIPTION_RECHECK_MS = 10 * 60 * 1000

/**
 * @typedef {Object} StravaWebhookEvent
 * @property {'activity' | 'athlete'} object_type
 * @property {number} object_id
 * @property {'create' | 'update' | 'delete'} aspect_type
 * @property {number} owner_id
 * @property {number} [event_time]
 * @property {number} [subscription_id]
 * @property {Record<string, string>} [updates]
 */

/**
 * Respuesta de Strava a una comprobación. `status` es null si no hubo
 * respuesta (tiempo agotado o error de red).
 * @typedef {{ status: number | null, body: unknown }} StravaProbe
 */

/** @typedef {'valid' | 'revoked' | 'unknown'} StravaAuthorizationCheck */
/** @typedef {'exists' | 'missing' | 'unknown'} StravaActivityCheck */
/** @typedef {'accept' | 'reject' | 'unverified'} StravaSubscriptionDecision */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toPositiveId(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? value : null
    }
    if (typeof value === 'string' && /^\d{1,16}$/.test(value)) {
        const parsed = Number(value)
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
    }
    return null
}

/**
 * Valida la forma del aviso y normaliza los ids a números.
 * @param {unknown} value
 * @returns {StravaWebhookEvent | null}
 */
export function parseStravaWebhookEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const raw = /** @type {Record<string, unknown>} */ (value)

    const objectType = raw.object_type
    const aspectType = raw.aspect_type
    if (objectType !== 'activity' && objectType !== 'athlete') return null
    if (aspectType !== 'create' && aspectType !== 'update' && aspectType !== 'delete') return null

    const objectId = toPositiveId(raw.object_id)
    const ownerId = toPositiveId(raw.owner_id)
    if (!objectId || !ownerId) return null

    /** @type {StravaWebhookEvent} */
    const event = {
        object_type: objectType,
        object_id: objectId,
        aspect_type: aspectType,
        owner_id: ownerId,
    }

    const subscriptionId = toPositiveId(raw.subscription_id)
    if (subscriptionId) event.subscription_id = subscriptionId
    if (typeof raw.event_time === 'number') event.event_time = raw.event_time

    if (raw.updates && typeof raw.updates === 'object' && !Array.isArray(raw.updates)) {
        /** @type {Record<string, string>} */
        const updates = {}
        for (const [key, entry] of Object.entries(raw.updates)) {
            if (entry !== null && entry !== undefined) updates[key] = String(entry)
        }
        event.updates = updates
    }

    return event
}

/**
 * @param {unknown} body
 * @returns {Array<{ resource: string, field: string, code: string }>}
 */
function stravaErrors(body) {
    const errors = body && typeof body === 'object' ? /** @type {any} */ (body).errors : null
    if (!Array.isArray(errors)) return []
    return errors
        .filter((error) => error && typeof error === 'object')
        .map((error) => ({
            resource: String(error.resource ?? '').toLowerCase(),
            field: String(error.field ?? '').toLowerCase(),
            code: String(error.code ?? '').toLowerCase(),
        }))
}

/**
 * Interpreta la respuesta de Strava al comprobar si el permiso del atleta
 * sigue valiendo (GET /athlete con su token, o renovar el token).
 * - valid: Strava acepta el token, así que el atleta sigue conectado.
 * - revoked: Strava rechaza el token del atleta.
 * - unknown: sin respuesta, error de Strava, límite de peticiones o fallo de
 *   las credenciales de la app; no dice nada del atleta.
 * @param {StravaProbe} probe
 * @returns {StravaAuthorizationCheck}
 */
export function classifyAuthorizationCheck(probe) {
    const status = probe?.status
    if (typeof status !== 'number') return 'unknown'
    if (status >= 200 && status < 300) return 'valid'

    const errors = stravaErrors(probe.body)
    if (errors.some((error) => error.resource === 'application')) return 'unknown'

    if (status === 401) {
        // Falta un permiso concreto, pero el token sigue valiendo.
        if (errors.length > 0 && errors.every((error) => error.code === 'missing')) return 'valid'
        return 'revoked'
    }

    if (status === 400) {
        const invalidRefreshToken = errors.some((error) =>
            (error.resource === 'refreshtoken' || error.field === 'refresh_token') && error.code === 'invalid'
        )
        return invalidRefreshToken ? 'revoked' : 'unknown'
    }

    return 'unknown'
}

/**
 * @param {StravaAuthorizationCheck} check
 * @returns {'revoke' | 'ignore'}
 */
export function decideAthleteDeauthorization(check) {
    return check === 'revoked' ? 'revoke' : 'ignore'
}

/**
 * Interpreta la respuesta de Strava al pedir la actividad con el token de su
 * atleta. Solo un 404 cuenta como «ya no existe».
 * @param {StravaProbe} probe
 * @returns {StravaActivityCheck}
 */
export function classifyActivityCheck(probe) {
    const status = probe?.status
    if (typeof status !== 'number') return 'unknown'
    if (status >= 200 && status < 300) return 'exists'
    if (status === 404) return 'missing'
    return 'unknown'
}

/**
 * @param {StravaActivityCheck} check
 * @returns {'delete' | 'ignore'}
 */
export function decideActivityDeletion(check) {
    return check === 'missing' ? 'delete' : 'ignore'
}

/**
 * Ids de la respuesta de GET /push_subscriptions.
 * @param {unknown} payload
 * @returns {number[]}
 */
export function parseStravaSubscriptionIds(payload) {
    if (!Array.isArray(payload)) return []
    const ids = payload
        .map((item) => toPositiveId(item && typeof item === 'object' ? item.id : null))
        .filter((id) => id !== null)
    return [...new Set(/** @type {number[]} */ (ids))]
}

/**
 * - accept: el aviso es de nuestra suscripción.
 * - reject: conocemos nuestra suscripción y el aviso trae otra (o ninguna).
 * - unverified: no se ha podido saber nuestra suscripción; se sigue con el
 *   resto de comprobaciones.
 * @param {number | undefined | null} subscriptionId
 * @param {number[] | null | undefined} ownIds
 * @returns {StravaSubscriptionDecision}
 */
export function decideSubscription(subscriptionId, ownIds) {
    if (!Array.isArray(ownIds) || ownIds.length === 0) return 'unverified'
    if (!subscriptionId) return 'reject'
    return ownIds.includes(subscriptionId) ? 'accept' : 'reject'
}

/**
 * Al volver a importar una actividad que Strava acaba de devolver (así que
 * existe), decide si hay que quitarle la marca de borrada.
 *
 * Solo se recuperan las que el atleta ya había valorado (tienen RPE): «Ignorar»
 * actúa sobre actividades pendientes, sin RPE, y esa decisión del atleta se
 * respeta. Una actividad con RPE marcada como borrada solo pudo llegar ahí por
 * un aviso de borrado.
 * @param {{ is_deleted?: boolean | null, rpe?: number | null } | null | undefined} existing
 * @returns {boolean}
 */
export function shouldRestoreDeletedActivity(existing) {
    return Boolean(existing?.is_deleted) && existing?.rpe !== null && existing?.rpe !== undefined
}
