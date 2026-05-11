'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { COACH_BADGES_CHANGED_EVENT, COACH_DASHBOARD_STALE_KEY } from '@/lib/coach-badges-events'

const REFRESH_THROTTLE_MS = 15_000

export function DashboardFreshness() {
    const router = useRouter()
    const lastRefreshAtRef = useRef(Date.now())

    const refreshIfStale = useCallback(() => {
        const now = Date.now()
        if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return

        lastRefreshAtRef.current = now
        router.refresh()
    }, [router])

    const refreshNow = useCallback(() => {
        lastRefreshAtRef.current = Date.now()
        router.refresh()
    }, [router])

    useEffect(() => {
        try {
            if (window.localStorage.getItem(COACH_DASHBOARD_STALE_KEY)) {
                window.localStorage.removeItem(COACH_DASHBOARD_STALE_KEY)
                refreshNow()
            }
        } catch {
            // Ignore storage failures.
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshIfStale()
            }
        }

        const handleBadgesChanged = () => {
            try {
                window.localStorage.removeItem(COACH_DASHBOARD_STALE_KEY)
            } catch {
                // Ignore storage failures.
            }
            refreshNow()
        }

        window.addEventListener(COACH_BADGES_CHANGED_EVENT, handleBadgesChanged)
        window.addEventListener('focus', refreshIfStale)
        window.addEventListener('pageshow', refreshIfStale)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener(COACH_BADGES_CHANGED_EVENT, handleBadgesChanged)
            window.removeEventListener('focus', refreshIfStale)
            window.removeEventListener('pageshow', refreshIfStale)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [refreshIfStale, refreshNow])

    return null
}
