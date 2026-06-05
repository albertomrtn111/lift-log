export function buildStravaActivityImportedNotification(activityName, providerActivityId) {
  const name = String(activityName ?? '').trim()
  const activityLabel = name ? ` ${name}` : ''

  return {
    title: 'Actividad importada',
    body: `Ya puedes ver tu actividad${activityLabel} y completar RPE/notas.`,
    url: '/progress',
    tag: `strava-activity-${providerActivityId}`,
    type: 'general',
  }
}
