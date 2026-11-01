import assert from 'node:assert/strict'
import test from 'node:test'

import { resyncOnResubscribe, uniqueChannelName } from '../src/lib/realtime.js'

test('uniqueChannelName never repeats a name, so a closing channel is never reused', () => {
  const first = uniqueChannelName('coach-messages:c1:a1')
  const second = uniqueChannelName('coach-messages:c1:a1')
  assert.notEqual(first, second)
  assert.ok(first.startsWith('coach-messages:c1:a1:'))
  assert.ok(second.startsWith('coach-messages:c1:a1:'))
})

test('resyncOnResubscribe skips the first SUBSCRIBED and resyncs on every rejoin', () => {
  let calls = 0
  const onStatus = resyncOnResubscribe(() => { calls += 1 })

  onStatus('SUBSCRIBED')
  assert.equal(calls, 0)

  onStatus('CHANNEL_ERROR')
  onStatus('TIMED_OUT')
  onStatus('CLOSED')
  assert.equal(calls, 0)

  onStatus('SUBSCRIBED')
  onStatus('SUBSCRIBED')
  assert.equal(calls, 2)
})
