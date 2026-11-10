import assert from 'node:assert/strict'
import test from 'node:test'
import {
    analyzeMyJump,
    cleanAnalysis,
    clientCandidates,
    exerciseCandidates,
    fileDate,
    guessClient,
    guessExercise,
    myJumpCell,
    myJumpRows,
    nameKey,
    parseMyJumpName,
    readableName,
    setVelocity,
} from '../src/lib/studio/my-jump-rules.js'

/** Trayectoria de prueba: cada repetición sube con velocidad en seno, para un momento y baja. */
function trajectory(peaks, { dt = 0.01, decimalComma = false } = {}) {
    const lines = ['﻿time;x;y;vx;vy;a;v']
    let t = 0
    let y = 0
    const push = v => {
        y += v * dt
        const cells = [t, 0, y, 0, 0, 0, v].map(value => value.toFixed(4))
        lines.push((decimalComma ? cells.map(cell => cell.replace('.', ',')) : cells).join(';'))
        t += dt
    }
    for (let k = 0; k < 30; k++) push(0)
    for (const peak of peaks) {
        for (let s = 0; s <= 1; s += dt) push(peak * Math.sin(Math.PI * s))
        for (let k = 0; k < 20; k++) push(0)
        for (let s = 0; s <= 1; s += dt) push(-peak * Math.sin(Math.PI * s))
        for (let k = 0; k < 50; k++) push(0)
    }
    return lines.join('\r\n')
}

const squat = { a: 0, b: -62.893, c: 121.962, velocity_type: 'mpv' }
const bulgarian = { a: 0, b: -115.1, c: 127.6, velocity_type: 'mv' }

test('el nombre del archivo trae persona, ejercicio, repeticiones y carga', () => {
    assert.deepEqual(parseMyJumpName('Pablo_Berrogai_n__Sentadilla-8rep_60.0kg.csv'), {
        who: 'Pablo Berrogai n', exercise: 'Sentadilla', reps: 8, loadKg: 60,
    })
    assert.equal(parseMyJumpName('Ana__Hip_thrust-5rep_102,5kg.csv').loadKg, 102.5)
    assert.deepEqual(parseMyJumpName('serie suelta.csv'), { who: '', exercise: 'serie suelta', reps: null, loadKg: null })
})

test('el CSV da cada repetición con sus velocidades', () => {
    const analysis = analyzeMyJump(trajectory([0.8, 0.7, 0.6]))
    assert.equal(analysis.reps.length, 3)
    assert.equal(analysis.best, 0)
    const [first] = analysis.reps
    assert.ok(first.pv >= 0.79 && first.pv <= 0.8, `pico ${first.pv}`)
    assert.ok(first.mv > 0.5 && first.mv < 0.56, `media ${first.mv}`)
    assert.ok(Math.abs(first.rom - 51) <= 1, `recorrido ${first.rom}`)
    assert.ok(analysis.loss >= 24 && analysis.loss <= 26, `pérdida ${analysis.loss}`)
    assert.equal(analysis.mpv, first.mpv)
})

test('el CSV vale con coma decimal y sin repeticiones no hay nada', () => {
    assert.equal(analyzeMyJump(trajectory([0.8], { decimalComma: true })).reps.length, 1)
    assert.equal(analyzeMyJump('time;x;y;vx;vy;a;v\n0;0;0;0;0;0;0\n'), null)
    assert.equal(analyzeMyJump(''), null)
})

test('los rebotes pequeños no cuentan como repetición', () => {
    const lines = trajectory([0.8]).split('\r\n')
    // Un empujón de 2 cm al final.
    let y = Number(lines[lines.length - 1].split(';')[2])
    let t = Number(lines[lines.length - 1].split(';')[0])
    for (let s = 0; s <= 1; s += 0.1) {
        const v = 0.2 * Math.sin(Math.PI * s)
        y += v * 0.01
        t += 0.01
        lines.push([t, 0, y, 0, 0, 0, v].map(value => value.toFixed(4)).join(';'))
    }
    lines.push([t + 0.01, 0, y, 0, 0, 0, 0].join(';'))
    assert.equal(analyzeMyJump(lines.join('\n')).reps.length, 1)
})

test('la velocidad de la serie sigue a la ecuación', () => {
    const analysis = { mpv: 0.62, mv: 0.55 }
    assert.equal(setVelocity(squat, analysis), 0.62)
    assert.equal(setVelocity(bulgarian, analysis), 0.55)
    assert.equal(setVelocity(null, analysis), 0.62)
    assert.equal(setVelocity(squat, null), null)
})

