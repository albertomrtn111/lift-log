import assert from 'node:assert/strict'
import test from 'node:test'
import {
    containsAccessLink,
    isAllowedSmtpPort,
    isPublicAddress,
    isVerifiedSmtpSettings,
    mayUseCoachSmtp,
    parseIPv6,
    parseSmtpHost,
    resolveSmtpTarget,
    smtpPasswordRequired,
    smtpTlsOptions,
} from '../src/lib/email/smtp-rules.ts'

const lookupReturning = (...addresses) => async () => addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 }))

test('solo acepta puertos de envío de correo', () => {
    for (const port of [465, 587, 2525, 25]) assert.equal(isAllowedSmtpPort(port), true)
    for (const port of [0, 22, 80, 443, 5432, 6379, 8080, 65535, '465', NaN]) assert.equal(isAllowedSmtpPort(port), false)
})

test('exige TLS en todos los puertos', () => {
    assert.deepEqual(smtpTlsOptions(465), { secure: true, requireTLS: false })
    assert.deepEqual(smtpTlsOptions(587), { secure: false, requireTLS: true })
    assert.deepEqual(smtpTlsOptions(25), { secure: false, requireTLS: true })
})

test('distingue IPs públicas de internas', () => {
    for (const ip of ['8.8.8.8', '142.250.184.5', '1.1.1.1', '2a00:1450:4003:80e::200e', '::ffff:8.8.8.8']) {
        assert.equal(isPublicAddress(ip), true, ip)
    }
    for (const ip of [
        '0.0.0.0', '127.0.0.1', '127.255.255.254', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10',
        '169.254.169.254', '100.64.0.1', '100.127.255.255', '224.0.0.1', '255.255.255.255', '198.18.0.1',
        '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1',
        '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '::127.0.0.1', '64:ff9b::a00:1', '2002:c0a8:101::1',
        '2001:db8::1', 'fe80::1%eth0', 'no-es-una-ip', '',
    ]) {
        assert.equal(isPublicAddress(ip), false, ip)
    }
    // Límites de los rangos
    assert.equal(isPublicAddress('172.15.255.255'), true)
    assert.equal(isPublicAddress('172.32.0.0'), true)
    assert.equal(isPublicAddress('100.63.255.255'), true)
    assert.equal(isPublicAddress('100.128.0.0'), true)
})

test('lee IPv6 abreviadas y con IPv4 dentro', () => {
    assert.deepEqual(parseIPv6('::1'), [0, 0, 0, 0, 0, 0, 0, 1])
    assert.deepEqual(parseIPv6('::ffff:1.2.3.4'), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304])
    assert.deepEqual(parseIPv6('2001:db8::'), [0x2001, 0xdb8, 0, 0, 0, 0, 0, 0])
    assert.equal(parseIPv6('1::2::3'), null)
    assert.equal(parseIPv6('1:2:3'), null)
    assert.equal(parseIPv6('12345::1'), null)
})

test('acepta servidores públicos y los normaliza', () => {
    assert.deepEqual(parseSmtpHost(' SMTP.Gmail.com. '), { ok: true, host: 'smtp.gmail.com', ip: null })
    assert.deepEqual(parseSmtpHost('smtp.office365.com'), { ok: true, host: 'smtp.office365.com', ip: null })
    assert.deepEqual(parseSmtpHost('mail.xn--entrenador-9db.es'), { ok: true, host: 'mail.xn--entrenador-9db.es', ip: null })
    assert.deepEqual(parseSmtpHost('8.8.8.8'), { ok: true, host: '8.8.8.8', ip: '8.8.8.8' })
})

test('rechaza servidores internos o mal escritos', () => {
    assert.deepEqual(parseSmtpHost(''), { ok: false, reason: 'empty' })
    assert.deepEqual(parseSmtpHost(null), { ok: false, reason: 'empty' })
    for (const host of [
        'localhost', 'LOCALHOST.', 'mail.localhost', 'smtp', 'mailhost', 'smtp.internal', 'printer.local', 'nas.lan',
        'router.home.arpa', '127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.169.254', '0.0.0.0', '[::1]', '::1',
        'fe80::1', 'fd00::1', '2130706433', '0x7f000001',
    ]) {
        const result = parseSmtpHost(host)
        assert.equal(result.ok, false, host)
        assert.equal(result.reason, 'internal', host)
    }
    for (const host of ['127.1', '0177.0.0.1', 'smtp.gmail.com:465', 'user@smtp.gmail.com', 'smtp gmail.com', 'http://smtp.gmail.com', '-smtp.gmail.com', 'smtp..gmail.com']) {
        const result = parseSmtpHost(host)
        assert.equal(result.ok, false, host)
        assert.equal(result.reason, 'invalid', host)
    }
})

