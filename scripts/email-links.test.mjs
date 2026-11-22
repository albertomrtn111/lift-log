import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const {
    EMAIL_CONFIRM_PATH,
    EMAIL_TEMPLATE_LINKS,
    RESEND_COOLDOWN_SECONDS,
    buildEmailConfirmUrl,
    formatWait,
    lastSentForRetryAfter,
    normalizeEmailLinkType,
    parseEmailConfirmParams,
    resendStorageKey,
    retryAfterFromMessage,
    secondsUntilResend,
    signupRedirectUrl,
} = await import('../src/lib/auth/email-links.ts')

const SITE = 'https://nexttrain.ascenttech.cloud'
const TEMPLATES_DIR = new URL('../supabase/templates/', import.meta.url)
const readTemplate = (name) => readFileSync(new URL(`${name}.html`, TEMPLATES_DIR), 'utf8')

test('el enlace de confirmación lleva token_hash, tipo y destino', () => {
    const url = new URL(buildEmailConfirmUrl(`${SITE}/`, { tokenHash: 'abc123', type: 'recovery', next: '/set-password?mode=reset' }))
    assert.equal(url.origin, SITE)
    assert.equal(url.pathname, EMAIL_CONFIRM_PATH)
    assert.equal(url.searchParams.get('token_hash'), 'abc123')
    assert.equal(url.searchParams.get('type'), 'recovery')
    assert.equal(url.searchParams.get('next'), '/set-password?mode=reset')
})

test('la raíz no se añade como destino y uno externo se cambia por la raíz', () => {
    assert.equal(buildEmailConfirmUrl(SITE, { tokenHash: 't', type: 'email', next: '/' }), `${SITE}/auth/confirm?token_hash=t&type=email`)
    const url = new URL(buildEmailConfirmUrl(SITE, { tokenHash: 't', type: 'email', next: '//evil.com' }))
    assert.equal(url.searchParams.get('next'), '/')
})

test('parseEmailConfirmParams valida el token, el tipo y el destino', () => {
    assert.deepEqual(parseEmailConfirmParams('token_hash=abc&type=email'), { tokenHash: 'abc', type: 'email', next: '/' })
    assert.deepEqual(parseEmailConfirmParams('token_hash=abc&type=invite&next=%2Fbienvenida'), { tokenHash: 'abc', type: 'invite', next: '/bienvenida' })
    assert.equal(parseEmailConfirmParams('type=email'), null)
    assert.equal(parseEmailConfirmParams('token_hash=abc'), null)
    assert.equal(parseEmailConfirmParams('token_hash=abc&type=sms'), null)
    assert.equal(parseEmailConfirmParams('token_hash=abc&type=email&next=https%3A%2F%2Fevil.com').next, '/')
    assert.equal(parseEmailConfirmParams('token_hash=abc&type=email&next=%2F%2Fevil.com').next, '/')
    assert.equal(parseEmailConfirmParams('token_hash=abc&type=email&next=%2F%5Cevil.com').next, '/')
})

test('los tipos antiguos signup y magiclink equivalen a email', () => {
    assert.equal(normalizeEmailLinkType('signup'), 'email')
    assert.equal(normalizeEmailLinkType('magiclink'), 'email')
    assert.equal(normalizeEmailLinkType('email_change'), 'email_change')
    assert.equal(normalizeEmailLinkType(''), null)
    assert.equal(normalizeEmailLinkType('phone_change'), null)
})

test('el registro y su reenvío vuelven a /auth/callback', () => {
    assert.equal(signupRedirectUrl('https://nexttrain.ascenttech.cloud'), `${SITE}/auth/callback`)
    assert.equal(signupRedirectUrl('http://localhost:3000/'), 'http://localhost:3000/auth/callback')
})

/** Enlaces de una plantilla tal como los montará Supabase */
function templateLinks(html) {
    return [...html.matchAll(/href="([^"]+)"/g)]
        .map(match => match[1].replaceAll('&amp;', '&'))
        .map(href => href.replaceAll('{{ .SiteURL }}', SITE).replaceAll('{{ .TokenHash }}', 'f00d'))
}

