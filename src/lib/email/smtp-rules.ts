/**
 * Reglas del correo propio de un espacio (SMTP del coach) y de por dónde sale
 * cada email. Sin dependencias para poder probarlas con node --test.
 */

// ---------------------------------------------------------------------------
// Puertos y TLS
// ---------------------------------------------------------------------------

/** Puertos de envío de correo que se aceptan. */
export const ALLOWED_SMTP_PORTS = [465, 587, 2525, 25]

export function isAllowedSmtpPort(port: unknown): boolean {
    return typeof port === 'number' && ALLOWED_SMTP_PORTS.includes(port)
}

/** TLS obligatorio: el 465 cifra desde el principio; el resto tiene que pasar a STARTTLS. */
export function smtpTlsOptions(port: number): { secure: boolean; requireTLS: boolean } {
    return port === 465 ? { secure: true, requireTLS: false } : { secure: false, requireTLS: true }
}

// ---------------------------------------------------------------------------
// Direcciones IP
// ---------------------------------------------------------------------------

const IPV4_PART = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4_RE = new RegExp(`^${IPV4_PART}\\.${IPV4_PART}\\.${IPV4_PART}\\.${IPV4_PART}$`)

export function parseIPv4(value: string): number[] | null {
    if (!IPV4_RE.test(value)) return null
    return value.split('.').map(Number)
}

/** Ocho grupos de 16 bits, o null si no es una IPv6 válida (sin zona: fe80::1%eth0 no vale). */
export function parseIPv6(value: string): number[] | null {
    if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return null

    let body = value.toLowerCase()
    let tail: number[] = []
    const lastColon = body.lastIndexOf(':')
    const last = body.slice(lastColon + 1)
    if (last.includes('.')) {
        const v4 = parseIPv4(last)
        if (!v4) return null
        tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
        body = body.slice(0, lastColon + 1)
        if (!body.endsWith('::')) body = body.slice(0, -1)
    }

    const halves = body.split('::')
    if (halves.length > 2) return null
    const groups = (part: string) => (part === '' ? [] : part.split(':').map(g => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)))
    const head = groups(halves[0])
    const rest = halves.length === 2 ? groups(halves[1]) : []
    if ([...head, ...rest].some(Number.isNaN)) return null

    const total = head.length + rest.length + tail.length
    if (halves.length === 2) {
        if (total > 7) return null
        return [...head, ...new Array(8 - total).fill(0), ...rest, ...tail]
    }
    return total === 8 ? [...head, ...tail] : null
}

function isPublicIPv4([a, b, c]: number[]): boolean {
    if (a === 0 || a === 10 || a === 127) return false // «esta red», privada, loopback
    if (a === 100 && b >= 64 && b <= 127) return false // 100.64/10, NAT de operador
    if (a === 169 && b === 254) return false // enlace local
    if (a === 172 && b >= 16 && b <= 31) return false // 172.16/12
    if (a === 192 && b === 168) return false // 192.168/16
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false // 192.0.0/24, 192.0.2/24
    if (a === 198 && (b === 18 || b === 19)) return false // 198.18/15, pruebas de red
    if (a === 198 && b === 51 && c === 100) return false // documentación
    if (a === 203 && b === 0 && c === 113) return false // documentación
    if (a >= 224) return false // multicast, reservadas y difusión
    return true
}

function embeddedIPv4(g: number[], from: number): number[] {
    return [g[from] >> 8, g[from] & 0xff, g[from + 1] >> 8, g[from + 1] & 0xff]
}

function isPublicIPv6(g: number[]): boolean {
    // ::/96 (incluye :: y ::1) y ::ffff:0:0/96: la IPv4 que llevan dentro
    if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0 || g[5] === 0xffff)) {
        return isPublicIPv4(embeddedIPv4(g, 6))
    }
    // 64:ff9b::/96, traducción a IPv4
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) {
        return isPublicIPv4(embeddedIPv4(g, 6))
    }
    // 2002::/16 (6to4): la IPv4 va en los grupos 1 y 2
    if (g[0] === 0x2002) return isPublicIPv4(embeddedIPv4(g, 1))
    // Solo unicast global (2000::/3). Fuera quedan fc00::/7, fe80::/10, ff00::/8, etc.
    if ((g[0] & 0xe000) !== 0x2000) return false
    if (g[0] === 0x2001 && g[1] === 0x0db8) return false // documentación
    if (g[0] === 0x2001 && g[1] === 0x0000) return false // Teredo
    return true
}

/** true si la IP es pública; false si es privada, interna, reservada o no es una IP. */
export function isPublicAddress(address: string): boolean {
    const v4 = parseIPv4(address)
    if (v4) return isPublicIPv4(v4)
    const v6 = parseIPv6(address)
    if (v6) return isPublicIPv6(v6)
    return false
}

// ---------------------------------------------------------------------------
// Servidor SMTP
// ---------------------------------------------------------------------------

