import assert from 'node:assert/strict'
import test from 'node:test'

import { athleteProfileIds, avatarUrlsByClient, isAthleteAvatarUrl } from '../src/lib/athlete-avatars.js'

const r2PublicUrl = 'https://pub-123.r2.dev'
const supabaseUrl = 'https://abc.supabase.co'
const origins = { r2PublicUrl, supabaseUrl }
const r2Url = (userId) => `${r2PublicUrl}/avatars/${userId}/avatar-1793614386725.webp`
const supabaseAvatarUrl = (userId) => `${supabaseUrl}/storage/v1/object/public/avatars/${userId}/avatar.jpg?t=1`

test('los ids de perfil salen de auth_user_id y user_id, sin repetir y sin atletas sin cuenta', () => {
    const ids = athleteProfileIds([
        { id: 'c1', auth_user_id: 'u1', user_id: 'u1' },
        { id: 'c2', auth_user_id: null, user_id: 'u2' },
        { id: 'c3', auth_user_id: null, user_id: null },
        { id: 'c4', auth_user_id: 'u4', user_id: 'u-legacy' },
        { id: 'c5', auth_user_id: 'u1' },
    ])
    assert.deepEqual(ids, ['u1', 'u2', 'u4', 'u-legacy'])
})

test('vale una foto del bucket público de R2, que es donde se suben ahora', () => {
    assert.equal(isAthleteAvatarUrl(r2Url('u1'), origins), true)
    assert.equal(isAthleteAvatarUrl(r2Url('u1'), { r2PublicUrl: ` ${r2PublicUrl}/ ` }), true)
    assert.equal(isAthleteAvatarUrl(`${r2PublicUrl}/checkin-media/u1/a.webp`, origins), false)
    assert.equal(isAthleteAvatarUrl(`${r2PublicUrl}/avatars/`, origins), false)
    assert.equal(isAthleteAvatarUrl(`${r2PublicUrl}.evil.example/avatars/u1.webp`, origins), false)
    assert.equal(isAthleteAvatarUrl(r2Url('u1'), { supabaseUrl }), false)
})

test('vale una foto del bucket avatars de Supabase, donde se suben si R2 no está configurado', () => {
    assert.equal(isAthleteAvatarUrl(supabaseAvatarUrl('u1'), origins), true)
    assert.equal(isAthleteAvatarUrl(supabaseAvatarUrl('u1'), { supabaseUrl: `${supabaseUrl}/` }), true)
    assert.equal(isAthleteAvatarUrl(`${supabaseUrl}/storage/v1/object/public/checkin-media/u1/a.jpg`, origins), false)
    assert.equal(isAthleteAvatarUrl(`${supabaseUrl}.evil.example/storage/v1/object/public/avatars/u1.jpg`, origins), false)
})

test('no vale una URL de fuera ni una vacía', () => {
    assert.equal(isAthleteAvatarUrl('https://evil.example/pixel.png', origins), false)
    assert.equal(isAthleteAvatarUrl(null, origins), false)
    assert.equal(isAthleteAvatarUrl(r2Url('u1'), {}), false)
})

test('la foto se asigna por atleta, prefiriendo la cuenta de auth_user_id', () => {
    const clients = [
        { id: 'c1', auth_user_id: 'u1', user_id: null },
        { id: 'c2', auth_user_id: 'u2', user_id: 'u-legacy' },
        { id: 'c3', auth_user_id: 'u3', user_id: 'u-old' },
        { id: 'c4', auth_user_id: null, user_id: null },
        { id: 'c5', auth_user_id: 'u5', user_id: null },
    ]
    const profiles = [
        { id: 'u1', avatar_url: r2Url('u1') },
        { id: 'u-legacy', avatar_url: supabaseAvatarUrl('u-legacy') },
        { id: 'u3', avatar_url: r2Url('u3') },
        { id: 'u-old', avatar_url: r2Url('u-old') },
        { id: 'u5', avatar_url: 'https://evil.example/pixel.png' },
    ]
    const avatars = avatarUrlsByClient(clients, profiles, origins)
    assert.deepEqual(Object.fromEntries(avatars), {
        c1: r2Url('u1'),
        c2: supabaseAvatarUrl('u-legacy'),
        c3: r2Url('u3'),
    })
})
