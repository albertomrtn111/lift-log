import test from 'node:test'
import assert from 'node:assert/strict'

const { autofitCarbs, isBalanced, kcalGap, macroKcal, withAutofitCarbs } = await import('../src/lib/nutrition/macro-autofit.ts')

test('los carbos completan las kcal que dejan proteína y grasa', () => {
    // 2000 - 150·4 - 70·9 = 770 kcal → 192,5 g → 193
    assert.deepEqual(autofitCarbs({ kcal: 2000, protein: 150, fat: 70 }), { carbs: 193, overflowKcal: 0 })
    assert.equal(withAutofitCarbs({ kcal: 2500, protein: 180, carbs: 0, fat: 80 }).carbs, 265)
})

test('si proteína y grasa superan las kcal, carbos a 0 y se informa del exceso', () => {
    assert.deepEqual(autofitCarbs({ kcal: 1000, protein: 200, fat: 50 }), { carbs: 0, overflowKcal: 250 })
})

test('valores vacíos o negativos no rompen el cálculo', () => {
    assert.deepEqual(autofitCarbs({ kcal: Number.NaN, protein: -5, fat: 0 }), { carbs: 0, overflowKcal: 0 })
    assert.equal(macroKcal({ protein: 100, carbs: 100, fat: 10 }), 890)
})

test('detecta si las kcal cuadran con los macros', () => {
    assert.equal(isBalanced({ kcal: 2000, protein: 150, carbs: 193, fat: 70 }), true)
    assert.equal(kcalGap({ kcal: 2500, protein: 150, carbs: 250, fat: 70 }), -270)
    assert.equal(isBalanced({ kcal: 2500, protein: 150, carbs: 250, fat: 70 }), false)
})
