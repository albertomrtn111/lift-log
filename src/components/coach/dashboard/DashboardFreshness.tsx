'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COACH_BADGES_CHANGED_EVENT, COACH_DASHBOARD_STALE_KEY } from '@/lib/coach-badges-events'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'

const REFRESH_THROTTLE_MS = 15_000
/** Agrupa los avisos que llegan seguidos (p. ej. varios mensajes) en un solo refresco */
const LIVE_REFRESH_DEBOUNCE_MS = 1_000

export function DashboardFreshness({ coachId }: { coachId: string }) {
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

    // En vivo: todo lo que hace un atleta y le importa al coach (revisión o
    // formulario enviado, mensaje, atleta nuevo…) deja un aviso en
    // coach_notifications, así que basta con escuchar esa tabla.
    useEffect(() => {
        const supabase = createClient()
        let timer: ReturnType<typeof setTimeout> | undefined
        const refreshSoon = () => {
            clearTimeout(timer)
            timer = setTimeout(refreshNow, LIVE_REFRESH_DEBOUNCE_MS)
        }

        const channel = supabase
            .channel(uniqueChannelName(`coach-dashboard:${coachId}`))
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'coach_notifications',
                filter: `coach_id=eq.${coachId}`,
            }, (payload) => {
                // Marcar avisos como leídos no cambia el dashboard
                if ((payload.new as { is_read?: boolean } | null)?.is_read === false) refreshSoon()
            })
            .subscribe(resyncOnResubscribe(refreshNow))

        return () => {
            clearTimeout(timer)
            supabase.removeChannel(channel)
        }
    }, [coachId, refreshNow])

    return null
}
