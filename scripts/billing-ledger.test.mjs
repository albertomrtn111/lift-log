import test from 'node:test'
import assert from 'node:assert/strict'

const {
    buildMonthRows,
    buildYear,
    clientsWithoutFee,
    debtsByClient,
    dueDateFor,
    isBillable,
    summarizeMonth,
} = await import('../src/lib/billing/ledger.ts')

const client = (overrides) => ({
    id: overrides.id,
    full_name: overrides.full_name ?? overrides.id,
    email: null,
    status: 'active',
    start_date: '2026-03-01',
    created_at: '2026-02-20T10:00:00Z',
    payment_amount: 30,
    payment_day: 15,
    ...overrides,
})

const record = (overrides) => ({
    id: `${overrides.client_id}-${overrides.year}-${overrides.month}`,
    amount: 30,
    status: 'pending',
    paid_at: null,
    payment_method: null,
    notes: null,
    ...overrides,
})

test('el vencimiento usa el día de cobro y se ajusta a meses cortos', () => {
    assert.equal(dueDateFor(2026, 10, 15), '2026-10-15')
    assert.equal(dueDateFor(2026, 2, 30), '2026-02-28')
    assert.equal(dueDateFor(2026, 10, null), '2026-10-31')
})

test('solo es facturable quien está activo, tiene cuota y ya se había dado de alta', () => {
    assert.equal(isBillable(client({ id: 'a' }), 2026, 3), true)
    assert.equal(isBillable(client({ id: 'a' }), 2026, 2), false, 'antes del alta')
    assert.equal(isBillable(client({ id: 'a', payment_amount: null }), 2026, 3), false, 'sin cuota')
    assert.equal(isBillable(client({ id: 'a', status: 'inactive' }), 2026, 3), false, 'de baja')
    assert.equal(isBillable(client({ id: 'a', start_date: null }), 2026, 3), true, 'sin fecha de alta usa la de creación')
})

test('un atleta facturable sin registro aparece como «sin registrar» en vez de desaparecer', () => {
    const clients = [client({ id: 'alvaro', start_date: '2026-02-28' })]
    const rows = buildMonthRows(clients, [], 2026, 3, '2026-10-12')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].state, 'missing')
    assert.equal(rows[0].amount, 30)
})

test('un pendiente pasa a vencido al superar su día de cobro, no al acabar el mes', () => {
    const clients = [client({ id: 'unai', payment_day: 15 })]
    const records = [record({ client_id: 'unai', year: 2026, month: 10 })]
    assert.equal(buildMonthRows(clients, records, 2026, 10, '2026-10-12')[0].state, 'pending')
    const late = buildMonthRows(clients, records, 2026, 10, '2026-10-20')[0]
    assert.equal(late.state, 'overdue')
    assert.equal(late.daysLate, 5)
})

test('el registro manda aunque el atleta esté de baja o sin cuota', () => {
    const clients = [client({ id: 'dani', payment_amount: null, start_date: '2026-06-01' })]
    const records = [record({ client_id: 'dani', year: 2026, month: 5, status: 'paid' })]
    const rows = buildMonthRows(clients, records, 2026, 5, '2026-10-12')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].state, 'paid')
})

test('los meses futuros no generan deudas, solo previsión', () => {
    const clients = [client({ id: 'a' })]
    assert.equal(buildMonthRows(clients, [], 2026, 11, '2026-10-12').length, 0)
    const year = buildYear(clients, [], 2026, '2026-10-12')
    assert.equal(year[10].isForecast, true)
    assert.equal(year[10].forecast, 30)
    assert.equal(year[1].missing, 0, 'febrero es anterior al alta')
    assert.equal(year[2].missing, 30, 'marzo sin registrar')
})

test('el resumen separa cobrado, pendiente, vencido, sin registrar y exento', () => {
    const clients = ['a', 'b', 'c', 'd', 'e'].map(id => client({ id }))
    const records = [
        record({ client_id: 'a', year: 2026, month: 9, status: 'paid' }),
        record({ client_id: 'b', year: 2026, month: 9, status: 'pending' }),
        record({ client_id: 'c', year: 2026, month: 9, status: 'overdue' }),
        record({ client_id: 'd', year: 2026, month: 9, status: 'waived' }),
    ]
    const summary = summarizeMonth(buildMonthRows(clients, records, 2026, 9, '2026-10-12'))
    assert.equal(summary.collected, 30)
    assert.equal(summary.overdue, 60, 'el pendiente de septiembre ya venció')
    assert.equal(summary.missing, 30)
    assert.equal(summary.waived, 30)
    assert.equal(summary.expected, 120, 'lo exento no cuenta como previsto')
})

test('las deudas por atleta acumulan meses vencidos y sin registrar', () => {
    const clients = [client({ id: 'unai', start_date: '2026-09-01' })]
    const records = [record({ client_id: 'unai', year: 2026, month: 10 })]
    const debts = debtsByClient(clients, records, 2026, '2026-10-20')
    assert.equal(debts.length, 1)
    assert.equal(debts[0].amount, 60)
    assert.deepEqual(debts[0].months.map(m => [m.month, m.state]), [[9, 'missing'], [10, 'overdue']])
})

test('lo pendiente que aún no vence no cuenta como deuda', () => {
    const clients = [client({ id: 'ruben', start_date: '2026-10-01', payment_day: 15 })]
    const records = [record({ client_id: 'ruben', year: 2026, month: 10 })]
    assert.equal(debtsByClient(clients, records, 2026, '2026-10-12').length, 0)
    assert.equal(debtsByClient([client({ id: 'nuevo', start_date: '2026-10-01', payment_day: 15 })], [], 2026, '2026-10-12').length, 0)
})

test('detecta atletas activos sin cuota configurada', () => {
    const clients = [
        client({ id: 'a' }),
        client({ id: 'israel', full_name: 'Israel', payment_amount: null }),
        client({ id: 'baja', payment_amount: null, status: 'inactive' }),
    ]
    assert.deepEqual(clientsWithoutFee(clients).map(c => c.id), ['israel'])
})
