import test from 'node:test'
import assert from 'node:assert/strict'
import {
    adjustOptionToTarget,
    compareToTarget,
    defaultEquivalenceBasis,
    equivalentGrams,
    itemMacros,
    optionTotals,
    roundGrams,
    syncAlternatives,
    toGrams,
} from '../src/lib/nutrition/diet-macros.js'

// Valores de la tabla `foods` (por 100 g)
const arroz = { kcal: 360, protein_g: 7, carbs_g: 78, fat_g: 0.7, serving_size_g: 100, food_group: 'carbs' }
const pasta = { kcal: 350, protein_g: 12, carbs_g: 72, fat_g: 1.5, serving_size_g: 100, food_group: 'carbs' }
const patata = { kcal: 77, protein_g: 2, carbs_g: 17.5, fat_g: 0.1, serving_size_g: 100, food_group: 'carbs' }
const pollo = { kcal: 110, protein_g: 23, carbs_g: 0, fat_g: 1.5, serving_size_g: 100, food_group: 'protein' }
const aceite = { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100, serving_size_g: 100, food_group: 'fat' }
const huevo = { kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, serving_size_g: 100, unit_weight_g: 60, food_group: 'protein' }
const verdura = { kcal: 30, protein_g: 2, carbs_g: 5, fat_g: 0.3, serving_size_g: 100, food_group: 'vegetable' }

test('converts written quantities to grams', () => {
    assert.equal(toGrams(100, 'gr', arroz), 100)
    assert.equal(toGrams(15, 'ml', aceite), 15)
    assert.equal(toGrams(2, 'unidad', huevo), 120)
    assert.equal(toGrams(2, 'uds', huevo), 120)
    assert.equal(toGrams(1, 'libre', verdura), null)
    assert.equal(toGrams(1, 'unidad', arroz), null, 'sin peso por unidad no se puede medir')
    assert.equal(toGrams(null, 'g', arroz), null)
})

test('computes item macros from the food per-serving values', () => {
    assert.deepEqual(itemMacros({ food: arroz, quantity_g: 80 }), { kcal: 288, protein_g: 5.6, carbs_g: 62.4, fat_g: 0.6 })
    assert.equal(itemMacros({ food: null, quantity_g: 100 }), null)
    assert.equal(itemMacros({ food: verdura, quantity_g: null }), null)
})

test('option totals skip alternatives and count free-text items apart', () => {
    const totals = optionTotals([
        { food: arroz, quantity_g: 100, alternative_group: 1 },
        { food: pasta, quantity_g: 100, alternative_group: 1, is_alternative: true },
        { food: pollo, quantity_g: 150 },
        { food: verdura, quantity_g: null },
    ])
    assert.equal(totals.kcal, 360 + 165)
    assert.equal(totals.protein_g, 7 + 34.5)
    assert.equal(totals.uncounted, 1)
})

test('picks the equivalence macro from the food group', () => {
    assert.equal(defaultEquivalenceBasis(arroz), 'carbs')
    assert.equal(defaultEquivalenceBasis(pollo), 'protein')
    assert.equal(defaultEquivalenceBasis(aceite), 'fat')
    assert.equal(defaultEquivalenceBasis(verdura), 'kcal')
    assert.equal(defaultEquivalenceBasis({ ...pollo, food_group: null }), 'protein')
})

test('equivalent grams match the reference carbs', () => {
    // 100 g arroz = 78 g HC → pasta 72 g/100 → 108 g → redondeo a 110
    assert.equal(equivalentGrams(arroz, 100, pasta), 110)
    // 78 g HC en patata (17,5/100) → 446 g → 445
    assert.equal(equivalentGrams(arroz, 100, patata), 445)
    assert.equal(equivalentGrams(arroz, 100, aceite), null, 'el aceite no tiene HC')
})

test('rounds grams to sensible steps or half units', () => {
    assert.equal(roundGrams(108.4, pasta), 110)
    assert.equal(roundGrams(12.6, aceite), 13)
    assert.equal(roundGrams(0.4, aceite), 1)
    assert.equal(roundGrams(170, huevo, { preferUnits: true }), 180, '2,8 huevos → 3 huevos')
    assert.equal(roundGrams(0, arroz), 0)
})

