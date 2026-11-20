import test from 'node:test'
import assert from 'node:assert/strict'

const {
    attachPaymentNotes,
    normalizePaymentNote,
    splitPaymentNote,
} = await import('../src/lib/billing/payment-notes.ts')

test('la nota se guarda recortada y vacía se quita', () => {
    assert.equal(normalizePaymentNote('  Bizum  '), 'Bizum')
    assert.equal(normalizePaymentNote(''), null)
    assert.equal(normalizePaymentNote('   '), null)
    assert.equal(normalizePaymentNote(null), null)
    assert.equal(normalizePaymentNote(undefined), null)
    assert.equal(normalizePaymentNote(42), null)
})

test('sin payment_notes en el cambio, la nota no se toca', () => {
    const { clientUpdates, paymentNote } = splitPaymentNote({ full_name: 'Ana', payment_amount: 50 })
    assert.deepEqual(clientUpdates, { full_name: 'Ana', payment_amount: 50 })
    assert.equal(paymentNote, undefined)
})

test('payment_notes sale de los cambios de la ficha y va aparte', () => {
    const { clientUpdates, paymentNote } = splitPaymentNote({ full_name: 'Ana', payment_notes: ' Efectivo ' })
    assert.deepEqual(clientUpdates, { full_name: 'Ana' })
    assert.equal('payment_notes' in clientUpdates, false)
    assert.equal(paymentNote, 'Efectivo')
})

test('payment_notes null o vacío quita la nota', () => {
    assert.equal(splitPaymentNote({ payment_notes: null }).paymentNote, null)
    assert.equal(splitPaymentNote({ payment_notes: '' }).paymentNote, null)
})

test('cada ficha recibe su nota de la tabla, no la de clients', () => {
    const clients = [
        { id: 'a', full_name: 'Ana', payment_notes: 'vieja' },
        { id: 'b', full_name: 'Luis', payment_notes: 'vieja' },
        { id: 'c', full_name: 'Eva' },
    ]
    const result = attachPaymentNotes(clients, [
        { client_id: 'a', notes: 'Bizum' },
        { client_id: 'c', notes: '  ' },
        { client_id: 'otro', notes: 'No es de esta lista' },
    ])
    assert.deepEqual(result.map(c => [c.id, c.payment_notes]), [['a', 'Bizum'], ['b', null], ['c', null]])
    assert.equal(result[0].full_name, 'Ana')
    assert.equal(clients[0].payment_notes, 'vieja', 'no modifica la lista original')
})

test('sin filas de notas (o si la consulta falla) todas quedan en null', () => {
    assert.deepEqual(attachPaymentNotes([{ id: 'a', payment_notes: 'x' }], null), [{ id: 'a', payment_notes: null }])
    assert.deepEqual(attachPaymentNotes([], [{ client_id: 'a', notes: 'x' }]), [])
})
