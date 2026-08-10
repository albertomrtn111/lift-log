export const REQUIRED_STRAVA_ACTIVITY_SCOPE = 'activity:read_all'

export const STRAVA_ACTIVITY_PERMISSION_ERROR =
    'Strava no ha concedido acceso a tus actividades. Reconecta la cuenta y acepta todos los permisos.'

export function parseStravaScopes(value) {
    if (!value) return []

    const scopes = Array.isArray(value) ? value : String(value).split(/[\s,]+/)
    return [...new Set(scopes.map((scope) => String(scope).trim()).filter(Boolean))]
}

export function hasRequiredStravaActivityScope(value) {
    return parseStravaScopes(value).includes(REQUIRED_STRAVA_ACTIVITY_SCOPE)
}
