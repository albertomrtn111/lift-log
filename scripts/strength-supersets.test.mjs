import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySupersetUpdates,
  blockLetter,
  buildExerciseBlocks,
  describeSupersetFlow,
  interleaveRounds,
  planEqualizeSets,
  planLink,
  planNormalizeOrder,
  planRemoveFromBlock,
  planUnlinkBlock,
  supersetInfoById,
  supersetKind,
} from '../src/lib/training/supersets.js'

const ex = (id, fields = {}) => ({ id, exercise_name: id, sets: 3, rest_seconds: 60, superset_key: null, ...fields })

const torsoA = () => [
  ex('press', { sets: 4, rest_seconds: 150 }),
  ex('remo', { sets: 4, rest_seconds: 120 }),
  ex('curl', { sets: 4, rest_seconds: 0, superset_key: 'k7f2' }),
  ex('triceps', { sets: 3, rest_seconds: 90, superset_key: 'k7f2' }),
  ex('lateral', { sets: 3, rest_seconds: 60 }),
]

test('letras A, B, C1, C2, D y datos del bloque', () => {
  const blocks = buildExerciseBlocks(torsoA())
  assert.deepEqual(blocks.map((block) => block.members.map((member) => member.label)), [['A'], ['B'], ['C1', 'C2'], ['D']])
  const c = blocks[2]
  assert.equal(c.isSuperset, true)
  assert.equal(c.kind, 'superserie')
  assert.equal(c.rounds, 4)
  assert.equal(c.roundRestSeconds, 90)
  assert.equal(describeSupersetFlow(c), 'C1 → C2 sin descanso · 90 s tras la ronda')
})

test('camelCase del atleta también vale', () => {
  const blocks = buildExerciseBlocks([
    { id: 'a', supersetKey: 'x', sets: 3, restSeconds: 0 },
    { id: 'b', supersetKey: 'x', sets: 3, restSeconds: 75 },
  ])
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].roundRestSeconds, 75)
})

test('una clave suelta o separada se muestra como ejercicio normal', () => {
  const blocks = buildExerciseBlocks([ex('a', { superset_key: 'k' }), ex('b'), ex('c', { superset_key: 'k' })])
  assert.deepEqual(blocks.map((block) => block.isSuperset), [false, false, false])
  assert.deepEqual(blocks.map((block) => block.members[0].label), ['A', 'B', 'C'])
})

test('más de 4 seguidos con la misma clave: el quinto va aparte', () => {
  const day = ['a', 'b', 'c', 'd', 'e'].map((id) => ex(id, { superset_key: 'k' }))
  const blocks = buildExerciseBlocks(day)
  assert.equal(blocks[0].members.length, 4)
  assert.equal(blocks[0].kind, 'serie gigante')
  assert.equal(blocks[1].isSuperset, false)
})

test('nombres por tamaño y letras más allá de la Z', () => {
  assert.equal(supersetKind(2), 'superserie')
  assert.equal(supersetKind(3), 'triserie')
  assert.equal(supersetKind(4), 'serie gigante')
  assert.equal(blockLetter(0), 'A')
  assert.equal(blockLetter(25), 'Z')
  assert.equal(blockLetter(26), 'AA')
})

test('supersetInfoById da etiqueta y compañeros', () => {
  const info = supersetInfoById(torsoA())
  assert.equal(info.get('curl').label, 'C1')
  assert.deepEqual(info.get('curl').with, ['triceps'])
  assert.deepEqual(info.get('triceps').withLabels, ['C1'])
  assert.equal(info.get('press').isSuperset, false)
  assert.equal(info.get('press').label, 'A')
})

test('rondas intercaladas con series distintas', () => {
  const rounds = interleaveRounds([
    { label: 'C1', sets: [1, 2, 3, 4] },
    { label: 'C2', sets: ['a', 'b', 'c'] },
  ])
  assert.equal(rounds.length, 4)
  assert.deepEqual(rounds[0].entries.map((entry) => [entry.label, entry.set]), [['C1', 1], ['C2', 'a']])
  assert.deepEqual(rounds[3].entries.map((entry) => entry.label), ['C1'])
})

test('enlazar dos sueltos: el primero a 0 y el último con el mayor descanso', () => {
  const plan = planLink(torsoA(), 'press', 'remo', 'nueva')
  assert.equal(plan.key, 'nueva')
  assert.deepEqual(plan.updates, [
    { id: 'press', superset_key: 'nueva', rest_seconds: 0 },
    { id: 'remo', superset_key: 'nueva', rest_seconds: 150 },
  ])
})

test('enlazar un suelto con un bloque: se suma al bloque y conserva su clave', () => {
  const plan = planLink(torsoA(), 'triceps', 'lateral', 'nueva')
  assert.equal(plan.key, 'k7f2')
  const day = applySupersetUpdates(torsoA(), plan.updates)
  const blocks = buildExerciseBlocks(day)
  assert.deepEqual(blocks[2].members.map((member) => member.label), ['C1', 'C2', 'C3'])
  assert.equal(blocks[2].kind, 'triserie')
  // C2 era el último (90): pasa a 0; el nuevo último lleva los 90 de la ronda.
  assert.deepEqual(day.map((exercise) => exercise.rest_seconds), [150, 120, 0, 0, 90])
})