/** Dominios que solo existen dentro de una red. */
const INTERNAL_SUFFIXES = ['localhost', 'localdomain', 'local', 'internal', 'intranet', 'lan', 'home.arpa']

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type SmtpHostReason = 'empty' | 'invalid' | 'internal'

export type SmtpHostCheck =
    | { ok: true; host: string; ip: string | null }
    | { ok: false; reason: SmtpHostReason }

/**
 * Normaliza el servidor escrito y rechaza lo que no sea un nombre público:
 * IPs privadas, localhost, nombres de una sola palabra (como los de los
 * contenedores) y dominios internos. Falta comprobar a qué IP resuelve.
 */
export function parseSmtpHost(raw: unknown): SmtpHostCheck {
    let host = String(raw ?? '').trim().toLowerCase()
    if (host.endsWith('.')) host = host.slice(0, -1)
    if (!host) return { ok: false, reason: 'empty' }

    const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
    if (parseIPv4(literal) || parseIPv6(literal)) {
        return isPublicAddress(literal) ? { ok: true, host: literal, ip: literal } : { ok: false, reason: 'internal' }
    }

    if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return { ok: false, reason: 'invalid' }
    const labels = host.split('.')
    if (labels.some(label => !LABEL_RE.test(label))) return { ok: false, reason: 'invalid' }
    if (labels.length < 2) return { ok: false, reason: 'internal' }
    // Un final solo con cifras es una IP escrita de otra forma (127.1, 0177.0.0.1)
    if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, reason: 'invalid' }
    if (INTERNAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
        return { ok: false, reason: 'internal' }
    }
    return { ok: true, host, ip: null }
}

export type LookupFn = (host: string) => Promise<Array<{ address: string; family: number }>>

export type SmtpTarget =
    | { ok: true; host: string; address: string }
    | { ok: false; reason: SmtpHostReason | 'unresolved' }

/**
 * Resuelve el servidor y devuelve la IP a la que conectar. Si alguna de sus
 * direcciones es interna, se rechaza entero. Se conecta a esa IP (no se
 * vuelve a resolver) para que el nombre no pueda cambiar entre medias.
 */
export async function resolveSmtpTarget(raw: unknown, lookup: LookupFn): Promise<SmtpTarget> {
    const parsed = parseSmtpHost(raw)
    if (!parsed.ok) return parsed
    if (parsed.ip) return { ok: true, host: parsed.host, address: parsed.ip }

    let addresses: Array<{ address: string; family: number }>
    try {
        addresses = await lookup(parsed.host)
    } catch {
        return { ok: false, reason: 'unresolved' }
    }
    if (!addresses?.length) return { ok: false, reason: 'unresolved' }
    if (addresses.some(entry => !isPublicAddress(entry.address))) return { ok: false, reason: 'internal' }
    const chosen = addresses.find(entry => entry.family === 4) ?? addresses[0]
    return { ok: true, host: parsed.host, address: chosen.address }
}

/** Si cambia el servidor, el puerto o el usuario, la contraseña guardada no vale. */
export function smtpPasswordRequired(
    stored: { host: string; port: number; user: string } | null,
    next: { host: string; port: number; user: string },
): boolean {
    if (!stored) return true
    const host = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')
    return host(stored.host) !== host(next.host)
        || Number(stored.port) !== Number(next.port)
        || stored.user.trim() !== next.user.trim()
}

/** El SMTP del espacio solo se usa si se verificó después del último cambio. */
export function isVerifiedSmtpSettings(row: { last_verified_at?: string | null; updated_at?: string | null }): boolean {
    if (!row.last_verified_at) return false
    const verified = Date.parse(row.last_verified_at)
    if (Number.isNaN(verified)) return false
    if (!row.updated_at) return true
    const updated = Date.parse(row.updated_at)
    return !Number.isNaN(updated) && verified >= updated
}

// ---------------------------------------------------------------------------
// Por dónde sale cada email
// ---------------------------------------------------------------------------

/** Señales de un enlace de acceso de Supabase (también con & escapado en HTML). */
const ACCESS_LINK_PATTERNS = [
    /\/auth\/v1\/verify\b/i,
    /(?:^|[?&#;])(?:token_hash|access_token|refresh_token)=/i,
    /(?:^|[?&#;])type=(?:magiclink|invite|recovery|signup|email_change)\b/i,
]

export function containsAccessLink(content: string): boolean {
    return ACCESS_LINK_PATTERNS.some(pattern => pattern.test(content))
}

/**
 * Un email puede salir por el SMTP del espacio solo si no es de acceso y no
 * lleva un enlace de acceso. Lo que no se puede leer (adjuntos en flujo, etc.)
 * se trata como de acceso.
 */
export function mayUseCoachSmtp(purpose: 'access' | 'workspace', parts: unknown[]): boolean {
    if (purpose !== 'workspace') return false
    return parts.every(part => part === undefined || part === null || (typeof part === 'string' && !containsAccessLink(part)))
}