test('syncs alternatives from their reference item', () => {
    const synced = syncAlternatives([
        { id: 'a', food: arroz, quantity_g: 80, alternative_group: 1 },
        { id: 'b', food: pasta, quantity_g: 999, alternative_group: 1, is_alternative: true },
        { id: 'c', food: patata, quantity_g: 999, alternative_group: 1, is_alternative: true, locked: true },
    ])
    assert.equal(synced[1].quantity_g, 85) // 62,4 g HC / 0,72
    assert.equal(synced[2].quantity_g, 999, 'las bloqueadas no se tocan')
})

test('compares totals against the meal target with tolerances', () => {
    const { byMacro, status } = compareToTarget(
        { kcal: 600, protein_g: 40, carbs_g: 70, fat_g: 30 },
        { kcal: 610, protein_g: 40, carbs_g: 60, fat_g: null }
    )
    assert.equal(byMacro.kcal.status, 'ok')
    assert.equal(byMacro.protein_g.status, 'ok')
    assert.equal(byMacro.carbs_g.status, 'off') // +10 g sobre 60 = 16,7 %
    assert.equal(byMacro.fat_g, undefined)
    assert.equal(status, 'off')
    assert.equal(compareToTarget({ kcal: 500, protein_g: 0, carbs_g: 0, fat_g: 0 }, null).status, 'none')
})

test('adjusts an option close to the meal target keeping fixed items', () => {
    const items = [
        { id: 'arroz', food: arroz, quantity_g: 100, alternative_group: 1 },
        { id: 'pasta', food: pasta, quantity_g: 110, alternative_group: 1, is_alternative: true },
        { id: 'pollo', food: pollo, quantity_g: 120 },
        { id: 'aceite', food: aceite, quantity_g: 10, locked: true },
        { id: 'verdura', food: verdura, quantity_g: null },
    ]
    const target = { protein_g: 50, carbs_g: 60, fat_g: 15 }
    const { items: adjusted, totals, changed } = adjustOptionToTarget(items, target)

    assert.equal(changed, true)
    assert.equal(adjusted.find(i => i.id === 'aceite').quantity_g, 10, 'el bloqueado no cambia')
    assert.equal(adjusted.find(i => i.id === 'verdura').quantity_g, null)
    assert.ok(Math.abs(totals.protein_g - 50) <= 4, `proteína ${totals.protein_g}`)
    assert.ok(Math.abs(totals.carbs_g - 60) <= 6, `hidratos ${totals.carbs_g}`)

    // La pasta sigue siendo equivalente al arroz ajustado
    const arrozG = adjusted.find(i => i.id === 'arroz').quantity_g
    const pastaG = adjusted.find(i => i.id === 'pasta').quantity_g
    assert.equal(pastaG, equivalentGrams(arroz, arrozG, pasta))
})

test('adjusting with only a kcal target scales every adjustable item', () => {
    const items = [
        { id: 'arroz', food: arroz, quantity_g: 100 },
        { id: 'pollo', food: pollo, quantity_g: 100 },
    ]
    const { totals } = adjustOptionToTarget(items, { kcal: 940 })
    assert.ok(Math.abs(totals.kcal - 940) <= 30, `kcal ${totals.kcal}`)
})

test('adjusting respects scale limits and leaves impossible targets close', () => {
    const items = [{ id: 'pollo', food: pollo, quantity_g: 100 }]
    // 300 g de proteína pedirían 13 veces más pollo: se queda en el límite (x3)
    const { items: adjusted } = adjustOptionToTarget(items, { protein_g: 300 })
    assert.equal(adjusted[0].quantity_g, 300)
})

test('adjusting without targets or adjustable items is a no-op', () => {
    const items = [{ id: 'pollo', food: pollo, quantity_g: 100, locked: true }]
    assert.equal(adjustOptionToTarget(items, { protein_g: 40 }).changed, false)
    assert.equal(adjustOptionToTarget(items, {}).changed, false)
})

test('unit-based foods round to whole units and gram foods compensate', () => {
    const pan = { kcal: 247, protein_g: 13, carbs_g: 41, fat_g: 4.2, serving_size_g: 100, food_group: 'carbs' }
    const items = [
        { id: 'huevo', food: huevo, quantity_g: 120, unit_based: true },
        { id: 'pan', food: pan, quantity_g: 80 },
    ]
    const { items: adjusted, totals } = adjustOptionToTarget(items, { protein_g: 30, carbs_g: 45 })
    const eggs = adjusted.find(i => i.id === 'huevo').quantity_g / 60
    assert.equal(eggs, Math.round(eggs), `huevos enteros (${eggs})`)
    assert.ok(Math.abs(totals.carbs_g - 45) <= 6, `hidratos ${totals.carbs_g}`)
})
