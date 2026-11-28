// Enlaces de los correos de cuenta que manda Supabase Auth (confirmar el
// registro, recuperar la contraseña, enlace mágico, invitación, cambio de email)
// y la espera entre reenvíos. Puro, sin dependencias, para probarlo con node --test.
//
// Las plantillas de supabase/templates/ no usan {{ .ConfirmationURL }}: llevan a
// /auth/confirm?token_hash=…&type=…&next=…, que valida el enlace con verifyOtp.
// Así funciona en cualquier navegador o dispositivo (el flujo PKCE exige abrirlo
// en el mismo navegador que lo pidió) y los antivirus del correo que abren los
// enlaces antes que la persona no lo gastan: se valida al pulsar el botón.

/** Ruta propia que valida los enlaces de los correos de Supabase */
export const EMAIL_CONFIRM_PATH = '/auth/confirm'

/** Tipos que acepta verifyOtp con token_hash */
export const EMAIL_LINK_TYPES = ['email', 'recovery', 'invite', 'email_change'] as const
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number]

/** Tipos antiguos que Supabase sigue aceptando y que equivalen a «email» */
const LEGACY_EMAIL_TYPES = ['signup', 'magiclink']

/**
 * Qué hace cada plantilla de Supabase: tipo para verifyOtp y pantalla a la que
 * llega después. Las plantillas de supabase/templates/ siguen esta tabla (lo
 * comprueba scripts/email-links.test.mjs).
 */
export const EMAIL_TEMPLATE_LINKS = {
    // La raíz decide: el coach recién registrado va a /welcome a crear su espacio
    'confirm-signup': { type: 'email', next: '/' },
    'magic-link': { type: 'email', next: '/' },
    'reset-password': { type: 'recovery', next: '/set-password?mode=reset' },
    // Como las invitaciones que manda la app: bienvenida con contraseña
    'invite-user': { type: 'invite', next: '/bienvenida' },
    'change-email': { type: 'email_change', next: '/' },
} as const satisfies Record<string, { type: EmailLinkType; next: string }>

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATE_LINKS

export interface EmailConfirmParams {
    tokenHash: string
    type: EmailLinkType
    next: string
}

function isSafePath(value: string | null | undefined): value is string {
    return Boolean(value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\'))
}

export function normalizeEmailLinkType(value: string | null | undefined): EmailLinkType | null {
    if (!value) return null
    if (LEGACY_EMAIL_TYPES.includes(value)) return 'email'
    return (EMAIL_LINK_TYPES as readonly string[]).includes(value) ? (value as EmailLinkType) : null
}

/** Enlace a /auth/confirm (el mismo que montan las plantillas con {{ .SiteURL }} y {{ .TokenHash }}) */
export function buildEmailConfirmUrl(siteUrl: string, params: EmailConfirmParams): string {
    const query = new URLSearchParams({ token_hash: params.tokenHash, type: params.type })
    if (params.next && params.next !== '/') query.set('next', isSafePath(params.next) ? params.next : '/')
    return `${siteUrl.replace(/\/+$/, '')}${EMAIL_CONFIRM_PATH}?${query.toString()}`
}

/**
 * Lee los parámetros de /auth/confirm. Devuelve null si falta el token o el
 * tipo no es válido; `next` solo admite rutas internas (si no, la raíz).
 */
export function parseEmailConfirmParams(search: URLSearchParams | string): EmailConfirmParams | null {
    const params = typeof search === 'string' ? new URLSearchParams(search) : search
    const tokenHash = params.get('token_hash')?.trim()
    const type = normalizeEmailLinkType(params.get('type'))
    if (!tokenHash || !type) return null
    const next = params.get('next')
    return { tokenHash, type, next: isSafePath(next) ? next : '/' }
}

/** A dónde vuelve el enlace de confirmación del registro (y su reenvío) */
export function signupRedirectUrl(origin: string): string {
    return `${origin.replace(/\/+$/, '')}/auth/callback`
}

// ---------------------------------------------------------------------------
// Espera entre reenvíos del email de confirmación
// ---------------------------------------------------------------------------

/** Supabase no deja pedir otro email al mismo correo antes de 60 segundos */
export const RESEND_COOLDOWN_SECONDS = 60

/** Segundos que faltan para poder reenviar (0 si ya se puede) */
export function secondsUntilResend(lastSentAt: number | null | undefined, now: number, cooldownSeconds = RESEND_COOLDOWN_SECONDS): number {
    if (!lastSentAt || !Number.isFinite(lastSentAt)) return 0
    const remaining = cooldownSeconds - (now - lastSentAt) / 1000
    if (remaining <= 0) return 0
    return Math.min(cooldownSeconds, Math.ceil(remaining))
}

/** «For security purposes, you can only request this after 42 seconds.» → 42 */
export function retryAfterFromMessage(message: string | null | undefined): number | null {
    const match = message?.match(/after\s+(\d+)\s+seconds?/i)
    if (!match) return null
    const seconds = Number(match[1])
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/**
 * Hora de «último envío» equivalente a tener que esperar `retryAfter`
 * segundos, para reutilizar la misma cuenta atrás.
 */
export function lastSentForRetryAfter(now: number, retryAfterSeconds: number, cooldownSeconds = RESEND_COOLDOWN_SECONDS): number {
    const wait = Math.min(Math.max(retryAfterSeconds, 0), cooldownSeconds)
    return now - (cooldownSeconds - wait) * 1000
}

/** «0:42» */
export function formatWait(seconds: number): string {
    const safe = Math.max(0, Math.ceil(seconds))
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/** Clave del navegador donde se recuerda el último reenvío a ese email */
export function resendStorageKey(email: string): string {
    return `auth:signup-email-sent:${email.trim().toLowerCase()}`
}
