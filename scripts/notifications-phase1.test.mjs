import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCheckinReceivedCopy, buildOnboardingCompletedCopy, formatNameList } from '../src/lib/notifications/coach-copy.js'
import { addDaysToDateKey, buildReviewReminderCopy, planReviewReminder, reviewReminderKey } from '../src/lib/reviews/reminder-plan.js'
import { notificationMatchesLocation } from '../src/lib/notifications/auto-read.js'

test('formats athlete name lists in Spanish', () => {
  assert.equal(formatNameList([]), '')
  assert.equal(formatNameList(['Ana']), 'Ana')
  assert.equal(formatNameList(['Ana', 'Luis']), 'Ana y Luis')
  assert.equal(formatNameList(['Ana', 'Luis', 'Marta']), 'Ana, Luis y Marta')
  assert.equal(formatNameList(['Ana', 'Luis', 'Marta', 'Pablo', 'Eva']), 'Ana, Luis, Marta y 2 más')
  assert.equal(formatNameList([' Ana ', null, '']), 'Ana')
})

test('one submitted review names the athlete and says whether the AI draft is ready', () => {
  assert.deepEqual(buildCheckinReceivedCopy(['Ana García'], { aiReady: true }), {
    title: 'Ana ha respondido su revisión',
    body: 'El borrador de IA está listo para validar.',
  })
  assert.equal(buildCheckinReceivedCopy(['Ana García']).body, 'Ábrela para revisarla y enviarle tu feedback.')
  assert.equal(buildCheckinReceivedCopy([null]).title, 'Un atleta ha respondido su revisión')
})

test('several submitted reviews are grouped in one notice', () => {
  assert.deepEqual(buildCheckinReceivedCopy(['Ana García', 'Luis Pérez', 'Marta Ruiz']), {
    title: '3 revisiones nuevas',
    body: 'Ana García, Luis Pérez y Marta Ruiz',
  })
  // Dos revisiones del mismo atleta cuentan dos, pero el nombre sale una vez.
  assert.deepEqual(buildCheckinReceivedCopy(['Ana', 'Ana'], { aiReady: true }), {
    title: '2 revisiones nuevas',
    body: 'Ana. La última ya tiene borrador de IA.',
  })
})

test('onboarding completed copy uses the first name', () => {
  assert.equal(buildOnboardingCompletedCopy('Luis Pérez').title, 'Luis ha completado su formulario inicial')
})

const now = new Date('2026-11-10T08:00:00Z') // 09:00 en Madrid
const today = '2026-11-10'

test('adds days to a date key across month ends', () => {
  assert.equal(addDaysToDateKey('2026-10-31', 1), '2026-11-01')
  assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01')
})

test('no reminder before 20 hours', () => {
  assert.equal(planReviewReminder({ createdAt: '2026-11-10T08:00:00Z', now, today, archiveDate: '2026-11-17' }), null)
})

test('first reminder the day after the review was sent', () => {
  assert.deepEqual(
    planReviewReminder({ createdAt: '2026-11-09T08:00:00Z', now, today, archiveDate: '2026-11-16' }),
    { stage: 1, final: false, archivesTomorrow: false },
  )
})

test('final reminder the day before the review is archived', () => {
  assert.deepEqual(
    planReviewReminder({ createdAt: '2026-11-04T08:00:00Z', now, today, archiveDate: '2026-11-11', stageSent: 1, lastSentDay: '2026-11-05' }),
    { stage: 2, final: true, archivesTomorrow: true },
  )
})

test('a review that is archived tomorrow skips straight to the final reminder', () => {
  assert.deepEqual(
    planReviewReminder({ createdAt: '2026-11-09T08:00:00Z', now, today, archiveDate: '2026-11-11' }),
    { stage: 2, final: true, archivesTomorrow: true },
  )
})

test('at most one reminder a day and two in total', () => {
  assert.equal(planReviewReminder({ createdAt: '2026-11-04T08:00:00Z', now, today, archiveDate: '2026-11-11', stageSent: 1, lastSentDay: today }), null)
  assert.equal(planReviewReminder({ createdAt: '2026-11-04T08:00:00Z', now, today, archiveDate: '2026-11-11', stageSent: 2 }), null)
})

test('between the first reminder and the eve of archiving, nothing is sent', () => {
  assert.equal(planReviewReminder({ createdAt: '2026-11-07T08:00:00Z', now, today, archiveDate: '2026-11-14', stageSent: 1, lastSentDay: '2026-11-08' }), null)
})

test('unscheduled reviews get the final reminder after three days', () => {
  assert.equal(planReviewReminder({ createdAt: '2026-11-08T09:00:00Z', now, today, stageSent: 1, lastSentDay: '2026-11-09' }), null)
  assert.deepEqual(
    planReviewReminder({ createdAt: '2026-11-07T08:00:00Z', now, today, stageSent: 1, lastSentDay: '2026-11-08' }),
    { stage: 2, final: true, archivesTomorrow: false },
  )
})

test('reminder copy reflects the stage and the template name', () => {
  assert.deepEqual(buildReviewReminderCopy({ final: false, archivesTomorrow: false, templateName: 'Revisión semanal' }), {
    title: 'Tienes una revisión pendiente',
    body: 'Revisión semanal: tu entrenador la necesita para ajustar tu plan.',
  })
  assert.deepEqual(buildReviewReminderCopy({ final: true, archivesTomorrow: true }), {
    title: 'Último día para enviar tu revisión',
    body: 'Mañana se archiva y tu entrenador no podrá revisarla.',
  })
  assert.equal(buildReviewReminderCopy({ final: true, archivesTomorrow: false }).title, 'Tu revisión sigue pendiente')
  assert.equal(reviewReminderKey('abc', 2), 'review-reminder:abc:2')
})

test('notifications are seen when the athlete is on their screen', () => {
  assert.equal(notificationMatchesLocation('/chat', '/chat'), true)
  assert.equal(notificationMatchesLocation('/routine', '/chat'), false)
  assert.equal(notificationMatchesLocation(null, '/chat'), false)
})

test('a review notice is only seen when that review is open', () => {
  const url = '/summary?tab=revisiones&checkin=c1'
  assert.equal(notificationMatchesLocation(url, '/summary', '?tab=revisiones&checkin=c1'), true)
  assert.equal(notificationMatchesLocation(url, '/summary', 'tab=revisiones'), false)
  assert.equal(notificationMatchesLocation(url, '/summary', ''), false)
})

test('a tab notice is not seen from another tab', () => {
  const url = '/diet?tab=supplements&date=2026-11-10'
  assert.equal(notificationMatchesLocation(url, '/diet', 'tab=supplements'), true)
  assert.equal(notificationMatchesLocation(url, '/diet', ''), true)
  assert.equal(notificationMatchesLocation(url, '/diet', 'tab=plan'), false)
})
