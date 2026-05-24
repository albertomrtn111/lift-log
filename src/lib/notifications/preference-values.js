export const DEFAULT_CLIENT_NOTIFICATION_PREFERENCES = {
  messages_enabled: true,
  reviews_enabled: true,
  supplements_enabled: true,
}

export function sanitizeNotificationPreferences(input = {}) {
  return {
    messages_enabled: typeof input.messages_enabled === 'boolean'
      ? input.messages_enabled
      : DEFAULT_CLIENT_NOTIFICATION_PREFERENCES.messages_enabled,
    reviews_enabled: typeof input.reviews_enabled === 'boolean'
      ? input.reviews_enabled
      : DEFAULT_CLIENT_NOTIFICATION_PREFERENCES.reviews_enabled,
    supplements_enabled: typeof input.supplements_enabled === 'boolean'
      ? input.supplements_enabled
      : DEFAULT_CLIENT_NOTIFICATION_PREFERENCES.supplements_enabled,
  }
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
