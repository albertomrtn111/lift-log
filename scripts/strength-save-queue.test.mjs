import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyQueueToCells,
  applyQueueToSets,
  enqueueStrengthChange,
  findSet,
  normalizeStrengthQueue,
  parseTempSetId,
  recordStrengthRefusal,
  remapTempSetIds,
  serverCellsAfter,
  serverSetsAfter,
  settleStrengthChange,
  STRENGTH_QUEUE_MAX_REFUSALS,
  tempAliasesFor,
  tempSetId,
} from '../src/lib/training/strength-save-queue.js'

const EX = '11111111-1111-1111-1111-111111111111'

function serverSet(id, setIndex, values = {}) {
  return {
    id, exerciseId: EX, weekNumber: 2, setIndex,
    weightKg: 60, reps: 8, rir: 2, completed: false, isOverride: false, notes: null,
    ...values,
  }
}

let counter = 0
const uid = () => `u${++counter}`

test('id temporal: dice ejercicio, semana y número de serie', () => {
  const id = tempSetId(EX, 2, 3)
  assert.deepEqual(parseTempSetId(id), { exerciseId: EX, week: 2, setIndex: 3 })
  assert.equal(parseTempSetId('abc'), null)
  const real = serverSet('real-3', 3)
  assert.equal(findSet([real], id), real)
})

test('añadir: un cambio entra en la cola y se ve como pendiente', () => {
  const queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 62.5 }, override: true })
  assert.equal(queue.length, 1)
  assert.equal(queue[0].rev, 1)
  const shown = applyQueueToSets([serverSet('s1', 0)], queue)
  assert.equal(shown[0].weightKg, 62.5)
  assert.equal(shown[0].isOverride, true)
  assert.deepEqual(shown[0].pendingFields, ['weightKg'])
})

test('fusionar: la misma serie se queda en una entrada con lo último', () => {
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 62.5 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 6 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 65 }, override: true })
  assert.equal(queue.length, 1)
  assert.deepEqual(queue[0].values, { weightKg: 65, reps: 6 })
  assert.equal(queue[0].rev, 3)
  assert.deepEqual(applyQueueToSets([serverSet('s1', 0)], queue)[0].pendingFields, ['weightKg', 'reps'])
})

test('fusionar: volver a la base sustituye los valores editados', () => {
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 70 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 60, reps: 8, rir: 2 }, override: false })
  assert.equal(queue.length, 1)
  assert.equal(queue[0].override, false)
  assert.deepEqual(queue[0].values, { weightKg: 60, reps: 8, rir: 2 })
})

test('fusionar: la misma casilla (nota) guarda solo el último texto', () => {
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'cell', exerciseId: EX, columnId: 'notes', week: 2, value: 'Bien' })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'cell', exerciseId: EX, columnId: 'notes', week: 2, value: 'Bien, rodilla ok' })
  assert.equal(queue.length, 1)
  assert.equal(queue[0].value, 'Bien, rodilla ok')
  const cells = applyQueueToCells([{ id: 'c1', exerciseId: EX, columnId: 'notes', weekNumber: 2, value: 'viejo' }], queue)
  assert.deepEqual(cells[0], { id: 'c1', exerciseId: EX, columnId: 'notes', weekNumber: 2, value: 'Bien, rodilla ok', pending: true })
})

test('fusionar: no salta por encima de un «crear series» del mismo ejercicio', () => {
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 70 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'generate', exerciseId: EX, week: 2, series: 3, weightKg: 50, reps: 10, rir: 1 })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 5 }, override: true })
  assert.deepEqual(queue.map(e => e.kind), ['set', 'generate', 'set'])
})

test('crear series sin conexión: aparecen como temporales y pendientes', () => {
  const queue = enqueueStrengthChange([], { uid: uid(), kind: 'generate', exerciseId: EX, week: 2, series: 3, weightKg: 40, reps: 12, rir: 2 })
  const shown = applyQueueToSets([], queue)
  assert.deepEqual(shown.map(s => s.id), [tempSetId(EX, 2, 0), tempSetId(EX, 2, 1), tempSetId(EX, 2, 2)])
  assert.ok(shown.every(s => s.pendingFields.length === 3 && s.weightKg === 40))
})

test('crear series sobre las que hay: igual que el servidor (respeta las editadas)', () => {
  const server = [serverSet('a', 0), serverSet('b', 1, { isOverride: true, weightKg: 80 }), serverSet('c', 2), serverSet('d', 3)]
  const queue = enqueueStrengthChange([], { uid: uid(), kind: 'generate', exerciseId: EX, week: 2, series: 2, weightKg: 50, reps: 5, rir: 1 })
  const shown = applyQueueToSets(server, queue)
  assert.deepEqual(shown.map(s => [s.id, s.weightKg]), [['a', 50], ['b', 80]])
})

test('añadir serie y borrarla antes de que llegue: se anula todo', () => {
  const temp = tempSetId(EX, 2, 4)
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'add', exerciseId: EX, week: 2, setIndex: 4, tempId: temp, weightKg: 60, reps: 8, rir: 2 })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'set', setId: temp, exerciseId: EX, week: 2, values: { reps: 7 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'delete', setId: temp })
  assert.deepEqual(queue, [])
})

test('borrar una serie real: quita sus ediciones pendientes y no se repite', () => {
  let queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 7 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'delete', setId: 's1' })
  queue = enqueueStrengthChange(queue, { uid: uid(), kind: 'delete', setId: 's1' })
  assert.deepEqual(queue.map(e => e.kind), ['delete'])
  assert.deepEqual(applyQueueToSets([serverSet('s1', 0), serverSet('s2', 1)], queue).map(s => s.id), ['s2'])
})

