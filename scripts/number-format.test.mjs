import assert from 'node:assert/strict'
import test from 'node:test'

import { formatNumberForInput, roundToDecimals } from '../src/lib/format/number.js'

test('formatNumberForInput keeps at most two decimals without noisy float tails', () => {
  assert.equal(formatNumberForInput(43.681599999999996), '43.68')
  assert.equal(formatNumberForInput(123.65), '123.65')
  assert.equal(formatNumberForInput(10), '10')
  assert.equal(formatNumberForInput(null), '')
  assert.equal(formatNumberForInput(undefined), '')
})

test('roundToDecimals rounds numbers to two decimals by default', () => {
  assert.equal(roundToDecimals(43.681599999999996), 43.68)
  assert.equal(roundToDecimals(123.654), 123.65)
  assert.equal(roundToDecimals(123.655), 123.66)
  assert.equal(roundToDecimals(Number.NaN), undefined)
})
