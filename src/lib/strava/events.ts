// Eventos de ventana para que el diálogo global de Strava avise a las pantallas
// abiertas (Plan, resumen...) sin esperar a que el usuario recargue.

export const STRAVA_PENDING_UPDATED_EVENT = 'strava:pending-updated'
export const STRAVA_ACTIVITY_COMPLETED_EVENT = 'strava:activity-completed'

export interface StravaActivityCompletedDetail {
    cardioSessionId: string
    scheduledDate: string
}

export function notifyStravaActivityCompleted(detail: StravaActivityCompletedDetail) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<StravaActivityCompletedDetail>(
        STRAVA_ACTIVITY_COMPLETED_EVENT,
        { detail }
    ))
}
