import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildEventTiming,
    formatContextSections,
    takeRecentChatMessages,
} from '../src/lib/ai/nextia-context-format.js'

test('keeps only the latest chat messages in chronological order', () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `mensaje ${index + 1}`,
        created_at: `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    }))

    const recent = takeRecentChatMessages(messages, 12)

    assert.equal(recent.length, 12)
    assert.equal(recent[0].content, 'mensaje 3')
    assert.equal(recent[11].content, 'mensaje 14')
})

test('computes event timing from a reference date', () => {
    const timing = buildEventTiming('2026-05-18', '2026-06-14')

    assert.equal(timing.daysUntil, 27)
    assert.equal(timing.weeksUntil, 3.9)
    assert.equal(timing.label, 'Faltan 27 dias (3.9 semanas)')
})

test('formats compact context sections and skips empty sections', () => {
    const text = formatContextSections([
        { title: 'Perfil atleta', content: 'Resumen util' },
        { title: 'Vacio', content: '' },
        { title: 'Eventos', content: '- Maraton: faltan 27 dias' },
    ])

    assert.match(text, /## Perfil atleta\nResumen util/)
    assert.doesNotMatch(text, /Vacio/)
    assert.match(text, /## Eventos\n- Maraton/)
})
