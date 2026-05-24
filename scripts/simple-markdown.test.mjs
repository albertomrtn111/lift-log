import test from 'node:test'
import assert from 'node:assert/strict'
import {
    getMarkdownLineKind,
    tokenizeBoldMarkdown,
} from '../src/lib/markdown/simple-markdown.js'

test('tokenizes markdown bold segments without losing surrounding text', () => {
    const tokens = tokenizeBoldMarkdown('Ajuste de **Sueño**: bajar de 7h es riesgo.')

    assert.deepEqual(tokens, [
        { text: 'Ajuste de ', bold: false },
        { text: 'Sueño', bold: true },
        { text: ': bajar de 7h es riesgo.', bold: false },
    ])
})

test('keeps unmatched markdown markers as plain text', () => {
    const tokens = tokenizeBoldMarkdown('Texto con **negrita sin cerrar')

    assert.deepEqual(tokens, [
        { text: 'Texto con **negrita sin cerrar', bold: false },
    ])
})

test('detects bullet and numbered markdown lines', () => {
    assert.deepEqual(getMarkdownLineKind('* **Hito:** texto'), {
        type: 'bullet',
        content: '**Hito:** texto',
    })
    assert.deepEqual(getMarkdownLineKind('3. **Fuerza:** texto'), {
        type: 'numbered',
        marker: '3.',
        content: '**Fuerza:** texto',
    })
})
