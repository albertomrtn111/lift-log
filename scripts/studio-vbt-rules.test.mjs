import assert from 'node:assert/strict'
import test from 'node:test'
import {
    formatVelocity,
    kmhFromMs,
    loadVelocityProfile,
    msFromKmh,
    percentOfRm,
    profilePoints,
    repsToFailure,
    repsToFailureText,
    rirEstimate,
    vbtEstimate,
    vbtSummary,
    velocityAtRm,
    velocityText,
} from '../src/lib/studio/vbt-rules.js'

const squat = { a: 0, b: -62.893, c: 121.962, velocity_type: 'mpv', source: 'Centro' }
const bulgarian = { a: 0, b: -115.1, c: 127.6, velocity_type: 'mv', source: 'Liao' }
const deadlift = { a: 19.472, b: -99.908, c: 124.452, velocity_type: 'mpv', source: 'Morán-Navarro' }
const bench = { a: 11.74, b: -82.96, c: 115.6, velocity_type: 'mpv', source: 'Martínez-Cava' }

test('el %RM sale de la ecuación, también con la parte cuadrática', () => {
    assert.ok(Math.abs(percentOfRm(squat, 0.62) - 82.968) < 0.01)
    assert.ok(Math.abs(percentOfRm(bulgarian, '0,5') - 70.05) < 0.01)
    assert.ok(Math.abs(percentOfRm(deadlift, 0.5) - 79.366) < 0.01)
    assert.equal(percentOfRm(squat, 0.05), null, 'por encima del 110 % no vale')
    assert.equal(percentOfRm(squat, 2.5), null, 'por debajo de cero no vale')
    assert.equal(percentOfRm(null, 0.6), null)
})

test('con carga y velocidad se estima el RM del día', () => {
    assert.deepEqual(vbtEstimate(squat, 80, 0.62), { pct: 83, rm: 96.4 })
    assert.deepEqual(vbtEstimate(squat, '80', '0,62'), { pct: 83, rm: 96.4 })
    assert.deepEqual(vbtEstimate(squat, 80, 0.05), { pct: null, rm: null })
    assert.equal(vbtEstimate(squat, '', 0.62), null)
    assert.equal(vbtEstimate(squat, 80, ''), null)
    assert.equal(vbtEstimate(null, 80, 0.62), null)
})

test('repeticiones al fallo y RIR estimado', () => {
    assert.equal(repsToFailure(83), 7)
    assert.equal(repsToFailure(100), 1)
    assert.equal(repsToFailure(105), 1)
    assert.equal(repsToFailure(0), null)
    assert.equal(repsToFailureText(83), '≈ 7 rep. al fallo')
    assert.equal(repsToFailureText(50), 'más de 15 rep. al fallo')
    assert.equal(rirEstimate(83, '5'), 2)
    assert.equal(rirEstimate(83, '5-6'), 2)
    assert.equal(rirEstimate(83, 9), 0, 'nunca negativo')
    assert.equal(rirEstimate(50, 5), null, 'por debajo del 60 % no se estima')
    assert.equal(rirEstimate(83, ''), null)
})

test('la velocidad del RM es donde la ecuación da el 100 %', () => {
    assert.ok(Math.abs(velocityAtRm(squat) - 21.962 / 62.893) < 0.0001)
    assert.ok(Math.abs(percentOfRm(bench, velocityAtRm(bench)) - 100) < 0.01)
    assert.equal(velocityAtRm({ a: 0, b: 0, c: 50 }), null)
})

test('el perfil usa la mejor velocidad de cada carga', () => {
    const points = profilePoints([
        { loadKg: '60', velocityMs: '0,95' },
        { load_kg: 60, velocity_ms: 1.0 },
        { loadKg: 80, velocityMs: 0.75 },
        { loadKg: 100, velocityMs: 0.5 },
        { loadKg: 110, velocityMs: '' },
    ])
    assert.deepEqual(points, [[1, 60], [0.75, 80], [0.5, 100]])
})

test('perfil carga-velocidad del día', () => {
    const profile = loadVelocityProfile(squat, [[1, 60], [0.75, 80], [0.5, 100]])
    assert.ok(Math.abs(profile.m + 80) < 1e-9)
    assert.ok(Math.abs(profile.l0 - 140) < 1e-9)
    assert.ok(Math.abs(profile.v0 - 1.75) < 1e-9)
    assert.ok(Math.abs(profile.r2 - 1) < 1e-9)
    assert.equal(profile.rm, 112.1)

    const two = loadVelocityProfile(squat, [[1, 60], [0.5, 100]])
    assert.equal(two.r2, null, 'con dos cargas no hay R²')
    assert.equal(two.rm, 112.1)

    assert.equal(loadVelocityProfile(squat, [[1, 60]]), null)
    assert.equal(loadVelocityProfile(squat, [[0.5, 60], [1, 100]]), null, 'más carga y más velocidad no es un perfil')
    assert.equal(loadVelocityProfile(null, [[1, 60], [0.5, 100]]).rm, null, 'sin ecuación no hay RM')
    // Un RM muy por debajo de lo que ya ha movido no se da.
    assert.equal(loadVelocityProfile(squat, [[0.30, 60], [0.25, 100]]).rm, null)
})

test('textos de velocidad', () => {
    assert.equal(formatVelocity(0.6), '0,60')
    assert.equal(formatVelocity(''), '')
    assert.equal(velocityText(0.62, squat), '0,62 m/s VMP')
    assert.equal(velocityText(0.62, bulgarian), '0,62 m/s VM')
    assert.equal(velocityText(3.5, null), '3,50 m/s')
    assert.equal(vbtSummary(squat, 80, 0.62), '0,62 m/s VMP (83 % RM · RM estimado 96,4 kg)')
    assert.equal(vbtSummary(squat, null, 0.62), '0,62 m/s VMP')
    assert.equal(vbtSummary(squat, 80, null), '')
})

test('conversor m/s y km/h', () => {
    assert.ok(Math.abs(kmhFromMs(5) - 18) < 1e-9)
    assert.ok(Math.abs(msFromKmh(18) - 5) < 1e-9)
})