test('no se enlazan ejercicios que no van seguidos ni bloques de más de 4', () => {
  assert.match(planLink(torsoA(), 'press', 'curl').error, /seguidos/)
  const day = ['a', 'b', 'c', 'd'].map((id) => ex(id, { superset_key: 'k' })).concat(ex('e'))
  assert.match(planLink(day, 'd', 'e').error, /como mucho 4/)
  assert.match(planLink(torsoA(), 'curl', 'triceps').error, /misma superserie/)
})

test('separar deja a cada uno con el descanso de la ronda', () => {
  const plan = planUnlinkBlock(torsoA(), 'curl')
  assert.deepEqual(plan.updates, [
    { id: 'curl', superset_key: null, rest_seconds: 90 },
    { id: 'triceps', superset_key: null },
  ])
})

test('sacar al de en medio de una triserie lo pone detrás del bloque', () => {
  const day = [
    ex('a', { superset_key: 'k', rest_seconds: 0 }),
    ex('b', { superset_key: 'k', rest_seconds: 0 }),
    ex('c', { superset_key: 'k', rest_seconds: 120 }),
    ex('d'),
  ]
  const plan = planRemoveFromBlock(day, 'b')
  assert.deepEqual(plan.order, ['a', 'c', 'b', 'd'])
  assert.deepEqual(plan.updates, [{ id: 'b', superset_key: null, rest_seconds: 120 }])
})

test('sacar al último de una triserie pasa el descanso de la ronda al nuevo último', () => {
  const day = [
    ex('a', { superset_key: 'k', rest_seconds: 0 }),
    ex('b', { superset_key: 'k', rest_seconds: 0 }),
    ex('c', { superset_key: 'k', rest_seconds: 120 }),
  ]
  const plan = planRemoveFromBlock(day, 'c')
  assert.equal(plan.order, null)
  assert.deepEqual(plan.updates, [{ id: 'c', superset_key: null }, { id: 'b', rest_seconds: 120 }])
})

test('sacar uno de una pareja deshace la superserie', () => {
  const plan = planRemoveFromBlock(torsoA(), 'triceps')
  assert.deepEqual(plan.updates.map((update) => update.superset_key), [null, null])
})

test('reordenar: cambiar C1 por C2 mueve el descanso de la ronda al nuevo último', () => {
  const day = torsoA()
  const reordered = [day[0], day[1], day[3], day[2], day[4]]
  const { updates } = planNormalizeOrder(reordered)
  assert.deepEqual(updates, [
    { id: 'triceps', rest_seconds: 0 },
    { id: 'curl', rest_seconds: 90 },
  ])
})

test('reordenar: un ejercicio que sale del bloque lo pierde y un bloque que queda de uno se deshace', () => {
  const day = torsoA()
  const outOfBlock = [day[2], day[0], day[1], day[3], day[4]]
  const { updates } = planNormalizeOrder(outOfBlock)
  assert.deepEqual(updates, [
    { id: 'curl', superset_key: null, rest_seconds: 90 },
    { id: 'triceps', superset_key: null },
  ])
})

test('reordenar sin tocar el bloque no cambia nada', () => {
  const day = torsoA()
  assert.deepEqual(planNormalizeOrder([day[1], day[0], day[2], day[3], day[4]]).updates, [])
})

test('igualar series al mayor', () => {
  assert.deepEqual(planEqualizeSets(torsoA(), 'curl').updates, [{ id: 'triceps', sets: 4 }])
})

import { planDrop, planMove, planMoveBlock } from '../src/lib/training/supersets.js'

test('subir/bajar: un suelto salta la superserie entera; un miembro se mueve dentro', () => {
  const day = torsoA()
  assert.deepEqual(planMove(day, 'lateral', 'up'), ['press', 'remo', 'lateral', 'curl', 'triceps'])
  assert.deepEqual(planMove(day, 'remo', 'down'), ['press', 'curl', 'triceps', 'remo', 'lateral'])
  assert.deepEqual(planMove(day, 'triceps', 'up'), ['press', 'remo', 'triceps', 'curl', 'lateral'])
  assert.equal(planMove(day, 'curl', 'up'), null)
  assert.equal(planMove(day, 'press', 'up'), null)
})

test('subir/bajar un bloque entero', () => {
  assert.deepEqual(planMoveBlock(torsoA(), 'curl', 'up'), ['press', 'curl', 'triceps', 'remo', 'lateral'])
  assert.equal(planMoveBlock(torsoA(), 'press', 'up'), null)
})

test('arrastrar: nunca se parte una superserie', () => {
  const day = torsoA()
  // Suelto sobre C2: queda detrás del bloque (viene de arriba).
  assert.deepEqual(planDrop(day, 'press', 'triceps'), ['remo', 'curl', 'triceps', 'press', 'lateral'])
  // Suelto sobre C1 desde abajo: queda delante del bloque.
  assert.deepEqual(planDrop(day, 'lateral', 'curl'), ['press', 'remo', 'lateral', 'curl', 'triceps'])
  // Dentro del bloque: cambia de puesto.
  assert.deepEqual(planDrop(day, 'triceps', 'curl'), ['press', 'remo', 'triceps', 'curl', 'lateral'])
  // Un miembro sobre otro ejercicio: sale del bloque (luego planNormalizeOrder le quita la clave).
  const out = planDrop(day, 'curl', 'press')
  assert.deepEqual(out, ['curl', 'press', 'remo', 'triceps', 'lateral'])
  // Bloque entero sobre A.
  assert.deepEqual(planDrop(day, 'curl', 'press', { wholeBlock: true }), ['curl', 'triceps', 'press', 'remo', 'lateral'])
})
