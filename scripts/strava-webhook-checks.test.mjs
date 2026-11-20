import assert from 'node:assert/strict'
import test from 'node:test'

import {
    classifyActivityCheck,
    classifyAuthorizationCheck,
    decideActivityDeletion,
    decideAthleteDeauthorization,
    decideSubscription,
    parseStravaSubscriptionIds,
    parseStravaWebhookEvent,
    shouldRestoreDeletedActivity,
    STRAVA_CHECK_TIMEOUT_MS,
    STRAVA_SUBSCRIPTION_LOOKUP_TIMEOUT_MS,
} from '../src/lib/strava/webhook-checks.js'

const response = (status, body = null) => ({ status, body })
const noResponse = { status: null, body: null }

test('valida la forma del aviso y normaliza los ids', () => {
    assert.deepEqual(parseStravaWebhookEvent({
        object_type: 'activity',
        object_id: 18774786691,
        aspect_type: 'create',
        owner_id: 134815,
        subscription_id: 120475,
        event_time: 1516126040,
        updates: {},
    }), {
        object_type: 'activity',
        object_id: 18774786691,
        aspect_type: 'create',
        owner_id: 134815,
        subscription_id: 120475,
        event_time: 1516126040,
        updates: {},
    })

    const athlete = parseStravaWebhookEvent({
        object_type: 'athlete',
        object_id: '134815',
        aspect_type: 'update',
        owner_id: '134815',
        subscription_id: 120475,
        updates: { authorized: 'false' },
    })
    assert.equal(athlete.object_id, 134815)
    assert.equal(athlete.owner_id, 134815)
    assert.deepEqual(athlete.updates, { authorized: 'false' })
})

test('rechaza avisos con forma o ids no válidos', () => {
    const base = { object_type: 'activity', object_id: 1, aspect_type: 'delete', owner_id: 2 }
    assert.equal(parseStravaWebhookEvent(null), null)
    assert.equal(parseStravaWebhookEvent([]), null)
    assert.equal(parseStravaWebhookEvent({ ...base, object_type: 'club' }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, aspect_type: 'merge' }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, object_id: '12/../athlete' }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, object_id: -5 }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, owner_id: 1.5 }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, owner_id: undefined }), null)
    assert.equal(parseStravaWebhookEvent({ ...base, subscription_id: 'abc' }).subscription_id, undefined)
})

test('solo se revoca si Strava rechaza el token del atleta', () => {
    const decide = (probe) => decideAthleteDeauthorization(classifyAuthorizationCheck(probe))

    // GET /athlete con un token que ya no vale
    assert.equal(decide(response(401, {
        message: 'Authorization Error',
        errors: [{ resource: 'Athlete', field: 'access_token', code: 'invalid' }],
    })), 'revoke')
    assert.equal(decide(response(401)), 'revoke')
    // Renovar con un refresh token que ya no vale
    assert.equal(decide(response(400, {
        message: 'Bad Request',
        errors: [{ resource: 'RefreshToken', field: 'refresh_token', code: 'invalid' }],
    })), 'revoke')
})

test('si el token sigue funcionando, el aviso de desconexión se ignora', () => {
    assert.equal(classifyAuthorizationCheck(response(200, { id: 134815 })), 'valid')
    assert.equal(classifyAuthorizationCheck(response(200, { access_token: 'a', refresh_token: 'r' })), 'valid')
    // Falta un permiso concreto, pero el atleta sigue autorizando la app
    assert.equal(classifyAuthorizationCheck(response(401, {
        errors: [{ resource: 'AccessToken', field: 'activity:read_permission', code: 'missing' }],
    })), 'valid')
    assert.equal(decideAthleteDeauthorization('valid'), 'ignore')
})

test('ante la duda no se revoca', () => {
    for (const probe of [
        noResponse,
        response(429, { message: 'Rate Limit Exceeded' }),
        response(500),
        response(503),
        response(403),
        response(404),
        response(400, { errors: [{ resource: 'Application', field: 'client_id', code: 'invalid' }] }),
        response(401, { errors: [{ resource: 'Application', field: 'client_secret', code: 'invalid' }] }),
        response(400, { message: 'Bad Request' }),
        undefined,
    ]) {
        assert.equal(classifyAuthorizationCheck(probe), 'unknown')
        assert.equal(decideAthleteDeauthorization(classifyAuthorizationCheck(probe)), 'ignore')
    }
})

test('una actividad solo se da por borrada si Strava responde 404', () => {
    const decide = (probe) => decideActivityDeletion(classifyActivityCheck(probe))

    assert.equal(decide(response(404, { message: 'Record Not Found' })), 'delete')
    assert.equal(classifyActivityCheck(response(200, { id: 1 })), 'exists')
    assert.equal(decide(response(200, { id: 1 })), 'ignore')

    for (const probe of [noResponse, response(401), response(403), response(429), response(500), undefined]) {
        assert.equal(classifyActivityCheck(probe), 'unknown')
        assert.equal(decide(probe), 'ignore')
    }
})

test('lee los ids de suscripción de la respuesta de Strava', () => {
    assert.deepEqual(parseStravaSubscriptionIds([{ id: 120475, callback_url: 'https://example.test/webhook' }]), [120475])
    assert.deepEqual(parseStravaSubscriptionIds([{ id: 1 }, { id: 1 }, { id: '2' }, { nope: true }, null]), [1, 2])
    assert.deepEqual(parseStravaSubscriptionIds({ id: 1 }), [])
    assert.deepEqual(parseStravaSubscriptionIds(null), [])
})

test('los avisos de otra suscripción se rechazan; si no se sabe la nuestra, se sigue', () => {
    assert.equal(decideSubscription(120475, [120475]), 'accept')
    assert.equal(decideSubscription(999, [120475]), 'reject')
    assert.equal(decideSubscription(undefined, [120475]), 'reject')
    assert.equal(decideSubscription(999, null), 'unverified')
    assert.equal(decideSubscription(undefined, []), 'unverified')
})

test('al reimportar solo se recuperan las borradas que el atleta había valorado', () => {
    assert.equal(shouldRestoreDeletedActivity({ is_deleted: true, rpe: 6 }), true)
    // «Ignorar» deja la actividad sin RPE: se respeta
    assert.equal(shouldRestoreDeletedActivity({ is_deleted: true, rpe: null }), false)
    assert.equal(shouldRestoreDeletedActivity({ is_deleted: false, rpe: 6 }), false)
    assert.equal(shouldRestoreDeletedActivity(null), false)
    assert.equal(shouldRestoreDeletedActivity(undefined), false)
})

test('las comprobaciones caben en el plazo de respuesta de Strava', () => {
    assert.ok(STRAVA_SUBSCRIPTION_LOOKUP_TIMEOUT_MS + STRAVA_CHECK_TIMEOUT_MS <= 2000)
})