test('resuelve el servidor y rechaza los que apuntan a direcciones internas', async () => {
    assert.deepEqual(
        await resolveSmtpTarget('smtp.gmail.com', lookupReturning('2a00:1450:400c:c06::6c', '142.250.184.5')),
        { ok: true, host: 'smtp.gmail.com', address: '142.250.184.5' },
    )
    assert.deepEqual(
        await resolveSmtpTarget('smtp.v6only.example.com', lookupReturning('2a00:1450:400c:c06::6c')),
        { ok: true, host: 'smtp.v6only.example.com', address: '2a00:1450:400c:c06::6c' },
    )
    assert.deepEqual(await resolveSmtpTarget('smtp.example.com', lookupReturning('172.18.0.4')), { ok: false, reason: 'internal' })
    assert.deepEqual(await resolveSmtpTarget('smtp.example.com', lookupReturning('8.8.8.8', '127.0.0.1')), { ok: false, reason: 'internal' })
    assert.deepEqual(await resolveSmtpTarget('smtp.example.com', lookupReturning('::ffff:10.0.0.1')), { ok: false, reason: 'internal' })
    assert.deepEqual(await resolveSmtpTarget('smtp.example.com', lookupReturning()), { ok: false, reason: 'unresolved' })
    assert.deepEqual(await resolveSmtpTarget('smtp.example.com', async () => { throw new Error('ENOTFOUND') }), { ok: false, reason: 'unresolved' })
})

test('no consulta el DNS si el servidor ya es interno', async () => {
    let called = false
    const lookup = async () => { called = true; return [{ address: '8.8.8.8', family: 4 }] }
    assert.deepEqual(await resolveSmtpTarget('localhost', lookup), { ok: false, reason: 'internal' })
    assert.deepEqual(await resolveSmtpTarget('10.0.0.1', lookup), { ok: false, reason: 'internal' })
    assert.deepEqual(await resolveSmtpTarget('8.8.8.8', lookup), { ok: true, host: '8.8.8.8', address: '8.8.8.8' })
    assert.equal(called, false)
})

test('pide otra vez la contraseña si cambia el servidor, el puerto o el usuario', () => {
    const stored = { host: 'smtp.gmail.com', port: 465, user: 'coach@gmail.com' }
    assert.equal(smtpPasswordRequired(stored, { host: 'SMTP.gmail.com', port: 465, user: 'coach@gmail.com' }), false)
    assert.equal(smtpPasswordRequired(stored, { host: 'smtp.otro.com', port: 465, user: 'coach@gmail.com' }), true)
    assert.equal(smtpPasswordRequired(stored, { host: 'smtp.gmail.com', port: 587, user: 'coach@gmail.com' }), true)
    assert.equal(smtpPasswordRequired(stored, { host: 'smtp.gmail.com', port: 465, user: 'otro@gmail.com' }), true)
    assert.equal(smtpPasswordRequired(null, { host: 'smtp.gmail.com', port: 465, user: 'coach@gmail.com' }), true)
})

test('solo usa el SMTP del espacio si se verificó después del último cambio', () => {
    assert.equal(isVerifiedSmtpSettings({ last_verified_at: null, updated_at: '2026-07-07T10:00:00+00:00' }), false)
    assert.equal(isVerifiedSmtpSettings({ last_verified_at: '2026-07-07T09:59:59+00:00', updated_at: '2026-07-07T10:00:00+00:00' }), false)
    assert.equal(isVerifiedSmtpSettings({ last_verified_at: '2026-07-07T10:00:00.000Z', updated_at: '2026-07-07T10:00:00+00:00' }), true)
    assert.equal(isVerifiedSmtpSettings({ last_verified_at: '2026-11-20T10:00:00.123456+00:00', updated_at: '2026-11-20T10:00:00.123+00:00' }), true)
    assert.equal(isVerifiedSmtpSettings({ last_verified_at: 'no es fecha', updated_at: null }), false)
})

test('reconoce los enlaces de acceso de Supabase, también dentro del HTML', () => {
    const link = 'https://abc.supabase.co/auth/v1/verify?token=pkce_123&type=magiclink&redirect_to=https://app/auth/callback'
    assert.equal(containsAccessLink(link), true)
    assert.equal(containsAccessLink(`<a href="${link.replace(/&/g, '&amp;')}">Entrar</a>`), true)
    assert.equal(containsAccessLink('https://app/auth/callback#access_token=abc&refresh_token=def'), true)
    assert.equal(containsAccessLink('https://app/auth/confirm?token_hash=abc&type=recovery'), true)
    assert.equal(containsAccessLink('https://app/x?foo=1&amp;type=invite'), true)
    assert.equal(containsAccessLink('https://nexttrain.app/forms/0d6c2c1e-6f0e-4a4f-9a52-3f0b1a2c3d4e'), false)
    assert.equal(containsAccessLink('https://nexttrain.app/informe/AB12CD'), false)
    assert.equal(containsAccessLink('Tu revisión semanal está lista'), false)
})

test('los emails de acceso nunca salen por el SMTP del espacio', () => {
    const review = '<a href="https://nexttrain.app/forms/123">Completar mi revisión</a>'
    const invite = '<a href="https://abc.supabase.co/auth/v1/verify?token=x&amp;type=invite">Crear mi acceso</a>'
    assert.equal(mayUseCoachSmtp('workspace', ['Tu revisión', review, undefined]), true)
    assert.equal(mayUseCoachSmtp('access', ['Invitación', review]), false)
    assert.equal(mayUseCoachSmtp('workspace', ['Invitación', invite]), false)
    assert.equal(mayUseCoachSmtp('workspace', ['Asunto', Buffer.from(review)]), false)
})
