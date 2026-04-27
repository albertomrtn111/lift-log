/**
 * Returns the canonical public base URL of the app.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_APP_URL  (set explicitly in production env vars)
 *  2. Hard-coded production domain as safe fallback
 *
 * Never returns localhost — if the env var is missing we always default to
 * the real production domain. This prevents form links from going out with
 * localhost URLs when the env var is not configured.
 */
const PRODUCTION_URL = 'https://nexttrain.ascenttech.cloud'
const LEGACY_PRODUCTION_HOST = 'nexttrain.ascenttech.com'

function normalizeAppUrl(raw: string): string {
    const withoutTrailingSlash = raw.replace(/\/$/, '')

    try {
        const url = new URL(withoutTrailingSlash)
        if (url.hostname === LEGACY_PRODUCTION_HOST) {
            url.hostname = 'nexttrain.ascenttech.cloud'
            return url.toString().replace(/\/$/, '')
        }
    } catch {
        return withoutTrailingSlash
    }

    return withoutTrailingSlash
}

export function getAppUrl(): string {
    const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()

    if (raw && raw.length > 0) {
        // Strip any trailing slash for consistency
        return normalizeAppUrl(raw)
    }

    // Hard-coded production fallback — safe to use because any valid deployment
    // should have NEXT_PUBLIC_APP_URL set; this just prevents silent localhost leaks.
    if (process.env.NODE_ENV !== 'production') {
        // In local development, warn loudly so developers know to set the var
        console.warn(
            '[getAppUrl] NEXT_PUBLIC_APP_URL is not set. ' +
            'Form links will use the production domain. ' +
            'Set NEXT_PUBLIC_APP_URL=http://localhost:3000 in .env.local for local testing.'
        )
    }

    return PRODUCTION_URL
}

/**
 * Builds the full public URL for a checkin/onboarding form.
 */
export function getFormUrl(checkinId: string): string {
    return `${getAppUrl()}/forms/${checkinId}`
}
