import assert from 'node:assert/strict'
import test from 'node:test'

import {
    canChangeMember,
    canManageTeam,
    invitationState,
    isValidEmail,
    normalizeEmail,
    seatsLeft,
} from '../src/lib/team/team-rules.js'

test('solo propietario y administrador gestionan el equipo', () => {
    assert.equal(canManageTeam('owner'), true)
    assert.equal(canManageTeam('admin'), true)
    assert.equal(canManageTeam('coach'), false)
    assert.equal(canManageTeam('reception'), false)
})

test('nadie se cambia a sí mismo ni toca al propietario', () => {
    const base = { actorUserId: 'a', targetUserId: 'b' }
    assert.equal(canChangeMember({ ...base, actorRole: 'owner', targetRole: 'admin' }), true)
    assert.equal(canChangeMember({ ...base, actorRole: 'admin', targetRole: 'coach' }), true)
    assert.equal(canChangeMember({ ...base, actorRole: 'admin', targetRole: 'owner' }), false)
    assert.equal(canChangeMember({ ...base, actorRole: 'coach', targetRole: 'coach' }), false)
    assert.equal(canChangeMember({ actorRole: 'owner', actorUserId: 'a', targetRole: 'admin', targetUserId: 'a' }), false)
})

test('el email se normaliza y se valida', () => {
    assert.equal(normalizeEmail('  Ana@Club.COM '), 'ana@club.com')
    assert.equal(isValidEmail('ana@club.com'), true)
    assert.equal(isValidEmail('ana@club'), false)
    assert.equal(isValidEmail(''), false)
})

test('las plazas cuentan miembros e invitaciones pendientes', () => {
    assert.equal(seatsLeft(null, 10, 3), null)
    assert.equal(seatsLeft(5, 3, 1), 1)
    assert.equal(seatsLeft(1, 1, 0), 0)
    assert.equal(seatsLeft(2, 2, 3), 0)
})

test('una invitación pendiente caduca', () => {
    const now = new Date('2026-11-10T10:00:00Z')
    assert.equal(invitationState({ status: 'pending', expires_at: '2026-11-11T10:00:00Z' }, now), 'pending')
    assert.equal(invitationState({ status: 'pending', expires_at: '2026-11-09T10:00:00Z' }, now), 'expired')
    assert.equal(invitationState({ status: 'accepted', expires_at: '2026-11-09T10:00:00Z' }, now), 'accepted')
})
