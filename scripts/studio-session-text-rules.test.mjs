import assert from 'node:assert/strict'
import test from 'node:test'
import { blockItems, blockOptions, sessionText, toggleNarrow } from '../src/lib/studio/session-text-rules.js'

const item = (name, extra = {}) => ({
    type: 'item',
    item: { exercise_name: name, sets: null, reps: null, time_seconds: null, load_kg: null, rir: null, rpe: null, tags: [], circuit: [], note: null, ...extra },
})

test('el resumen de la sesión se puede pegar en un mensaje', () => {
    const text = sessionText({
        spaceName: 'ClubØ',
        personName: 'Ana Martínez',
        session: { name: 'Fuerza', session_date: '2026-11-10', rpe: 7, duration_min: 60 },
        entries: [
            item('Movilidad de cadera', { time_seconds: 60, sets: 2 }),
            { type: 'section', section: { title: 'Bloque A', parent_title: 'Fuerza' } },
            item('Sentadilla trasera con barra', { sets: 3, reps: '5', load_kg: '80.00', velocity_ms: 0.62, tags: ['barra'], note: 'Bien de técnica' }),
            item('Hip thrust con barra', { sets: 3, reps: '8' }),
        ],
    })
    assert.equal(text, [
        'ClubØ · Ana Martínez',
        'Fuerza · 10 nov',
        '',
        'Esfuerzo percibido (RPE): 7/10 · Muy duro · 60 min',
        '',
        '1. Movilidad de cadera — 2×60 s',
        '',
        'FUERZA',
        '',
        'Bloque A:',
        '2. Sentadilla trasera con barra (barra) — 3×5 · 80 kg · 0,62 m/s',
        '   Bien de técnica',
        '3. Hip thrust con barra — 3×8',
    ].join('\n'))
})

test('sin RPE ni espacio, solo lo que hay', () => {
    const text = sessionText({ personName: 'Luis', session: { name: null, session_date: '2026-11-10' }, entries: [item('Plancha')] })
    assert.equal(text, 'Luis\nSesión · 10 nov\n\n1. Plancha')
})

const blocks = [
    { key: 'fuerza', name: 'Fuerza', displayName: 'FUERZA', defaultSets: 3, defaultReps: '8', isHidden: false },
    { key: 'oculto', name: 'Oculto', displayName: null, defaultSets: null, defaultReps: null, isHidden: true },
    { key: 'vacio', name: 'Vacío', displayName: null, defaultSets: null, defaultReps: null, isHidden: false },
]
const entries = [
    { catalogExerciseId: 'b', name: 'Banca', blockKey: 'fuerza', sortOrder: 2, defaultSets: 4, defaultReps: null, isHidden: false },
    { catalogExerciseId: 'a', name: 'Sentadilla', blockKey: 'fuerza', sortOrder: 1, defaultSets: null, defaultReps: '5', isHidden: false },
    { catalogExerciseId: 'h', name: 'Oculto', blockKey: 'fuerza', sortOrder: 0, isHidden: true },
    { catalogExerciseId: 'x', name: 'Otro', blockKey: 'oculto', sortOrder: 0, isHidden: false },
]

test('bloques enteros para añadir', () => {
    assert.deepEqual(blockOptions(entries, blocks), [{ key: 'fuerza', name: 'FUERZA', count: 2 }])
    assert.deepEqual(blockItems(entries, blocks, 'fuerza'), [
        { catalog_exercise_id: 'a', sets: 3, reps: '5' },
        { catalog_exercise_id: 'b', sets: 4, reps: '8' },
    ])
    assert.deepEqual(blockItems(entries, blocks, 'fuerza', new Set(['a'])).map(entry => entry.catalog_exercise_id), ['b'])
})

test('estrechar una sesión se recuerda por cliente', () => {
    let saved = toggleNarrow(null, 'ana', 's1')
    assert.deepEqual(saved, { ana: ['s1'] })
    saved = toggleNarrow(saved, 'luis', 's2')
    saved = toggleNarrow(saved, 'ana', 's1')
    assert.deepEqual(saved, { ana: [], luis: ['s2'] })
})
