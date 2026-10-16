export const NOTIFICATION_PREFERENCE_KEYS = [
  'messages_enabled',
  'reviews_enabled',
  'supplements_enabled',
  'activities_enabled',
  'plans_enabled',
]

export const DEFAULT_CLIENT_NOTIFICATION_PREFERENCES = {
  messages_enabled: true,
  reviews_enabled: true,
  supplements_enabled: true,
  activities_enabled: true,
  plans_enabled: true,
}

export function sanitizeNotificationPreferences(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const sanitized = {}
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    sanitized[key] = typeof source[key] === 'boolean'
      ? source[key]
      : DEFAULT_CLIENT_NOTIFICATION_PREFERENCES[key]
  }
  return sanitized
}

export function readNotificationPreferencesFromClientPreferences(preferences) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return DEFAULT_CLIENT_NOTIFICATION_PREFERENCES
  }

  return sanitizeNotificationPreferences(preferences.notification_preferences)
}

export function writeNotificationPreferencesToClientPreferences(currentPreferences, notificationPreferences) {
  const current = currentPreferences && typeof currentPreferences === 'object' && !Array.isArray(currentPreferences)
    ? currentPreferences
    : {}

  return {
    ...current,
    notification_preferences: sanitizeNotificationPreferences(notificationPreferences),
  }
}
