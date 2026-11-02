import assert from 'node:assert/strict'
import test from 'node:test'

import { athleteProfileIds, avatarUrlsByClient, isAvatarBucketUrl } from '../src/lib/athlete-avatars.js'

const supabaseUrl = 'https://abc.supabase.co'
const bucketUrl = (userId) => `${supabaseUrl}/storage/v1/object/public/avatars/${userId}/avatar.jpg?t=1`

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

test('solo vale una foto del bucket avatars de nuestro Supabase', () => {
    assert.equal(isAvatarBucketUrl(bucketUrl('u1'), supabaseUrl), true)
    assert.equal(isAvatarBucketUrl(bucketUrl('u1'), `${supabaseUrl}/`), true)
    assert.equal(isAvatarBucketUrl('https://evil.example/pixel.png', supabaseUrl), false)
    assert.equal(isAvatarBucketUrl(`${supabaseUrl}/storage/v1/object/public/checkin-media/u1/a.jpg`, supabaseUrl), false)
    assert.equal(isAvatarBucketUrl(`${supabaseUrl}.evil.example/storage/v1/object/public/avatars/u1.jpg`, supabaseUrl), false)
    assert.equal(isAvatarBucketUrl(`${supabaseUrl}/storage/v1/object/public/avatars/`, supabaseUrl), false)
    assert.equal(isAvatarBucketUrl(null, supabaseUrl), false)
    assert.equal(isAvatarBucketUrl(bucketUrl('u1'), undefined), false)
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
        { id: 'u1', avatar_url: bucketUrl('u1') },
        { id: 'u-legacy', avatar_url: bucketUrl('u-legacy') },
        { id: 'u3', avatar_url: bucketUrl('u3') },
        { id: 'u-old', avatar_url: bucketUrl('u-old') },
        { id: 'u5', avatar_url: 'https://evil.example/pixel.png' },
    ]
    const avatars = avatarUrlsByClient(clients, profiles, supabaseUrl)
    assert.deepEqual(Object.fromEntries(avatars), {
        c1: bucketUrl('u1'),
        c2: bucketUrl('u-legacy'),
        c3: bucketUrl('u3'),
    })
})
