import assert from 'node:assert/strict'
import test from 'node:test'

import { getVisibleMonthDayItems } from '../src/lib/calendar/month-day-items.js'

const events = Array.from({ length: 5 }, (_, index) => ({ id: `event-${index + 1}` }))
const tasks = Array.from({ length: 3 }, (_, index) => ({ id: `task-${index + 1}` }))

test('shows up to four calendar events before tasks in month cells', () => {
    const result = getVisibleMonthDayItems(events, tasks)

    assert.deepEqual(result.visibleEvents.map((event) => event.id), [
        'event-1',
        'event-2',
        'event-3',
        'event-4',
    ])
    assert.deepEqual(result.visibleTasks, [])
    assert.equal(result.hiddenItemCount, 4)
})

test('fills empty event slots with tasks', () => {
    const result = getVisibleMonthDayItems(events.slice(0, 2), tasks)

    assert.deepEqual(result.visibleEvents.map((event) => event.id), ['event-1', 'event-2'])
    assert.deepEqual(result.visibleTasks.map((task) => task.id), ['task-1', 'task-2'])
    assert.equal(result.hiddenItemCount, 1)
})
