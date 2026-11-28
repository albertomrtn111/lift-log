import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveRoutineInitialSelection } from '../src/lib/training/routine-defaults.js'

const program = {
  effectiveFrom: '2026-06-01',
  totalWeeks: 4,
}

const days = [
  { id: 'legs', name: 'Pierna', order: 1, defaultWeekday: 1 },
  { id: 'torso', name: 'Torso', order: 2, defaultWeekday: 3 },
  { id: 'fullbody', name: 'Fullbody', order: 3, defaultWeekday: 7 },
]

// Horas en Madrid con su desfase: +01:00 en invierno y +02:00 en verano.
const HOURS = ['00:30', '08:00', '11:59', '12:01', '23:30']
const madrid = (date, time, offset) => new Date(`${date}T${time}:00${offset}`)

// El servidor de producción va en UTC; el resultado no puede depender de su zona.
const SERVER_ZONES = ['UTC', 'Europe/Madrid', 'America/New_York', 'Pacific/Auckland']

function inServerZone(zone, fn) {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

/** Comprueba la selección a cada hora del día, con el servidor en varias zonas. */
function assertAllDay({ program: selectedProgram = program, date, offset, expected, hours = HOURS }) {
  for (const zone of SERVER_ZONES) {
    for (const time of hours) {
      const result = inServerZone(zone, () => resolveRoutineInitialSelection({
        program: selectedProgram,
        days,
        today: madrid(date, time, offset),
        timeZone: 'Europe/Madrid',
      }))
      assert.deepEqual(result, expected, `${date} ${time}${offset} con el servidor en ${zone}`)
    }
  }
}

test('resolveRoutineInitialSelection opens the current program week and today strength day', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: '2026-06-15' }),
    { week: 3, dayId: 'legs', sessionDate: '2026-06-15' }
  )
})

test('resolveRoutineInitialSelection falls back to the first ordered day in the current week', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: '2026-06-17' }),
    { week: 3, dayId: 'torso', sessionDate: '2026-06-17' }
  )
})

test('resolveRoutineInitialSelection keeps the last program week after the program range', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: '2026-07-15' }),
    { week: 4, dayId: 'torso', sessionDate: '2026-06-24' }
  )
})

test('resolveRoutineInitialSelection skips a day the coach removed in that week', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({
      program: { ...program, skippedDays: [{ dayId: 'legs', week: 3 }, { dayId: 'torso', week: 2 }] },
      days,
      today: '2026-06-15',
    }),
    { week: 3, dayId: 'torso', sessionDate: '2026-06-17' }
  )
})

test('verano, programa que empieza en lunes: el lunes abre su semana a cualquier hora (NXT-147)', () => {
  // El fallo: antes de las 12:00 del servidor salía la semana 2 con fecha 2026-06-08.
  assertAllDay({ date: '2026-06-15', offset: '+02:00', expected: { week: 3, dayId: 'legs', sessionDate: '2026-06-15' } })
  assertAllDay({ date: '2026-06-17', offset: '+02:00', expected: { week: 3, dayId: 'torso', sessionDate: '2026-06-17' } })
  // Domingo: sigue siendo la semana que acaba, también a las 23:30.
  assertAllDay({ date: '2026-06-14', offset: '+02:00', expected: { week: 2, dayId: 'fullbody', sessionDate: '2026-06-14' } })
})

test('invierno, programa que empieza en lunes: el lunes abre su semana a cualquier hora', () => {
  const winter = { effectiveFrom: '2026-01-05', totalWeeks: 8 }
  assertAllDay({ program: winter, date: '2026-01-19', offset: '+01:00', expected: { week: 3, dayId: 'legs', sessionDate: '2026-01-19' } })
  assertAllDay({ program: winter, date: '2026-01-25', offset: '+01:00', expected: { week: 3, dayId: 'fullbody', sessionDate: '2026-01-25' } })
})

test('programa que empieza en miércoles: las semanas van de lunes a domingo', () => {
  // Semana 1: del lunes 5 al domingo 11 de enero (empieza el miércoles 7).
  const wednesday = { effectiveFrom: '2026-01-07', totalWeeks: 8 }
  assertAllDay({ program: wednesday, date: '2026-01-12', offset: '+01:00', expected: { week: 2, dayId: 'legs', sessionDate: '2026-01-12' } })
  assertAllDay({ program: wednesday, date: '2026-01-21', offset: '+01:00', expected: { week: 3, dayId: 'torso', sessionDate: '2026-01-21' } })
  assertAllDay({ program: wednesday, date: '2026-01-25', offset: '+01:00', expected: { week: 3, dayId: 'fullbody', sessionDate: '2026-01-25' } })
  assertAllDay({ program: wednesday, date: '2026-01-26', offset: '+01:00', expected: { week: 4, dayId: 'legs', sessionDate: '2026-01-26' } })

  const summerWednesday = { effectiveFrom: '2026-06-03', totalWeeks: 6 }
  assertAllDay({ program: summerWednesday, date: '2026-06-08', offset: '+02:00', expected: { week: 2, dayId: 'legs', sessionDate: '2026-06-08' } })
})

