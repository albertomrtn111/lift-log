import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPlanningEventContext } from '../src/lib/ai/planning-event-context.js'

test('buildPlanningEventContext includes days and weeks until upcoming events', () => {
  const context = buildPlanningEventContext({
    weekStart: '2026-05-18',
    weekEnd: '2026-05-24',
    events: [
      {
        title: 'Maraton Valencia',
        event_date: '2026-05-31',
        event_type: 'race',
        priority: 'a',
        location: 'Valencia',
        target: 'Llegar fresco',
        notes: 'Semana de taper',
      },
    ],
  })

  assert.deepEqual(context, [
    {
      title: 'Maraton Valencia',
      date: '2026-05-31',
      type: 'race',
      priority: 'a',
      location: 'Valencia',
      target: 'Llegar fresco',
      notes: 'Semana de taper',
      daysUntilFromWeekStart: 13,
      weeksUntilFromWeekStart: 1.9,
      daysAfterWeekEnd: 7,
      timingLabel: 'Faltan 13 dias (1.9 semanas) desde el inicio de esta semana. Queda 7 dias despues de cerrar la semana visible.',
    },
  ])
})

test('buildPlanningEventContext marks events inside the visible week', () => {
  const context = buildPlanningEventContext({
    weekStart: '2026-05-18',
    weekEnd: '2026-05-24',
    events: [
      {
        title: 'Test 10K',
        event_date: '2026-05-22',
        event_type: 'test',
        priority: 'b',
        location: null,
        target: null,
        notes: null,
      },
    ],
  })

  assert.equal(context[0].daysUntilFromWeekStart, 4)
  assert.equal(context[0].weeksUntilFromWeekStart, 0.6)
  assert.equal(context[0].daysAfterWeekEnd, -2)
  assert.equal(context[0].timingLabel, 'Evento dentro de la semana visible: faltan 4 dias (0.6 semanas) desde el inicio.')
})
