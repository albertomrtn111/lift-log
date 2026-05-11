export const COACH_BADGES_CHANGED_EVENT = 'coach:badges-changed'
export const COACH_DASHBOARD_STALE_KEY = 'coach:dashboard-stale-at'

export interface CoachBadgesChangedDetail {
    messagesUnreadDelta?: number
}

export function notifyCoachBadgesChanged(detail: CoachBadgesChangedDetail = {}) {
    if (typeof window === 'undefined') return

    try {
        window.localStorage.setItem(COACH_DASHBOARD_STALE_KEY, String(Date.now()))
    } catch {
        // Ignore storage failures; the in-memory event is enough while mounted.
    }

    window.dispatchEvent(new CustomEvent<CoachBadgesChangedDetail>(
        COACH_BADGES_CHANGED_EVENT,
        { detail }
    ))
}