test('cambio de hora: un programa de invierno abre bien la semana tras pasar a verano y al volver', () => {
  // El horario de verano empieza el domingo 29 de marzo de 2026.
  const spring = { effectiveFrom: '2026-03-02', totalWeeks: 8 }
  assertAllDay({ program: spring, date: '2026-03-29', offset: '+02:00', hours: ['08:00', '11:59', '12:01', '23:30'], expected: { week: 4, dayId: 'fullbody', sessionDate: '2026-03-29' } })
  assertAllDay({ program: spring, date: '2026-03-29', offset: '+01:00', hours: ['00:30'], expected: { week: 4, dayId: 'fullbody', sessionDate: '2026-03-29' } })
  assertAllDay({ program: spring, date: '2026-03-30', offset: '+02:00', expected: { week: 5, dayId: 'legs', sessionDate: '2026-03-30' } })

  // Y termina el domingo 25 de octubre de 2026.
  const autumn = { effectiveFrom: '2026-10-05', totalWeeks: 8 }
  assertAllDay({ program: autumn, date: '2026-10-25', offset: '+02:00', hours: ['00:30'], expected: { week: 3, dayId: 'fullbody', sessionDate: '2026-10-25' } })
  assertAllDay({ program: autumn, date: '2026-10-25', offset: '+01:00', hours: ['08:00', '11:59', '12:01', '23:30'], expected: { week: 3, dayId: 'fullbody', sessionDate: '2026-10-25' } })
  assertAllDay({ program: autumn, date: '2026-10-26', offset: '+01:00', expected: { week: 4, dayId: 'legs', sessionDate: '2026-10-26' } })
})

test('programa terminado: no pasa de la última semana', () => {
  // Cuatro semanas desde el 1 de junio: la última va del 22 al 28.
  assertAllDay({ date: '2026-06-28', offset: '+02:00', expected: { week: 4, dayId: 'fullbody', sessionDate: '2026-06-28' } })
  assertAllDay({ date: '2026-06-29', offset: '+02:00', expected: { week: 4, dayId: 'legs', sessionDate: '2026-06-22' } })
  assertAllDay({ date: '2026-12-16', offset: '+01:00', expected: { week: 4, dayId: 'torso', sessionDate: '2026-06-24' } })
})

test('antes de empezar el programa abre la semana 1', () => {
  assertAllDay({ program: { effectiveFrom: '2026-06-01', totalWeeks: 4 }, date: '2026-05-27', offset: '+02:00', expected: { week: 1, dayId: 'torso', sessionDate: '2026-06-03' } })
})

test('«hoy» es el de la zona del espacio, no el del servidor', () => {
  // Domingo 14 a las 20:00 en Ciudad de México (UTC-6) ya es lunes 15 en Madrid.
  const now = new Date('2026-06-14T20:00:00-06:00')
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: now, timeZone: 'America/Mexico_City' }),
    { week: 2, dayId: 'fullbody', sessionDate: '2026-06-14' }
  )
  // Sin zona (o con una inválida) se usa la de Madrid.
  const monday = { week: 3, dayId: 'legs', sessionDate: '2026-06-15' }
  assert.deepEqual(resolveRoutineInitialSelection({ program, days, today: now }), monday)
  assert.deepEqual(resolveRoutineInitialSelection({ program, days, today: now, timeZone: 'Marte/Olimpo' }), monday)
  // Pero el domingo 23:30 en Madrid es ya lunes en Auckland.
  const sunday = madrid('2026-06-14', '23:30', '+02:00')
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: sunday, timeZone: 'Europe/Madrid' }),
    { week: 2, dayId: 'fullbody', sessionDate: '2026-06-14' }
  )
  assert.deepEqual(
    resolveRoutineInitialSelection({ program, days, today: sunday, timeZone: 'Pacific/Auckland' }),
    { week: 3, dayId: 'legs', sessionDate: '2026-06-15' }
  )
})

test('sin fecha de inicio abre la semana 1 y el primer día', () => {
  assert.deepEqual(
    resolveRoutineInitialSelection({ program: { totalWeeks: 4 }, days, today: '2026-06-15' }),
    { week: 1, dayId: 'legs', sessionDate: null }
  )
})
