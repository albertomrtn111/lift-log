import test from 'node:test'
import assert from 'node:assert/strict'

const {
  aggregateSeasonVolume, deviationStatus, formatAmount, measureFor, mondayOf, percentOf,
  seasonDiscipline, seasonWeekStarts, targetAmount, weekCountBetween, weekTiming,
} = await import('../src/lib/season/volume.js')

const empty = { plannedCardio: [], plannedStrength: [], doneCardio: [], stravaActivities: [], doneStrength: [] }

test('semanas de lunes a domingo', () => {
  assert.equal(mondayOf('2026-10-25'), '2026-10-19', 'domingo')
  assert.equal(mondayOf('2026-10-19'), '2026-10-19', 'lunes')
  assert.equal(mondayOf('2026-10-21T23:30:00'), '2026-10-19', 'fecha local de Strava')
  assert.deepEqual(seasonWeekStarts('2026-12-28', 3), ['2026-12-28', '2027-01-04', '2027-01-11'], 'cruza el año')
  assert.equal(weekCountBetween('2026-10-19', '2027-02-07'), 16)
  assert.equal(weekTiming('2026-10-12', '2026-10-24'), 'past')
  assert.equal(weekTiming('2026-10-19', '2026-10-24'), 'current')
  assert.equal(weekTiming('2026-10-26', '2026-10-24'), 'future')
})

test('disciplina con la misma clasificación que Progreso', () => {
  assert.equal(seasonDiscipline('Bicicleta', 'rodaje'), 'bike')
  assert.equal(seasonDiscipline('MountainBikeRide'), 'bike')
  assert.equal(seasonDiscipline('Natación'), 'swim')
  assert.equal(seasonDiscipline('Running', 'series'), 'run')
  assert.equal(seasonDiscipline('hyrox'), 'other')
})

test('programado por disciplina y fuerza en sesiones', () => {
  const volume = aggregateSeasonVolume({
    ...empty,
    weekStarts: ['2026-10-19'],
    plannedCardio: [
      { date: '2026-10-20', discipline: 'run', minutes: 50, km: 10 },
      { date: '2026-10-22', discipline: 'run', minutes: 40, km: null },
      { date: '2026-10-24', discipline: 'bike', minutes: 120, km: 50 },
      { date: '2026-10-27', discipline: 'run', minutes: 60, km: 12 },
    ],
    plannedStrength: [{ date: '2026-10-21' }, { date: '2026-10-23' }],
  })
  const week = volume['2026-10-19']
  assert.deepEqual(week.run.planned, { minutes: 90, km: 10, sessions: 2 }, 'la sesión de la semana siguiente queda fuera')
  assert.deepEqual(week.bike.planned, { minutes: 120, km: 50, sessions: 1 })
  assert.equal(week.strength.planned.sessions, 2)
})

test('realizado sin contar dos veces Strava', () => {
  const volume = aggregateSeasonVolume({
    ...empty,
    weekStarts: ['2026-10-19'],
    doneCardio: [
      { id: 's1', date: '2026-10-20', discipline: 'run', minutes: 48, km: 10.2, stravaActivityId: 'a1' },
      // Marcada como hecha sin datos pero enlazada: se usan los de Strava
      { id: 's2', date: '2026-10-22', discipline: 'swim', minutes: null, km: null, stravaActivityId: 'a2' },
      // Manual sin datos ni Strava
      { id: 's3', date: '2026-10-23', discipline: 'run', minutes: null, km: null },
    ],
    stravaActivities: [
      { id: 'a1', date: '2026-10-20', discipline: 'run', minutes: 48, km: 10.2, cardioSessionId: 's1' },
      { id: 'a2', date: '2026-10-22', discipline: 'swim', minutes: 35, km: 1.5, cardioSessionId: 's2' },
      // Sin enlazar: cuenta
      { id: 'a3', date: '2026-10-24', discipline: 'bike', minutes: 95, km: 40 },
      // Emparejada con una sesión que el atleta no marcó: cuenta igualmente
      { id: 'a4', date: '2026-10-25', discipline: 'bike', minutes: 60, km: 25, matchedSessionId: 'pendiente' },
    ],
    doneStrength: [{ date: '2026-10-21' }],
  })
  const week = volume['2026-10-19']
  assert.deepEqual(week.run.done, { minutes: 48, km: 10.2, sessions: 2 })
  assert.equal(week.run.doneMissingData, 1)
  assert.deepEqual(week.swim.done, { minutes: 35, km: 1.5, sessions: 1 })
  assert.equal(week.swim.doneMissingData, 0)
  assert.deepEqual(week.bike.done, { minutes: 155, km: 65, sessions: 2 })
  assert.equal(week.strength.done.sessions, 1)
})

test('lectura de desviaciones con banda 90-110 %', () => {
  assert.equal(deviationStatus(null, 100), 'none')
  assert.equal(deviationStatus(180, 0), 'empty', 'sin planificar')
  assert.equal(deviationStatus(180, 150), 'low')
  assert.equal(deviationStatus(180, 170), 'ok')
  assert.equal(deviationStatus(180, 198), 'ok')
  assert.equal(deviationStatus(180, 200), 'high')
  assert.equal(percentOf(180, 135), 75)
  assert.equal(percentOf(0, 135), null)
})

test('unidad por disciplina', () => {
  assert.equal(measureFor('strength', 'time'), 'sessions')
  assert.equal(measureFor('run', 'distance'), 'km')
  assert.equal(measureFor('bike', 'time'), 'minutes')
  assert.equal(targetAmount({ target_minutes: 180, target_km: null }, 'minutes'), 180)
  assert.equal(targetAmount({ target_minutes: 180, target_km: null }, 'km'), null)
  assert.equal(formatAmount(195, 'minutes'), '3 h 15 min')
  assert.equal(formatAmount(1, 'sessions'), '1 sesión')
})

test('el coach escribe horas, km o sesiones', async () => {
  const { parseTargetInput, targetInputValue } = await import('../src/lib/season/volume.js')
  assert.equal(parseTargetInput('3', 'minutes'), 180)
  assert.equal(parseTargetInput('3,5', 'minutes'), 210)
  assert.equal(parseTargetInput('3:15', 'minutes'), 195)
  assert.equal(parseTargetInput('', 'minutes'), null)
  assert.ok(Number.isNaN(parseTargetInput('tres', 'minutes')))
  assert.equal(parseTargetInput('42,2', 'km'), 42.2)
  assert.equal(parseTargetInput('2', 'sessions'), 2)
  assert.ok(Number.isNaN(parseTargetInput('2,5', 'sessions')))
  assert.equal(targetInputValue(195, 'minutes'), '3:15')
  assert.equal(targetInputValue(180, 'minutes'), '3')
  assert.equal(targetInputValue(42.2, 'km'), '42,2')
  assert.equal(targetInputValue(null, 'km'), '')
})
