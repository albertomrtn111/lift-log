import assert from 'node:assert/strict'
import test from 'node:test'
import {
    LIBRARY_TEMPLATES,
    cleanOptionalText,
    mergeBlocks,
    moveInList,
    parseDefaultSets,
    parseLibraryFields,
    presetIds,
    selectionState,
    setManySelected,
    sortEntries,
    sortOrderFor,
    swapInList,
} from '../src/lib/training/workspace-library-rules.js'

test('el texto opcional vacío es null', () => {
    assert.equal(cleanOptionalText('   '), null)
    assert.equal(cleanOptionalText(null), null)
    assert.equal(cleanOptionalText('  Mancuerna  '), 'Mancuerna')
})

test('series por defecto', () => {
    assert.equal(parseDefaultSets(''), null)
    assert.equal(parseDefaultSets('3'), 3)
    assert.equal(parseDefaultSets(0), undefined)
    assert.equal(parseDefaultSets('2.5'), undefined)
    assert.equal(parseDefaultSets(21), undefined)
})

test('valida los campos de la biblioteca', () => {
    assert.deepEqual(parseLibraryFields({ name: ' Banca ', title: '', sets: '3', reps: ' 8-10 ' }), {
        values: { name: 'Banca', title: null, sets: 3, reps: '8-10' },
    })
    assert.match(parseLibraryFields({ name: 'x'.repeat(61) }).error, /nombre/)
    assert.match(parseLibraryFields({ title: 'x'.repeat(61) }).error, /título/)
    assert.match(parseLibraryFields({ reps: 'x'.repeat(21) }).error, /repeticiones/)
    assert.match(parseLibraryFields({ sets: 99 }).error, /series/)
})

test('los bloques usan los cambios del espacio y su orden', () => {
    const common = [
        { key: 'a', name: 'A', sort_order: 10 },
        { key: 'b', name: 'B', sort_order: 20 },
        { key: 'c', name: 'C', sort_order: 30 },
    ]
    const merged = mergeBlocks(common, [{ block_key: 'c', sort_order: 5, display_name: 'Propio', is_hidden: true }])
    assert.deepEqual(merged.map(block => block.key), ['c', 'a', 'b'])
    assert.equal(merged[0].displayName, 'Propio')
    assert.equal(merged[0].isHidden, true)
    assert.equal(merged[1].displayName, 'A')
})

test('primero el orden manual, después por nombre', () => {
    const sorted = sortEntries([
        { name: 'Zeta', sortOrder: null },
        { name: 'Beta', sortOrder: 20 },
        { name: 'Alfa', sortOrder: null },
        { name: 'Gamma', sortOrder: 10 },
    ])
    assert.deepEqual(sorted.map(entry => entry.name), ['Gamma', 'Beta', 'Alfa', 'Zeta'])
})

test('mover y cambiar de sitio', () => {
    assert.deepEqual(moveInList(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
    assert.deepEqual(moveInList(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c'])
    assert.deepEqual(moveInList(['a', 'b'], 'x', 1), ['a', 'b'])
    assert.deepEqual(swapInList(['a', 'b', 'c', 'd'], 'a', 'c'), ['c', 'b', 'a', 'd'])
    assert.equal(sortOrderFor(0), 10)
    assert.equal(sortOrderFor(2), 30)
})

test('las plantillas no repiten bloques', () => {
    for (const template of Object.values(LIBRARY_TEMPLATES)) {
        assert.equal(new Set(template.blocks).size, template.blocks.length)
    }
})

test('estado de la selección de un grupo', () => {
    assert.equal(selectionState(['a', 'b'], new Set()), 'none')
    assert.equal(selectionState(['a', 'b'], new Set(['a'])), 'some')
    assert.equal(selectionState(['a', 'b'], new Set(['a', 'b', 'c'])), 'all')
})

test('marcar y desmarcar un grupo no toca lo demás', () => {
    const marked = setManySelected(new Set(['x']), ['a', 'b'], true)
    assert.deepEqual([...marked].sort(), ['a', 'b', 'x'])
    assert.deepEqual([...setManySelected(marked, ['a', 'b'], false)], ['x'])
})

test('los atajos solo usan ejercicios predefinidos', () => {
    const exercises = [
        { id: 'a', is_predefined: true, block_key: 'biceps' },
        { id: 'b', is_predefined: true, block_key: 'core_antiextension' },
        { id: 'c', is_predefined: false, block_key: 'biceps' },
    ]
    assert.deepEqual(presetIds(exercises), ['a', 'b'])
    assert.deepEqual(presetIds(exercises, 'gimnasio'), ['a'])
    assert.deepEqual(presetIds(exercises, 'funcional'), ['b'])
})
