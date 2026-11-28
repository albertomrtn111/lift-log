import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    accessLinkPlan,
    canLinkInvitedClient,
    emailIlikePattern,
    initialPasswordPlan,
    isAlreadyRegisteredMessage,
    isConfirmedAccount,
    normalizeEmail,
    pickAccountForEmail,
    throwawayPassword,
} from '../src/lib/onboarding/account-access-rules.js'

const NEW = null
const UNCONFIRMED = { id: 'u-1', email: 'ana@example.com', email_confirmed_at: null }
const CONFIRMED = { id: 'u-2', email: 'ana@example.com', email_confirmed_at: '2026-11-20T10:00:00Z' }

test('normalizeEmail quita espacios y mayúsculas', () => {
    assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com')
    assert.equal(normalizeEmail('   '), null)
    assert.equal(normalizeEmail(null), null)
    assert.equal(normalizeEmail(undefined), null)
})

test('emailIlikePattern escapa los comodines', () => {
    assert.equal(emailIlikePattern('a_b%c\\d@x.com'), 'a\\_b\\%c\\\\d@x.com')
    assert.equal(emailIlikePattern('ana@example.com'), 'ana@example.com')
})

test('isAlreadyRegisteredMessage reconoce las respuestas de Supabase', () => {
    assert.ok(isAlreadyRegisteredMessage('A user with this email address has already been registered'))
    assert.ok(isAlreadyRegisteredMessage('Email address already exists'))
    assert.ok(!isAlreadyRegisteredMessage('Password should be at least 6 characters'))
    assert.ok(!isAlreadyRegisteredMessage(null))
})

test('pickAccountForEmail solo acepta la cuenta con ese mismo email en Auth', () => {
    const other = { id: 'u-9', email: 'otra@example.com', email_confirmed_at: null }
    assert.equal(pickAccountForEmail([other, UNCONFIRMED], ' ANA@example.com'), UNCONFIRMED)
    // un perfil con el email cambiado no cuenta si la cuenta de Auth tiene otro
    assert.equal(pickAccountForEmail([other], 'ana@example.com'), null)
    assert.equal(pickAccountForEmail([], 'ana@example.com'), null)
    assert.equal(pickAccountForEmail([UNCONFIRMED], ''), null)
})

test('isConfirmedAccount mira email_confirmed_at', () => {
    assert.equal(isConfirmedAccount(CONFIRMED), true)
    assert.equal(isConfirmedAccount(UNCONFIRMED), false)
    assert.equal(isConfirmedAccount(NEW), false)
})

test('enlace de acceso: invitación, contraseña aleatoria antes de invitar o enlace mágico', () => {
    assert.equal(accessLinkPlan(NEW), 'invite')
    // cuenta que existe sin confirmar (registro propio a medias o invitación sin abrir)
    assert.equal(accessLinkPlan(UNCONFIRMED), 'reset_then_invite')
    assert.equal(accessLinkPlan(CONFIRMED), 'magic_link')
})

test('alta con contraseña: una cuenta sin confirmar se queda con la del coach; una confirmada no se toca', () => {
    assert.equal(initialPasswordPlan(UNCONFIRMED), 'set_password_and_confirm')
    assert.equal(initialPasswordPlan(CONFIRMED), 'keep_existing')
    assert.equal(initialPasswordPlan(NEW), 'keep_existing')
})

const client = (overrides = {}) => ({ id: 'c-1', auth_user_id: null, user_id: null, status: 'active', is_sample: false, ...overrides })

test('la ficha invitada se enlaza con la cuenta sin confirmar del enlace', () => {
    assert.equal(canLinkInvitedClient({ accountId: 'u-1', accountConfirmed: false, client: client(), otherActiveClients: 0 }), true)
    assert.equal(
        canLinkInvitedClient({ accountId: 'u-1', accountConfirmed: false, client: client({ user_id: 'u-1' }), otherActiveClients: 0 }),
        true,
    )
})

test('la ficha invitada no se enlaza con una cuenta confirmada: lo hace el atleta al entrar', () => {
    assert.equal(canLinkInvitedClient({ accountId: 'u-2', accountConfirmed: true, client: client(), otherActiveClients: 0 }), false)
})

test('no se toca una ficha ya enlazada ni la de ejemplo, ni sin cuenta', () => {
    const base = { accountId: 'u-1', accountConfirmed: false, otherActiveClients: 0 }
    assert.equal(canLinkInvitedClient({ ...base, client: client({ auth_user_id: 'u-1' }) }), false)
    assert.equal(canLinkInvitedClient({ ...base, client: client({ auth_user_id: 'u-7' }) }), false)
    assert.equal(canLinkInvitedClient({ ...base, client: client({ user_id: 'u-7' }) }), false)
    assert.equal(canLinkInvitedClient({ ...base, client: client({ is_sample: true }) }), false)
    assert.equal(canLinkInvitedClient({ ...base, accountId: null, client: client() }), false)
})

