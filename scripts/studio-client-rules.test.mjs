import assert from 'node:assert/strict'
import test from 'node:test'
import {
    birthdayInfo,
    cleanObjectives,
    defaultScope,
    duplicateText,
    nameMatches,
    visibleClients,
} from '../src/lib/studio/client-rules.js'

test('edad y cumpleaños', () => {
    assert.deepEqual(birthdayInfo('1990-03-14', '2026-11-10'), { age: 36, label: '14 mar', days: 124, soon: null })
    assert.equal(birthdayInfo('1990-11-10', '2026-11-10').soon, 'Cumple hoy')
    assert.equal(birthdayInfo('1990-11-10', '2026-11-10').age, 36)
    assert.equal(birthdayInfo('1990-11-11', '2026-11-10').soon, 'Cumple mañana')
    assert.equal(birthdayInfo('1990-11-11', '2026-11-10').age, 35)
    assert.equal(birthdayInfo('1990-11-15', '2026-11-10').soon, 'Cumple en 5 días')
    assert.equal(birthdayInfo('1990-01-02', '2026-12-30').soon, 'Cumple en 3 días', 'cruza el año')
    assert.equal(birthdayInfo('2000-02-29', '2027-02-28').soon, 'Cumple hoy', '29 de febrero en año no bisiesto')
    assert.equal(birthdayInfo(null, '2026-11-10'), null)
})

test('buscar por nombre sin tildes ni orden', () => {
    assert.ok(nameMatches('Pablo Berrogaín Ruiz', 'berrogain pablo'))
    assert.ok(nameMatches('Lucía Sanz', 'LUCIA'))
    assert.ok(!nameMatches('Lucía Sanz', 'lucia perez'))
})

const clients = [
    { id: 'a', fullName: 'Ana', professionalIds: ['yo'] },
    { id: 'b', fullName: 'Bea', professionalIds: ['otro'] },
    { id: 'c', fullName: 'Carla', professionalIds: [] },
]

test('mis clientes o todo el centro', () => {
    assert.deepEqual(visibleClients(clients, { scope: 'mine', userId: 'yo' }).map(client => client.id), ['a', 'c'])
    assert.deepEqual(visibleClients(clients, { scope: 'all', userId: 'yo' }).map(client => client.id), ['a', 'b', 'c'])
    assert.deepEqual(visibleClients(clients, { query: 'be', scope: 'all' }).map(client => client.id), ['b'])
    assert.equal(defaultScope(clients, 'yo'), 'mine')
    assert.equal(defaultScope(clients, 'nadie'), 'all')
    assert.equal(defaultScope(clients, null), 'all')
})

test('objetivos limpios', () => {
    assert.deepEqual(cleanObjectives([' Bajar  peso ', '', '  ', 'Correr 10 km']), ['Bajar peso', 'Correr 10 km'])
    assert.equal(cleanObjectives(Array.from({ length: 20 }, (_, index) => `Objetivo ${index}`)).length, 12)
    assert.equal(cleanObjectives(['x'.repeat(300)])[0].length, 200)
})

test('por qué se parece', () => {
    assert.equal(duplicateText({ reason: 'email', active: false, professionals: ['Marcos'] }), 'mismo email · de baja · lo lleva Marcos')
    assert.equal(duplicateText({ reason: 'name', active: true, professionals: [] }), 'mismo nombre · sin profesional')
})