test('lo importado llena Por series y la celda', () => {
    const rows = myJumpRows([
        { loadKg: 60, analysis: { reps: [{ mpv: 1 }, { mpv: 0.9 }], mpv: 1, mv: 0.9 } },
        { loadKg: 80, analysis: { reps: [{ mpv: 0.7 }, { mpv: 0.6 }], mpv: 0.7, mv: 0.66 } },
        { loadKg: 80, analysis: { reps: [{ mpv: 0.75 }], mpv: 0.75, mv: 0.7 } },
        { loadKg: 90, analysis: null },
    ], squat)
    assert.equal(rows.length, 3)
    assert.deepEqual(rows[0], {
        loadKg: '60', reps: '2', timeSeconds: '', rir: '', rpe: '', velocityMs: '1,00',
        repDetail: [{ mpv: 1 }, { mpv: 0.9 }], source: 'my_jump',
    })
    assert.deepEqual(myJumpCell(rows), { sets: '3', reps: '2/2/1', loadKg: '80', velocityMs: '0,75' })
    assert.deepEqual(myJumpCell(rows.slice(0, 1)), { sets: '1', reps: '2', loadKg: '60', velocityMs: '1,00' })
    assert.equal(myJumpCell([]), null)
})

const clients = [
    { id: 'p1', name: 'Pablo Berrogaín Ruiz' },
    { id: 'p2', name: 'Pablo García' },
    { id: 'a1', name: 'Ana Martínez' },
    { id: 'l1', name: 'Lucía Sanz' },
]

test('cada archivo encuentra a su cliente aunque My Jump parta las tildes', () => {
    assert.equal(guessClient('Pablo_Berrogai_n__Sentadilla-8rep_60.0kg.csv', clients).id, 'p1')
    assert.equal(guessClient('Ana_Martinez__Hip_thrust-5rep_100kg.csv', clients).id, 'a1')
    assert.equal(guessClient('Lucia__Remo-6rep_40kg.csv', clients).id, 'l1', 'solo el nombre si es único')
    assert.equal(guessClient('Pablo__Remo-6rep_40kg.csv', clients), null, 'dos Pablos: que elija')
    assert.deepEqual(clientCandidates('Pablo__Remo-6rep_40kg.csv', clients).map(entry => entry.client.id).sort(), ['p1', 'p2'])
    assert.equal(guessClient('Desconocido__Remo.csv', clients), null)
})

const entries = [
    { catalogExerciseId: 'sq', name: 'Sentadilla trasera con barra' },
    { catalogExerciseId: 'bu', name: 'Sentadilla búlgara' },
    { catalogExerciseId: 'ht', name: 'Hip thrust con barra' },
    { catalogExerciseId: 'pm', name: 'Peso muerto convencional con barra' },
    { catalogExerciseId: 'pmr', name: 'Peso muerto rumano con barra' },
    { catalogExerciseId: 'pb', name: 'Press de banca plano con barra' },
]

test('cada archivo encuentra su ejercicio', () => {
    assert.equal(guessExercise('Ana_Martinez__Hip_thrust_barra-5rep_100kg.csv', entries, 'Ana Martínez').catalogExerciseId, 'ht')
    assert.equal(guessExercise('Ana__Sentadilla_bulgara-8rep_20kg.csv', entries).catalogExerciseId, 'bu')
    assert.equal(guessExercise('Ana__RDL_barra-8rep_60kg.csv', entries).catalogExerciseId, 'pmr')
    // «Sentadilla» a secas encaja con varias: se propone, pero no se da por segura.
    assert.equal(guessExercise('Ana__Sentadilla-8rep_60kg.csv', entries), null)
    assert.ok(['sq', 'bu'].includes(exerciseCandidates('Ana__Sentadilla-8rep_60kg.csv', entries)[0].entry.catalogExerciseId))
    assert.deepEqual(exerciseCandidates('Ana__Curl-8rep_10kg.csv', entries), [])
})

test('nombres y fechas', () => {
    assert.equal(nameKey('Berrogaín-Ruiz'), 'berrogainruiz')
    assert.equal(readableName('Pablo Berrogai n'), 'Pablo Berrogain')
    assert.equal(fileDate(Date.UTC(2026, 10, 9, 23, 30)), '2026-11-10', 'la fecha es la de Madrid')
})

test('lo que llega de fuera se limpia antes de guardarlo', () => {
    const analysis = cleanAnalysis([
        { mpv: 0.81, mv: 0.7, pv: 1.4, rom: 52.4 },
        { mpv: '0.9', mv: null, pv: 'x', rom: -3 },
        { mpv: 0, mv: 0.5 },
        { mpv: 500 },
    ])
    assert.deepEqual(analysis.reps, [
        { mpv: 0.81, mv: 0.7, pv: 1.4, rom: 52 },
        { mpv: 0.9, mv: 0.9, pv: 0, rom: 0 },
    ])
    assert.equal(analysis.best, 1)
    assert.equal(analysis.mpv, 0.9)
    assert.equal(cleanAnalysis([]), null)
    assert.equal(cleanAnalysis('nada'), null)
    assert.equal(cleanAnalysis(Array.from({ length: 80 }, () => ({ mpv: 0.5 }))).reps.length, 60)
})
