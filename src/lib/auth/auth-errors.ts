// Traduce los errores de Supabase Auth (en inglés y técnicos) a mensajes
// claros en español. Puro, sin dependencias, para poder probarlo con node --test.

export type AuthErrorKind =
    | 'invalid_credentials'
    | 'email_not_confirmed'
    | 'already_registered'
    | 'weak_password'
    | 'same_password'
    | 'invalid_email'
    | 'rate_limited'
    | 'expired_link'
    | 'network'
    | 'unknown'

const MESSAGES: Record<AuthErrorKind, string> = {
    invalid_credentials: 'El email o la contraseña no son correctos.',
    email_not_confirmed: 'Aún no has confirmado tu email. Revisa tu bandeja de entrada (y la de spam).',
    already_registered: 'Ya existe una cuenta con este email.',
    weak_password: 'La contraseña debe tener al menos 6 caracteres.',
    same_password: 'La nueva contraseña tiene que ser distinta de la anterior.',
    invalid_email: 'Ese email no parece válido.',
    rate_limited: 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
    expired_link: 'El enlace ha caducado o ya se usó. Pide uno nuevo.',
    network: 'No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.',
    unknown: 'Algo ha fallado. Inténtalo de nuevo en unos segundos.',
}

export function classifyAuthError(error: unknown): AuthErrorKind {
    const raw = typeof error === 'string'
        ? error
        : (error as { message?: string; code?: string } | null)?.message ?? ''
    const code = typeof error === 'object' && error ? String((error as { code?: string }).code ?? '') : ''
    const text = `${code} ${raw}`.toLowerCase()

    if (text.includes('invalid login credentials') || text.includes('invalid_credentials')) return 'invalid_credentials'
    if (text.includes('email not confirmed') || text.includes('email_not_confirmed')) return 'email_not_confirmed'
    if (text.includes('already registered') || text.includes('already been registered') || text.includes('user already exists') || text.includes('user_already_exists')) return 'already_registered'
    if (text.includes('same_password') || text.includes('different from the old password')) return 'same_password'
    if (text.includes('weak_password') || text.includes('password should be at least')) return 'weak_password'
    if (text.includes('invalid format') || text.includes('email_address_invalid') || text.includes('unable to validate email')) return 'invalid_email'
    if (text.includes('rate limit') || text.includes('over_email_send_rate_limit') || text.includes('for security purposes') || text.includes('too many requests')) return 'rate_limited'
    if (text.includes('otp_expired') || text.includes('expired') || text.includes('auth session missing') || text.includes('code verifier') || text.includes('invalid flow state')) return 'expired_link'
    if (text.includes('failed to fetch') || text.includes('network') || text.includes('fetch failed')) return 'network'
    return 'unknown'
}

export function authErrorMessage(error: unknown): string {
    return MESSAGES[classifyAuthError(error)]
}

/** Solo rutas internas: evita redirecciones abiertas a otros dominios */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
    return value
}
