import assert from 'node:assert/strict'
import test from 'node:test'
import {
    cleanExerciseName,
    pickPossibleDuplicate,
    validateNewExercise,
} from '../src/lib/training/exercise-catalog-rules.js'

test('limpia espacios del nombre', () => {
    assert.equal(cleanExerciseName('  Press   banca '), 'Press banca')
})

test('valida los datos mínimos', () => {
    assert.equal(validateNewExercise({ name: 'Remo', laterality: 'unilateral', equipment: ['polea'] }), null)
    assert.match(validateNewExercise({ name: ' a ', laterality: 'bilateral' }), /nombre/)
    assert.match(validateNewExercise({ name: 'Remo', laterality: 'otra' }), /lateralidad/)
    assert.match(validateNewExercise({ name: 'Remo', laterality: 'alterno', equipment: ['nada'] }), /material/)
})

test('solo marca como posible duplicado lo muy parecido', () => {
    assert.equal(pickPossibleDuplicate([]), null)
    assert.equal(pickPossibleDuplicate(null), null)
    assert.equal(pickPossibleDuplicate([{ id: 'a', score: 0.61 }]), null)
    assert.equal(pickPossibleDuplicate([{ id: 'a', score: 0.61 }, { id: 'b', score: 0.8 }]).id, 'b')
})
