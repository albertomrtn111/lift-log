'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

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

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshIfStale()
            }
        }

        window.addEventListener('focus', refreshIfStale)
        window.addEventListener('pageshow', refreshIfStale)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('focus', refreshIfStale)
            window.removeEventListener('pageshow', refreshIfStale)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [refreshIfStale])

    return null
}
