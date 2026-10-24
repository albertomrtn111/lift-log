import test from 'node:test'
import assert from 'node:assert/strict'

const { cardioDiscipline, formatCardioIntensity, formatPacePerKm, formatSpeed, speedKmh } = await import('../src/lib/cardio/discipline.js')

test('las bicis de Strava no se clasifican como carrera', () => {
  for (const type of ['Ride', 'MountainBikeRide', 'GravelRide', 'VirtualRide', 'EBikeRide']) {
    assert.equal(cardioDiscipline(type), 'bicicleta', type)
  }
  assert.equal(cardioDiscipline('rodaje', 'Bicicleta'), 'bicicleta', 'sesión del coach con tipo de entreno de carrera')
  assert.equal(cardioDiscipline(null, 'Ride', 'Bicicleta'), 'bicicleta')
})

test('carrera, natación e híbrido', () => {
  assert.equal(cardioDiscipline('Run'), 'running')
  assert.equal(cardioDiscipline('TrailRun'), 'running')
  assert.equal(cardioDiscipline('series', 'Running'), 'running')
  assert.equal(cardioDiscipline('Swim'), 'natacion')
  assert.equal(cardioDiscipline('Natación'), 'natacion')
  assert.equal(cardioDiscipline('hyrox'), 'hibrido')
  assert.equal(cardioDiscipline(null, undefined, ''), 'running')
  assert.equal(cardioDiscipline('Rodaje con strides'), 'running', 'strides no es bici')
  assert.equal(cardioDiscipline('Series de velocidad', 'Running'), 'running', 'velocidad no es bici')
})

test('en bici se muestra velocidad; en carrera, ritmo', () => {
  // La salida real que salía como «2:34/km»: 42,5 km en 109 min
  assert.equal(formatCardioIntensity({ discipline: 'bicicleta', distanceKm: 42.5, durationMin: 109, paceSecondsPerKm: 154.04 }), '23,4 km/h')
  assert.equal(formatCardioIntensity({ discipline: 'bicicleta', distanceKm: null, durationMin: null, paceSecondsPerKm: 150 }), '24,0 km/h')
  assert.equal(formatCardioIntensity({ discipline: 'running', distanceKm: 10, durationMin: 50, paceSecondsPerKm: 300 }), '5:00/km')
  assert.equal(formatCardioIntensity({ discipline: 'bicicleta', distanceKm: 0, durationMin: 45, paceSecondsPerKm: null }), null)
})

test('formatos', () => {
  assert.equal(speedKmh(30, 60), 30)
  assert.equal(formatSpeed(23.39), '23,4 km/h')
  assert.equal(formatPacePerKm(299.7), '5:00/km')
  assert.equal(formatPacePerKm(null), null)
})
