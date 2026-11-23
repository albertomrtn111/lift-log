import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    createInviteToken,
    INVITE_LINK_MS,
    INVITE_PATH,
    inviteOutcome,
    inviteUrl,
    readInviteToken,
} from '../src/lib/auth/invite-tokens.js'

const SECRET = 'clave-de-prueba'
const ID = '3f2b8c1e-5a4d-4c7b-9e1f-0a1b2c3d4e5f'
const NOW = Date.UTC(2026, 10, 23, 10, 0, 0)

test('el enlace vale 7 días: al día siguiente sigue sirviendo (NXT-145)', () => {
    const token = createInviteToken({ kind: 'athlete', id: ID, expiresAt: NOW + INVITE_LINK_MS }, SECRET)
    const nextDay = readInviteToken(token, SECRET, NOW + 24 * 60 * 60 * 1000)
    assert.equal(nextDay.ok, true)
    assert.deepEqual(nextDay.ok && nextDay.payload, { kind: 'athlete', id: ID, expiresAt: NOW + INVITE_LINK_MS })
    assert.equal(readInviteToken(token, SECRET, NOW + 6.9 * 24 * 60 * 60 * 1000).ok, true)
})

test('pasados 7 días, caduca', () => {
    const token = createInviteToken({ kind: 'team', id: ID, expiresAt: NOW + INVITE_LINK_MS }, SECRET)
    assert.deepEqual(readInviteToken(token, SECRET, NOW + INVITE_LINK_MS + 1000), { ok: false, reason: 'expired' })
})

test('no sirve con otra clave ni tocando el contenido', () => {
    const token = createInviteToken({ kind: 'athlete', id: ID, expiresAt: NOW + INVITE_LINK_MS }, SECRET)
    assert.deepEqual(readInviteToken(token, 'otra-clave', NOW), { ok: false, reason: 'invalid' })

    const [, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ k: 'a', i: ID, x: Math.floor((NOW + 365 * 86400000) / 1000) })).toString('base64url')
    assert.deepEqual(readInviteToken(`${forged}.${signature}`, SECRET, NOW), { ok: false, reason: 'invalid' })
    assert.deepEqual(readInviteToken(`${token}x`, SECRET, NOW), { ok: false, reason: 'invalid' })
})

test('tokens rotos o vacíos', () => {
    for (const value of ['', 'abc', 'a.b.c', '.', null, undefined, 42]) {
        assert.deepEqual(readInviteToken(/** @type {any} */ (value), SECRET, NOW), { ok: false, reason: 'invalid' })
    }
    assert.deepEqual(readInviteToken('x.y', '', NOW), { ok: false, reason: 'invalid' })
})

test('el token no lleva el email ni datos personales', () => {
    const token = createInviteToken({ kind: 'athlete', id: ID, expiresAt: NOW + INVITE_LINK_MS }, SECRET)
    const body = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
    assert.deepEqual(Object.keys(body).sort(), ['i', 'k', 'x'])
    assert.ok(!token.includes('@'))
})

test('solo firma ids válidos y tipos conocidos', () => {
    assert.throws(() => createInviteToken({ kind: 'athlete', id: 'no-es-un-id', expiresAt: NOW }, SECRET))
    assert.throws(() => createInviteToken({ kind: /** @type {any} */ ('otro'), id: ID, expiresAt: NOW }, SECRET))
    assert.throws(() => createInviteToken({ kind: 'athlete', id: ID, expiresAt: NOW }, ''))
})

test('URL del email', () => {
    assert.equal(INVITE_PATH, '/auth/invitacion')
    assert.equal(inviteUrl('https://nexttrain.ascenttech.cloud/', 'abc.def'), 'https://nexttrain.ascenttech.cloud/auth/invitacion/abc.def')
})

test('atleta: da acceso hasta que crea su contraseña; luego, al login', () => {
    const athlete = { status: 'active', is_sample: false, email: 'ana@example.com', passwordSet: false }
    assert.equal(inviteOutcome({ kind: 'athlete', athlete }), 'access')
    assert.equal(inviteOutcome({ kind: 'athlete', athlete: { ...athlete, passwordSet: true } }), 'login')
    assert.equal(inviteOutcome({ kind: 'athlete', athlete: { ...athlete, status: 'inactive' } }), 'gone')
    assert.equal(inviteOutcome({ kind: 'athlete', athlete: { ...athlete, is_sample: true } }), 'gone')
    assert.equal(inviteOutcome({ kind: 'athlete', athlete: { ...athlete, email: null } }), 'gone')
    assert.equal(inviteOutcome({ kind: 'athlete', athlete: null }), 'gone')
})

test('equipo: solo mientras la invitación está pendiente', () => {
    assert.equal(inviteOutcome({ kind: 'team', team: { state: 'pending', email: 'eva@example.com' } }), 'access')
    assert.equal(inviteOutcome({ kind: 'team', team: { state: 'accepted', email: 'eva@example.com' } }), 'login')
    assert.equal(inviteOutcome({ kind: 'team', team: { state: 'expired', email: 'eva@example.com' } }), 'gone')
    assert.equal(inviteOutcome({ kind: 'team', team: { state: 'revoked', email: 'eva@example.com' } }), 'gone')
    assert.equal(inviteOutcome({ kind: 'team', team: null }), 'gone')
})

test('los emails de invitación llevan la página propia, no el enlace de Supabase', () => {
    const athlete = readFileSync(new URL('../src/lib/onboarding/athlete-invite.ts', import.meta.url), 'utf8')
    const team = readFileSync(new URL('../src/lib/team/send-invitation.ts', import.meta.url), 'utf8')
    assert.match(athlete, /accessUrl = buildInvitePageUrl\('athlete', client\.id\)/)
    assert.doesNotMatch(athlete, /accessUrl = access\.url/)
    assert.match(team, /const url = buildInvitePageUrl\('team', params\.invitationId\)/)
})

test('la página no genera el acceso al abrirse: solo al pulsar el botón', () => {
    const page = readFileSync(new URL('../app/auth/invitacion/[token]/page.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(page, /openInviteAction|buildAccessLink|generateLink/)
})

test('recuperar la contraseña también marca la cuenta del atleta como creada', () => {
    const page = readFileSync(new URL('../app/(auth)/set-password/page.tsx', import.meta.url), 'utf8')
    assert.match(page, /\n\s+await markAthleteSignedUpAction\(\)/)
    assert.doesNotMatch(page, /if \(!isReset\) await markAthleteSignedUpAction/)
})
