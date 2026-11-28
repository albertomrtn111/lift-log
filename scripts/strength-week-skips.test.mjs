import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSkipSet,
  currentProgramWeek,
  fullySkippedWeeks,
  isDaySkipped,
  isSessionSkipped,
  mondayOfDate,
  programDayDate,
  programWeekOfDate,
  programWeekRange,
  weekdayOfDate,
} from '../src/lib/training/strength-week-skips.js'

// Programa que empieza el miércoles 4 de noviembre de 2026: la semana 1 va del lunes 2 al domingo 8.
const start = '2026-11-04'

test('la semana del programa empieza el lunes de la fecha de inicio', () => {
  assert.equal(mondayOfDate('2026-11-08'), '2026-11-02')
  assert.equal(programWeekOfDate(start, '2026-11-02'), 1)
  assert.equal(programWeekOfDate(start, '2026-11-08'), 1)
  assert.equal(programWeekOfDate(start, '2026-11-09'), 2)
  assert.equal(programWeekOfDate(start, '2026-11-22'), 3)
  assert.equal(programWeekOfDate(start, '2026-11-01'), null)
  assert.equal(programWeekOfDate(null, '2026-11-09'), null)
})

test('semana que toca hoy: entre la 1 y la última (Fuerza y Progreso)', () => {
  assert.equal(currentProgramWeek(start, '2026-11-04', 6), 1)
  assert.equal(currentProgramWeek(start, '2026-11-09', 6), 2)
  assert.equal(currentProgramWeek(start, '2026-11-22', 6), 3)
  // Antes de empezar, la 1; terminado, la última.
  assert.equal(currentProgramWeek(start, '2026-10-30', 6), 1)
  assert.equal(currentProgramWeek(start, '2026-12-14', 6), 6)
  assert.equal(currentProgramWeek(start, '2027-03-01', 6), 6)
  // Sin inicio o sin duración válida.
  assert.equal(currentProgramWeek(null, '2026-11-22', 6), 1)
  assert.equal(currentProgramWeek(start, '2026-11-22', null), 1)
  assert.equal(currentProgramWeek(start, '2026-11-22', '4'), 3)
  // Cruzando los cambios de hora no se pierde ni se gana una semana.
  assert.equal(currentProgramWeek('2026-03-02', '2026-03-30', 8), 5)
  assert.equal(currentProgramWeek('2026-10-05', '2026-10-26', 8), 4)
})

test('día de la semana de una fecha (1 = lunes … 7 = domingo)', () => {
  assert.equal(weekdayOfDate('2026-11-02'), 1)
  assert.equal(weekdayOfDate('2026-11-04'), 3)
  assert.equal(weekdayOfDate('2026-11-08'), 7)
  assert.equal(weekdayOfDate('2026-03-29'), 7)
})

test('fecha de un día del programa en una semana', () => {
  assert.equal(programDayDate(start, 1, 1), '2026-11-02')
  assert.equal(programDayDate(start, 3, 5), '2026-11-20')
  assert.equal(programDayDate(start, 2, 7), '2026-11-15')
  assert.equal(programDayDate(start, 2, null), null)
  assert.equal(programDayDate(start, 0, 1), null)
  assert.deepEqual(programWeekRange(start, 3), { start: '2026-11-16', end: '2026-11-22' })
})

test('un día quitado solo cuenta en su semana y su programa', () => {
  const skips = buildSkipSet([
    { program_id: 'p1', day_id: 'pierna', week_index: 3 },
    { programId: 'p1', dayId: 'torso', week: 2 },
  ])
  assert.equal(isDaySkipped(skips, 'p1', 'pierna', 3), true)
  assert.equal(isDaySkipped(skips, 'p1', 'pierna', 2), false)
  assert.equal(isDaySkipped(skips, 'p2', 'pierna', 3), false)
  assert.equal(isDaySkipped(skips, 'p1', 'torso', 2), true)
  assert.equal(isDaySkipped(new Set(), 'p1', 'pierna', 3), false)
})

test('una sesión movida usa la semana de su fecha', () => {
  const skips = buildSkipSet([{ program_id: 'p1', day_id: 'pierna', week_index: 3 }])
  assert.equal(isSessionSkipped(skips, { program_id: 'p1', day_id: 'pierna', scheduled_date: '2026-11-21' }, start), true)
  assert.equal(isSessionSkipped(skips, { program_id: 'p1', day_id: 'pierna', scheduled_date: '2026-11-23' }, start), false)
})

test('semanas con todos los días quitados', () => {
  const days = [
    { id: 'pierna', default_weekday: 1 },
    { id: 'torso', default_weekday: 4 },
    { id: 'extra', default_weekday: null },
  ]
  const skips = buildSkipSet([
    { program_id: 'p1', day_id: 'pierna', week_index: 2 },
    { program_id: 'p1', day_id: 'torso', week_index: 2 },
    { program_id: 'p1', day_id: 'pierna', week_index: 3 },
  ])
  assert.deepEqual(fullySkippedWeeks(skips, 'p1', days, 4), [2])
  assert.deepEqual(fullySkippedWeeks(skips, 'p1', [], 4), [])
})
