import test from 'node:test'
import assert from 'node:assert/strict'

const { getBillingPeriodFromDate, getLastDayOfBillingMonth } = await import('../src/lib/billing-period.ts')

test('a client starts billing in the same calendar month as their activation date', () => {
    assert.deepEqual(getBillingPeriodFromDate('2026-09-14'), { year: 2026, month: 9 })
    assert.deepEqual(getBillingPeriodFromDate('2026-12-31'), { year: 2026, month: 12 })
})

test('month boundaries are timezone-safe and include the real final day', () => {
    assert.equal(getLastDayOfBillingMonth(2026, 2), '2026-02-28')
    assert.equal(getLastDayOfBillingMonth(2028, 2), '2028-02-29')
    assert.equal(getLastDayOfBillingMonth(2026, 9), '2026-09-30')
})

test('invalid activation dates and periods are rejected', () => {
    assert.throws(() => getBillingPeriodFromDate('2026-02-30'), /Fecha de alta inválida/)
    assert.throws(() => getBillingPeriodFromDate('14-09-2026'), /Fecha de alta inválida/)
    assert.throws(() => getLastDayOfBillingMonth(2026, 13), /Periodo de facturación inválido/)
})
