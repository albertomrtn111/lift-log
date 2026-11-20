import assert from 'node:assert/strict'
import test from 'node:test'

import {
    athleteLimitErrorMessage,
    athleteLimitMessage,
    athleteSeatMessage,
    isAthleteLimitError,
    isMemberLimitError,
    limitFromError,
    memberLimitErrorMessage,
    memberLimitMessage,
} from '../src/lib/subscription/plan-limits.js'

// Así llega el error de la base (disparador de clients) a supabase-js
const athleteLimit = {
    code: 'P0001',
    message: 'Has llegado al límite de atletas activos de tu plan (20).',
    details: '20',
    hint: 'athlete_limit',
}
const memberLimit = {
    code: 'P0001',
    message: 'Este espacio ha llegado al límite de miembros del equipo de su plan (1).',
    details: '1',
    hint: 'member_limit',
}
const inactive = {
    code: 'P0001',
    message: 'La suscripción de este espacio no está activa: no se pueden dar de alta ni reactivar atletas.',
    details: null,
    hint: 'subscription_inactive',
}

test('reconoce cada rechazo por su pista', () => {
    assert.equal(isAthleteLimitError(athleteLimit), true)
    assert.equal(isAthleteLimitError(memberLimit), false)
    assert.equal(isMemberLimitError(memberLimit), true)
    assert.equal(isAthleteLimitError(null), false)
    assert.equal(isAthleteLimitError({ code: 'P0001', message: 'otra cosa' }), false)
})

test('lee el límite del detalle solo si es un número', () => {
    assert.equal(limitFromError(athleteLimit), 20)
    assert.equal(limitFromError({ details: ' 250 ' }), 250)
    assert.equal(limitFromError({ details: 'Key (id)=(x) already exists' }), null)
    assert.equal(limitFromError({ details: '' }), null)
    assert.equal(limitFromError(undefined), null)
})

test('el atleta 21 de un Starter: mensaje claro al darlo de alta', () => {
    assert.equal(
        athleteLimitErrorMessage(athleteLimit, 'create'),
        'Has llegado al límite de atletas activos de tu plan (20). Para dar de alta a otro, da de baja a alguno o amplía tu plan.',
    )
})

test('al reactivar se explica por qué no se puede', () => {
    assert.equal(
        athleteLimitErrorMessage(athleteLimit, 'reactivate'),
        'No se puede reactivar: has llegado al límite de atletas activos de tu plan (20). Da de baja a otro atleta o amplía tu plan.',
    )
})

test('suscripción no activa: lo dice en lugar de hablar de un límite de 0', () => {
    assert.equal(athleteLimitErrorMessage(inactive, 'create'), 'Tu suscripción no está activa, así que ahora no puedes dar de alta atletas.')
    assert.equal(athleteLimitErrorMessage(inactive, 'reactivate'), 'Tu suscripción no está activa, así que ahora no puedes reactivar atletas.')
    assert.match(memberLimitErrorMessage(inactive, 'join'), /no está activa/)
})

test('sin límite en el detalle, el mensaje sigue siendo claro', () => {
    assert.equal(
        athleteLimitMessage(null, 'create'),
        'Has llegado al límite de atletas activos de tu plan. Para dar de alta a otro, da de baja a alguno o amplía tu plan.',
    )
})

test('otros errores no se convierten en mensajes de límite', () => {
    assert.equal(athleteLimitErrorMessage({ code: '23505', message: 'duplicate key' }, 'create'), null)
    assert.equal(athleteLimitErrorMessage(null, 'create'), null)
    assert.equal(memberLimitErrorMessage(athleteLimit, 'join'), null)
})

test('miembros: quien invita y quien acepta ven su propio mensaje', () => {
    assert.equal(
        memberLimitMessage(1, 'invite'),
        'Tu plan admite 1 miembro en el equipo y ya están todas las plazas ocupadas, contando las invitaciones pendientes. Quita a alguien o cancela una invitación para invitar a otra persona.',
    )
    assert.match(memberLimitMessage(5, 'invite'), /^Tu plan admite 5 miembros en el equipo/)
    assert.equal(
        memberLimitErrorMessage(memberLimit, 'join'),
        'Este espacio ha llegado al límite de miembros del equipo de su plan (1). Pide a quien te invitó que libere una plaza y vuelve a intentarlo.',
    )
})

test('comprobación previa al reactivar', () => {
    assert.equal(athleteSeatMessage(null, 'reactivate'), null)
    assert.equal(athleteSeatMessage({ limit: null, active: 400, live: true }, 'reactivate'), null)
    assert.equal(athleteSeatMessage({ limit: 20, active: 19, live: true }, 'reactivate'), null)
    assert.match(athleteSeatMessage({ limit: 20, active: 20, live: true }, 'reactivate'), /\(20\)/)
    assert.match(athleteSeatMessage({ limit: 0, active: 0, live: false }, 'reactivate'), /no está activa/)
})