test('no deja la cuenta con dos fichas activas', () => {
    const base = { accountId: 'u-1', accountConfirmed: false, otherActiveClients: 1 }
    assert.equal(canLinkInvitedClient({ ...base, client: client() }), false)
    // una ficha de baja no cuenta para get-user-context
    assert.equal(canLinkInvitedClient({ ...base, client: client({ status: 'inactive' }) }), true)
})

test('throwawayPassword cumple las políticas de contraseña y no se repite', () => {
    const first = throwawayPassword(randomBytes(32))
    const second = throwawayPassword(randomBytes(32))
    assert.notEqual(first, second)
    assert.ok(first.length >= 32 && first.length <= 72)
    assert.match(first, /[a-z]/)
    assert.match(first, /[A-Z]/)
    assert.match(first, /[0-9]/)
    assert.match(first, /[^A-Za-z0-9]/)
    assert.equal(throwawayPassword(new Uint8Array(200)).length <= 72, true)
    assert.throws(() => throwawayPassword(new Uint8Array(8)))
})

// La migración no se puede ejecutar aquí: se comprueba lo esencial de su texto
const migration = readFileSync(new URL('../supabase/migrations/20261120131000_link_client_on_email_confirmed.sql', import.meta.url), 'utf8')
const sql = migration.replace(/--[^\n]*/g, '')

function functionBody(name) {
    const start = sql.indexOf(`function public.${name}(`)
    assert.notEqual(start, -1, `falta ${name}`)
    const open = sql.indexOf('$$', start)
    const close = sql.indexOf('$$', open + 2)
    return sql.slice(open + 2, close)
}

test('migración: al crear la cuenta solo se enlaza si ya viene confirmada', () => {
    const body = functionBody('handle_new_auth_user')
    assert.match(body, /insert into public\.profiles/)
    assert.match(body, /if new\.email_confirmed_at is not null then\s+begin\s+perform public\.link_clients_to_confirmed_user\(new\.id\)/)
    assert.doesNotMatch(body, /update public\.clients/)
    assert.doesNotMatch(functionBody('link_client_on_profile_insert'), /update public\.clients/)
})

test('migración: el enlace exige email confirmado y no pisa fichas enlazadas', () => {
    const body = functionBody('link_clients_to_confirmed_user')
    assert.match(body, /from auth\.users u\s+where u\.id = p_user_id\s+and u\.email_confirmed_at is not null/)
    assert.match(body, /c\.auth_user_id is null\s+or not exists \(select 1 from auth\.users o where o\.id = c\.auth_user_id\)/)
    assert.match(body, /c\.user_id is null or c\.user_id = p_user_id/)
    assert.match(body, /v_active_linked \+ v_active_new <= 1/)
    assert.match(sql, /revoke execute on function public\.link_clients_to_confirmed_user\(uuid\) from public, anon, authenticated, service_role/)
})

test('migración: el disparador nuevo salta solo cuando se confirma el email', () => {
    assert.match(
        sql,
        /create trigger on_auth_user_email_confirmed\s+after update of email_confirmed_at on auth\.users\s+for each row\s+when \(old\.email_confirmed_at is null and new\.email_confirmed_at is not null\)\s+execute function public\.handle_auth_user_email_confirmed\(\)/,
    )
    assert.doesNotMatch(sql, /\b(drop table|delete from|truncate)\b/i)
})

test('buildAccessLink cambia la contraseña de una cuenta sin confirmar antes de invitarla', () => {
    const source = readFileSync(new URL('../src/lib/onboarding/athlete-invite.ts', import.meta.url), 'utf8')
    const start = source.indexOf('export async function buildAccessLink(')
    const end = source.indexOf('export async function buildAthleteAccessLink(')
    assert.ok(start !== -1 && end > start)
    const body = source.slice(start, end)
    const lookup = body.indexOf('findAuthAccountByEmail(')
    const reset = body.indexOf("plan === 'reset_then_invite'")
    const invite = body.indexOf("type: 'invite'")
    assert.ok(lookup !== -1 && reset > lookup && invite > reset, 'busca la cuenta, cambia la contraseña y luego invita')
    assert.match(body.slice(reset, invite), /replaceWithThrowawayPassword\(admin, existing\.id\)/)
})