test('una recarga no pisa lo pendiente: lo del servidor + la cola', () => {
  const queue = enqueueStrengthChange([], { uid: uid(), kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 100 }, override: true })
  // La recarga trae lo de antes (el cambio aún no llegó)
  const fresh = [serverSet('s1', 0, { weightKg: 60 })]
  assert.equal(applyQueueToSets(fresh, queue)[0].weightKg, 100)
})

test('reintentar: repetir el «crear series» que sí llegó no duplica series', () => {
  const queue = enqueueStrengthChange([], { uid: uid(), kind: 'generate', exerciseId: EX, week: 2, series: 2, weightKg: 40, reps: 12, rir: 2 })
  // La respuesta se perdió, pero el servidor ya las tiene
  const fresh = [serverSet('r0', 0, { weightKg: 40, reps: 12 }), serverSet('r1', 1, { weightKg: 40, reps: 12 })]
  assert.deepEqual(applyQueueToSets(fresh, queue).map(s => s.id), ['r0', 'r1'])
})

test('reintentar: un rechazo del servidor cuenta y al final se quita para avisar', () => {
  let queue = enqueueStrengthChange([], { uid: 'x', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 7 }, override: true })
  for (let i = 1; i < STRENGTH_QUEUE_MAX_REFUSALS; i++) {
    const result = recordStrengthRefusal(queue, 'x', 1)
    assert.equal(result.dropped, null)
    queue = result.queue
    assert.equal(queue[0].refusals, i)
  }
  const last = recordStrengthRefusal(queue, 'x', 1)
  assert.equal(last.dropped?.uid, 'x')
  assert.deepEqual(last.queue, [])
})

test('reintentar: si cambió mientras se enviaba, el rechazo no cuenta', () => {
  let queue = enqueueStrengthChange([], { uid: 'x', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 7 }, override: true })
  queue = enqueueStrengthChange(queue, { uid: 'y', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 8 }, override: true })
  const result = recordStrengthRefusal(queue, 'x', 1)
  assert.equal(result.dropped, null)
  assert.equal(result.queue[0].refusals, 0)
})

test('vaciar al confirmar: sale de la cola y lo guardado pasa a ser del servidor', () => {
  const entry = { uid: 'x', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 7 }, override: true }
  const queue = enqueueStrengthChange([], entry)
  const settled = settleStrengthChange(queue, 'x', 1)
  assert.deepEqual(settled.queue, [])
  const saved = serverSet('s1', 0, { reps: 7, isOverride: true })
  const server = serverSetsAfter([serverSet('s1', 0)], entry, { set: saved })
  const shown = applyQueueToSets(server, settled.queue)
  assert.equal(shown[0].reps, 7)
  assert.equal(shown[0].pendingFields, undefined)
})

test('vaciar al confirmar: un valor fusionado mientras se enviaba no se pierde', () => {
  let queue = enqueueStrengthChange([], { uid: 'x', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { reps: 7 }, override: true })
  // Se envía rev 1; mientras tanto el atleta cambia el peso
  queue = enqueueStrengthChange(queue, { uid: 'y', kind: 'set', setId: 's1', exerciseId: EX, week: 2, values: { weightKg: 90 }, override: true })
  const settled = settleStrengthChange(queue, 'x', 1)
  assert.equal(settled.newer, true)
  assert.equal(settled.queue.length, 1)
  assert.deepEqual(settled.queue[0].values, { reps: 7, weightKg: 90 })
})

test('series creadas: los ids temporales de la cola pasan a los reales', () => {
  let queue = enqueueStrengthChange([], { uid: 'g', kind: 'generate', exerciseId: EX, week: 2, series: 2, weightKg: 40, reps: 12, rir: 2 })
  queue = enqueueStrengthChange(queue, { uid: 's', kind: 'set', setId: tempSetId(EX, 2, 1), exerciseId: EX, week: 2, values: { reps: 10 }, override: true })
  const created = [serverSet('r0', 0), serverSet('r1', 1)]
  queue = settleStrengthChange(queue, 'g', 1).queue
  queue = remapTempSetIds(queue, created)
  assert.equal(queue[0].setId, 'r1')
  const displayed = new Set([tempSetId(EX, 2, 0), tempSetId(EX, 2, 1)])
  const aliases = new Map(tempAliasesFor(created, displayed))
  // Se sigue enseñando con el id temporal para no rehacer la casilla
  const shown = applyQueueToSets(serverSetsAfter([], { kind: 'generate', exerciseId: EX, week: 2 }, { sets: created }), queue, aliases)
  assert.deepEqual(shown.map(s => s.id), [tempSetId(EX, 2, 0), tempSetId(EX, 2, 1)])
  assert.equal(shown[1].reps, 10)
  assert.deepEqual(shown[1].pendingFields, ['reps'])
  assert.equal(shown[0].pendingFields, undefined)
})

test('casillas: confirmar una la deja guardada sin marca de pendiente', () => {
  const entry = { uid: 'c', kind: 'cell', exerciseId: EX, columnId: 'notes', week: 2, value: 'Hecho' }
  const cells = serverCellsAfter([], entry)
  assert.equal(cells[0].value, 'Hecho')
  assert.equal(cells[0].pending, undefined)
})

test('lo guardado en el navegador: se descarta lo que no tiene forma', () => {
  const good = { uid: 'a', kind: 'set', setId: 's1', values: { reps: 5 }, override: true }
  const raw = [good, { uid: 'b', kind: 'set', setId: 's1', values: { reps: 'cinco' }, override: true }, { kind: 'cell' }, null, 'x']
  assert.deepEqual(normalizeStrengthQueue(raw), [good])
  assert.deepEqual(normalizeStrengthQueue('nada'), [])
})
