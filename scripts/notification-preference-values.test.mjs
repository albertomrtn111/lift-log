import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_CLIENT_NOTIFICATION_PREFERENCES,
  readNotificationPreferencesFromClientPreferences,
  sanitizeNotificationPreferences,
  writeNotificationPreferencesToClientPreferences,
} from '../src/lib/notifications/preference-values.js'

test('sanitizeNotificationPreferences keeps only boolean notification flags', () => {
  assert.deepEqual(
    sanitizeNotificationPreferences({
      messages_enabled: false,
      reviews_enabled: 'nope',
      supplements_enabled: false,
    }),
    {
      messages_enabled: false,
      reviews_enabled: true,
      supplements_enabled: false,
    }
  )
})

test('readNotificationPreferencesFromClientPreferences falls back to defaults', () => {
  assert.deepEqual(
    readNotificationPreferencesFromClientPreferences(null),
    DEFAULT_CLIENT_NOTIFICATION_PREFERENCES
  )
})

test('readNotificationPreferencesFromClientPreferences reads nested notification preferences', () => {
  assert.deepEqual(
    readNotificationPreferencesFromClientPreferences({
      theme: 'dark',
      notification_preferences: {
        messages_enabled: false,
        reviews_enabled: true,
        supplements_enabled: false,
      },
    }),
    {
      messages_enabled: false,
      reviews_enabled: true,
      supplements_enabled: false,
    }
  )
})

test('writeNotificationPreferencesToClientPreferences preserves unrelated preferences', () => {
  assert.deepEqual(
    writeNotificationPreferencesToClientPreferences(
      { theme: 'dark', locale: 'es' },
      { messages_enabled: false, supplements_enabled: false }
    ),
    {
      theme: 'dark',
      locale: 'es',
      notification_preferences: {
        messages_enabled: false,
        reviews_enabled: true,
        supplements_enabled: false,
      },
    }
  )
})
