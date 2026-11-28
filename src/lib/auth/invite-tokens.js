/**
 * Enlace propio de las invitaciones (atleta y equipo): /auth/invitacion/<token>.
 *
 * El enlace de acceso de Supabase es de un solo uso y caduca en una hora, así
 * que el email no lo lleva: lleva este token firmado, válido 7 días, y el
 * enlace de Supabase se genera al pulsar el botón de la página (NXT-145).
 *
 * El token no lleva el email ni datos personales: solo qué invitación es
 * (ficha del atleta o invitación de equipo), su id y cuándo caduca. Lo firma
 * el servidor con HMAC-SHA256; sin la clave no se puede fabricar ni cambiar.
 * Lógica pura, testeada en scripts/invite-tokens.test.mjs.
 *
 * @typedef {'athlete' | 'team'} InviteKind
 * @typedef {{ kind: InviteKind, id: string, expiresAt: number }} InviteTokenPayload
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Lo que dura el enlace del email */
export const INVITE_LINK_DAYS = 7
export const INVITE_LINK_MS = INVITE_LINK_DAYS * 24 * 60 * 60 * 1000

/** Ruta pública de la página de la invitación (el middleware no protege /auth) */
export const INVITE_PATH = '/auth/invitacion'

const KIND_CODES = { athlete: 'a', team: 't' }
const CODE_KINDS = { a: 'athlete', t: 'team' }
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** @param {string} value */
function toBase64Url(value) {
    return Buffer.from(value, 'utf8').toString('base64url')
}

/** @param {string} secret @param {string} body */
function sign(secret, body) {
    return createHmac('sha256', secret).update(`nextrain-invite-v1.${body}`).digest('base64url')
}

/**
 * @param {InviteTokenPayload} payload
 * @param {string} secret
 * @returns {string}
 */
export function createInviteToken(payload, secret) {
    if (!secret) throw new Error('Falta la clave para firmar la invitación')
    const code = KIND_CODES[payload.kind]
    if (!code) throw new Error('Tipo de invitación desconocido')
    if (!ID_PATTERN.test(payload.id)) throw new Error('Id de invitación no válido')
    const expiresAt = Math.floor(payload.expiresAt / 1000)
    if (!Number.isFinite(expiresAt)) throw new Error('Caducidad no válida')
    const body = toBase64Url(JSON.stringify({ k: code, i: payload.id.toLowerCase(), x: expiresAt }))
    return `${body}.${sign(secret, body)}`
}

/**
 * Comprueba la firma y la caducidad.
 * @param {string | null | undefined} token
 * @param {string} secret
 * @param {number} [now]
 * @returns {{ ok: true, payload: InviteTokenPayload } | { ok: false, reason: 'invalid' | 'expired' }}
 */
export function readInviteToken(token, secret, now = Date.now()) {
    if (!secret || typeof token !== 'string') return { ok: false, reason: 'invalid' }
    const parts = token.trim().split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' }
    const [body, signature] = parts

    const expected = Buffer.from(sign(secret, body))
    const received = Buffer.from(signature)
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        return { ok: false, reason: 'invalid' }
    }

    /** @type {{ k?: unknown, i?: unknown, x?: unknown }} */
    let data
    try {
        data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
        return { ok: false, reason: 'invalid' }
    }
    const kind = typeof data?.k === 'string' ? CODE_KINDS[/** @type {'a' | 't'} */ (data.k)] : undefined
    const id = typeof data?.i === 'string' && ID_PATTERN.test(data.i) ? data.i : null
    const expiresAt = typeof data?.x === 'number' && Number.isFinite(data.x) ? data.x * 1000 : null
    if (!kind || !id || expiresAt === null) return { ok: false, reason: 'invalid' }
    if (expiresAt <= now) return { ok: false, reason: 'expired' }
    return { ok: true, payload: { kind: /** @type {InviteKind} */ (kind), id, expiresAt } }
}

/**
 * URL del email: <app>/auth/invitacion/<token>
 * @param {string} appUrl
 * @param {string} token
 */
export function inviteUrl(appUrl, token) {
    return `${appUrl.replace(/\/+$/, '')}${INVITE_PATH}/${encodeURIComponent(token)}`
}

/**
 * Qué hace la página al pulsar el botón, según el estado de la invitación.
 * - atleta: si ya creó su contraseña, el enlace ya cumplió y va al login.
 * - equipo: solo mientras la invitación siga pendiente.
 *
 * @param {{
 *   kind: InviteKind
 *   athlete?: { status?: string | null, is_sample?: boolean | null, email?: string | null, passwordSet?: boolean } | null
 *   team?: { state: string, email?: string | null } | null
 * }} input
 * @returns {'access' | 'login' | 'gone'}
 */
export function inviteOutcome(input) {
    if (input.kind === 'athlete') {
        const athlete = input.athlete
        if (!athlete || athlete.status !== 'active' || athlete.is_sample || !athlete.email) return 'gone'
        return athlete.passwordSet ? 'login' : 'access'
    }
    const team = input.team
    if (!team || !team.email) return 'gone'
    if (team.state === 'accepted') return 'login'
    return team.state === 'pending' ? 'access' : 'gone'
}
