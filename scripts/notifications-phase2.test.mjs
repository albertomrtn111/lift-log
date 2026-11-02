import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCoachDigest, daysBetweenKeys, trainingProgramEndDate } from '../src/lib/notifications/coach-digest-content.js'
import { buildAthleteJoinedCopy, buildCoachMessageCopy } from '../src/lib/notifications/coach-copy.js'

const empty = {
  reviewsToValidate: [],
  reviewsUnanswered: [],
  messagesUnanswered: [],
  expiring: [],
  tasksToday: [],
  reviewsGoingOut: [],
}

test('an empty day produces no digest', () => {
  const digest = buildCoachDigest(empty)
  assert.equal(digest.total, 0)
  assert.equal(digest.sections.length, 0)
  assert.equal(digest.headline, 'Todo al día')
})

test('the digest lists what needs action first, with a short headline', () => {
  const digest = buildCoachDigest({
    ...empty,
    reviewsToValidate: [
      { clientId: 'a', name: 'Ana', aiReady: true },
      { clientId: 'b', name: 'Luis', aiReady: false },
    ],
    messagesUnanswered: [{ clientId: 'c', name: 'Marta', hours: 50 }],
    reviewsGoingOut: [{ clientId: 'd', name: 'Pablo' }],
  })

  assert.equal(digest.total, 4)
  assert.equal(digest.headline, '2 revisiones por validar · 1 mensaje sin contestar')
  assert.deepEqual(digest.sections.map((s) => s.key), ['reviews-to-validate', 'messages-unanswered', 'reviews-going-out'])
  assert.equal(digest.sections[0].title, 'Revisiones por validar (2, 1 con borrador de IA)')
  assert.equal(digest.sections[1].items[0].detail, 'Esperando desde hace 2 días')
})

test('only reviews going out still produce a digest', () => {
  const digest = buildCoachDigest({ ...empty, reviewsGoingOut: [{ clientId: 'd', name: 'Pablo' }] })
  assert.equal(digest.total, 1)
  assert.equal(digest.headline, 'Hoy sale 1 revisión')
})

test('expiring plans are sorted by urgency with a readable deadline', () => {
  const digest = buildCoachDigest({
    ...empty,
    expiring: [
      { clientId: 'a', name: 'Ana', what: 'Plan de macros', endDate: '2026-11-15', daysLeft: 5 },
      { clientId: 'b', name: 'Luis', what: 'Programa «Fuerza»', endDate: '2026-11-08', daysLeft: -2 },
      { clientId: 'c', name: 'Marta', what: 'Objetivo «10K»', endDate: '2026-11-11', daysLeft: 1 },
    ],
  })
  assert.deepEqual(digest.sections[0].items.map((i) => i.detail), [
    'Programa «Fuerza»: venció hace 2 días',
    'Objetivo «10K»: vence mañana',
    'Plan de macros: vence en 5 días',
  ])
})

test('tasks show overdue ones in the title', () => {
  const digest = buildCoachDigest({
    ...empty,
    tasksToday: [
      { title: 'Llamar a Ana', clientName: 'Ana', overdue: true },
      { title: 'Preparar bloque', clientName: null, overdue: false },
    ],
  })
  assert.equal(digest.sections[0].title, 'Tareas de hoy (2, 1 vencidas)')
  assert.equal(digest.sections[0].items[0].detail, 'Vencida · Ana')
  assert.equal(digest.sections[0].items[1].detail, '')
})

test('date helpers', () => {
  assert.equal(daysBetweenKeys('2026-10-30', '2026-11-02'), 3)
  assert.equal(trainingProgramEndDate({ effective_from: '2026-11-02', total_weeks: 4 }), '2026-11-29')
  assert.equal(trainingProgramEndDate({ effective_from: '2026-11-02', total_weeks: 4, effective_to: '2026-11-20' }), '2026-11-20')
  assert.equal(trainingProgramEndDate({ effective_from: null, total_weeks: null }), null)
})

test('coach message copy groups unread messages per athlete', () => {
  assert.deepEqual(buildCoachMessageCopy('Ana García', 1, 'Hola'), { title: 'Mensaje de Ana García', body: 'Hola' })
  assert.equal(buildCoachMessageCopy('Ana García', 3, 'Hola').title, 'Ana García · 3 mensajes nuevos')
  assert.equal(buildCoachMessageCopy(null, 2, 'Hola').title, 'Un atleta · 2 mensajes nuevos')
  assert.equal(buildAthleteJoinedCopy('Luis Pérez').title, 'Luis ya ha entrado en NexTrain')
})
