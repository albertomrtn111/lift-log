import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrainingEventContext } from '../src/lib/ai/training-event-context.js'

test('buildTrainingEventContext reports days and weeks until future event', () => {
  const context = buildTrainingEventContext({
    referenceDate: '2026-05-18',
    events: [
      {
        title: 'Maraton Valencia',
        event_date: '2026-06-14',
        event_type: 'race',
        priority: 'a',
        location: 'Valencia',
        target: 'Sub 3h30',
        notes: 'Objetivo principal',
      },
    ],
  })

  assert.deepEqual(context, [
    {
      title: 'Maraton Valencia',
      date: '2026-06-14',
      type: 'race',
      priority: 'a',
      location: 'Valencia',
      target: 'Sub 3h30',
      notes: 'Objetivo principal',
      daysUntil: 27,
      weeksUntil: 3.9,
      timingLabel: 'Faltan 27 dias (3.9 semanas) desde hoy.',
    },
  ])
})