for (const [name, expected] of Object.entries(EMAIL_TEMPLATE_LINKS)) {
    test(`la plantilla ${name} enlaza a /auth/confirm con verifyOtp (${expected.type} → ${expected.next})`, () => {
        const html = readTemplate(name)
        assert.ok(!html.includes('.ConfirmationURL'), 'no usa {{ .ConfirmationURL }} (PKCE: solo en el mismo navegador)')
        assert.ok(html.includes('{{ .TokenHash }}'))
        assert.match(html, /<html lang="es">/)
        const links = templateLinks(html)
        assert.ok(links.length >= 2, 'botón y enlace para copiar')
        for (const link of links) {
            const url = new URL(link)
            assert.equal(url.origin, SITE)
            assert.equal(url.pathname, EMAIL_CONFIRM_PATH)
            assert.deepEqual(parseEmailConfirmParams(url.searchParams), { tokenHash: 'f00d', type: expected.type, next: expected.next })
        }
    })
}

test('la plantilla de reautenticación solo lleva el código', () => {
    const html = readTemplate('reauthentication')
    assert.ok(html.includes('{{ .Token }}'))
    assert.equal(templateLinks(html).length, 0)
})

test('las plantillas solo usan variables de Supabase conocidas y nada de claves', () => {
    const allowed = new Set(['.SiteURL', '.TokenHash', '.Token', '.Email', '.NewEmail', '.RedirectTo', '.ConfirmationURL'])
    for (const name of [...Object.keys(EMAIL_TEMPLATE_LINKS), 'reauthentication']) {
        const html = readTemplate(name)
        for (const [, variable] of html.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)) {
            assert.ok(allowed.has(variable), `${name}: variable desconocida ${variable}`)
        }
        assert.ok(!/re_[A-Za-z0-9]{8,}|sb_secret_|eyJhbGci/.test(html), `${name}: parece llevar una clave`)
        assert.ok(html.includes('#0058D8'), `${name}: azul de la marca`)
    }
    assert.ok(readTemplate('change-email').includes('{{ .NewEmail }}'))
})

test('espera mínima entre reenvíos', () => {
    const now = 1_000_000
    assert.equal(secondsUntilResend(null, now), 0)
    assert.equal(secondsUntilResend(now, now), RESEND_COOLDOWN_SECONDS)
    assert.equal(secondsUntilResend(now - 18_500, now), 42)
    assert.equal(secondsUntilResend(now - 60_000, now), 0)
    assert.equal(secondsUntilResend(now - 120_000, now), 0)
    // Un reloj adelantado no da más de la espera máxima
    assert.equal(secondsUntilResend(now + 500_000, now), RESEND_COOLDOWN_SECONDS)
    assert.equal(secondsUntilResend(Number.NaN, now), 0)
})

test('lee los segundos que pide Supabase y los convierte en la misma cuenta atrás', () => {
    assert.equal(retryAfterFromMessage('For security purposes, you can only request this after 42 seconds.'), 42)
    assert.equal(retryAfterFromMessage('For security purposes, you can only request this after 1 second.'), 1)
    assert.equal(retryAfterFromMessage('Email rate limit exceeded'), null)
    assert.equal(retryAfterFromMessage(undefined), null)
    const now = 5_000_000
    assert.equal(secondsUntilResend(lastSentForRetryAfter(now, 42), now), 42)
    assert.equal(secondsUntilResend(lastSentForRetryAfter(now, 600), now), RESEND_COOLDOWN_SECONDS)
})

test('formatWait y la clave por email', () => {
    assert.equal(formatWait(42), '0:42')
    assert.equal(formatWait(60), '1:00')
    assert.equal(formatWait(-3), '0:00')
    assert.equal(resendStorageKey('  Ana@Example.COM '), 'auth:signup-email-sent:ana@example.com')
})
