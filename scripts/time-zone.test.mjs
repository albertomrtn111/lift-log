import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_TIME_ZONE, resolveTimeZone, todayKeyIn } from '../src/lib/time-zone.js'

test('hoy en Madrid no cambia a las 00:00 UTC ni a las 12:00 UTC', () => {
  // Invierno (UTC+1): de 23:00 a 23:59 UTC ya es el día siguiente en Madrid.
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-01-18T23:30:00Z')), '2026-01-19')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-01-19T07:00:00Z')), '2026-01-19')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-01-19T22:30:00Z')), '2026-01-19')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-01-19T23:00:00Z')), '2026-01-20')
  // Verano (UTC+2): de 22:00 a 23:59 UTC ya es el día siguiente.
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-06-14T22:30:00Z')), '2026-06-15')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-06-15T21:30:00Z')), '2026-06-15')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-06-15T22:00:00Z')), '2026-06-16')
})

test('la noche del cambio de hora', () => {
  // 29 de marzo de 2026: a las 02:00 pasan a ser las 03:00.
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-03-28T23:30:00Z')), '2026-03-29')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-03-29T21:59:00Z')), '2026-03-29')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-03-29T22:00:00Z')), '2026-03-30')
  // 25 de octubre de 2026: a las 03:00 vuelven a ser las 02:00.
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-10-24T22:30:00Z')), '2026-10-25')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-10-25T22:59:00Z')), '2026-10-25')
  assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-10-25T23:00:00Z')), '2026-10-26')
})

test('otra zona del espacio y zona por defecto', () => {
  assert.equal(todayKeyIn('America/Mexico_City', new Date('2026-06-15T02:00:00Z')), '2026-06-14')
  assert.equal(todayKeyIn(null, new Date('2026-06-14T22:30:00Z')), '2026-06-15')
  assert.equal(todayKeyIn('', new Date('2026-06-14T22:30:00Z')), '2026-06-15')
  assert.equal(todayKeyIn('Marte/Olimpo', new Date('2026-06-14T22:30:00Z')), '2026-06-15')
  assert.equal(resolveTimeZone(' Europe/Lisbon '), 'Europe/Lisbon')
  assert.equal(resolveTimeZone('Marte/Olimpo'), DEFAULT_TIME_ZONE)
  assert.equal(resolveTimeZone(undefined), 'Europe/Madrid')
})

test('no depende de la zona del servidor', () => {
  const previous = process.env.TZ
  try {
    for (const zone of ['UTC', 'Europe/Madrid', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = zone
      assert.equal(todayKeyIn('Europe/Madrid', new Date('2026-06-14T22:30:00Z')), '2026-06-15', zone)
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
