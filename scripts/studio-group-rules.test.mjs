import assert from 'node:assert/strict'
import test from 'node:test'
import {
    changedPeople,
    groupCellLine,
    itemForPerson,
    peopleLines,
    personFields,
    personForm,
    scheduleLabel,
    sortGroups,
} from '../src/lib/studio/group-rules.js'

const item = { id: 'i', session_id: 's', load_kg: '20.00', reps: '10', rir: null, rpe: null, time_seconds: null, next_load: null }
const attendance = [
    { session_id: 's', client_id: 'a', status: 'attended' },
    { session_id: 's', client_id: 'b', status: 'attended' },
    { session_id: 's', client_id: 'c', status: 'absent' },
    { session_id: 'otra', client_id: 'a', status: 'attended' },
]
const people = [{ item_id: 'i', client_id: 'b', load_kg: '30.00', reps: null, rir: null, rpe: null }]

test('el horario se lee de corrido', () => {
    assert.equal(scheduleLabel([{ weekday: 1, time: '18:00' }, { weekday: 3, time: '19:00' }]), 'martes 18:00, jueves 19:00')
    assert.equal(scheduleLabel([]), '')
})

test('la celda resume el rango de cargas y quién lo hizo', () => {
    assert.equal(groupCellLine(item, attendance, people), '20–30 kg · 2/3')
    assert.equal(groupCellLine(item, attendance, []), '20 kg · 2/3')
})

test('antes de pasar lista el rango sale de quien puede venir', () => {
    const pending = [{ session_id: 's', client_id: 'a', status: 'unmarked' }, { session_id: 's', client_id: 'b', status: 'unmarked' }]
    assert.equal(groupCellLine(item, pending, people), '20–30 kg · 0/2')
})

test('solo salen las personas con valores propios', () => {
    assert.deepEqual(peopleLines(item, [...people, { item_id: 'i', client_id: 'a', load_kg: null, reps: null }], { b: 'Luis' }), ['Luis: 30 kg'])
})

test('lo vacío de una persona hereda lo general', () => {
    const { fields } = personFields({ loadKg: '32,5', reps: '', rir: '', rpe: '' })
    assert.deepEqual(fields, { load_kg: 32.5, reps: null, rir: null, rpe: null })
    assert.match(personFields({ loadKg: '', reps: '', rir: '11', rpe: '' }).error, /RIR/)
})

test('solo se guarda a quien ha cambiado', () => {
    const rows = [
        { clientId: 'a', form: personForm(null) },
        { clientId: 'b', form: { ...personForm(people[0]), loadKg: '35' } },
    ]
    assert.deepEqual(changedPeople(rows, people).map(row => row.clientId), ['b'])
    assert.deepEqual(changedPeople([{ clientId: 'b', form: personForm(people[0]) }], people), [])
})

test('en su cuadrícula cada persona ve lo suyo', () => {
    assert.equal(itemForPerson(item, people[0]).load_kg, '30.00')
    assert.equal(itemForPerson(item, people[0]).reps, '10')
    assert.equal(itemForPerson(item, undefined), item)
})

test('primero mis grupos y sin los archivados', () => {
    const groups = [
        { name: 'A', is_active: true, professional_ids: [] },
        { name: 'B', is_active: true, professional_ids: ['yo'] },
        { name: 'C', is_active: false, professional_ids: ['yo'] },
    ]
    assert.deepEqual(sortGroups(groups, 'yo').map(group => group.name), ['B', 'A'])
})
