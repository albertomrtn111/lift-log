'use client'

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCoachContext } from '@/contexts/CoachContext'
import {
    getCoachNotifications,
    getCoachUnreadCount,
    markAllCoachNotificationsAsRead,
    markCoachNotificationsAsRead,
    type CoachNotification,
} from '@/data/coach-notifications'
import { notificationMatchesLocation } from '@/lib/notifications/auto-read'
import { syncAppBadge } from '@/lib/notifications/app-badge'
import { CoachNotificationsSheet } from './CoachNotificationsSheet'

interface CoachNotificationsValue {
    notifications: CoachNotification[]
    unreadCount: number
    loading: boolean
    openSheet: () => void
    markRead: (ids: string[]) => void
    markAllRead: () => void
}

const CoachNotificationsContext = createContext<CoachNotificationsValue | null>(null)

export function useCoachNotifications() {
    return useContext(CoachNotificationsContext)
}

/**
 * Estado único de la campana del coach para todo el portal: lista, contador,
 * tiempo real, marcar como leído al visitar la pantalla del aviso y el panel.
 * Los botones de campana (barra lateral, cabeceras móviles) solo lo abren.
 */
export function CoachNotificationsProvider({ children }: { children: React.ReactNode }) {
    const { coach } = useCoachContext()
    const coachId = coach?.coachId ?? null
    const [notifications, setNotifications] = useState<CoachNotification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [open, setOpen] = useState(false)

    const refresh = useCallback(async () => {
        if (!coachId) return
        const [list, count] = await Promise.all([getCoachNotifications(coachId), getCoachUnreadCount(coachId)])
        setNotifications(list)
        setUnreadCount(count)
        setLoading(false)
    }, [coachId])

    useEffect(() => {
        void refresh()
    }, [refresh])

    useEffect(() => {
        if (!coachId) return
        const supabase = createClient()
        const channel = supabase
            .channel(`coach_notifications_${coachId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'coach_notifications', filter: `coach_id=eq.${coachId}` },
                () => { void refresh() }
            )
            .subscribe()
        return () => { void supabase.removeChannel(channel) }
    }, [coachId, refresh])

    // Al volver a la pestaña o recuperar la conexión, Realtime puede haberse
    // perdido eventos: se vuelve a leer la campana.
    useEffect(() => {
        const resync = () => {
            if (document.visibilityState === 'visible') void refresh()
        }
        document.addEventListener('visibilitychange', resync)
        window.addEventListener('online', resync)
        return () => {
            document.removeEventListener('visibilitychange', resync)
            window.removeEventListener('online', resync)
        }
    }, [refresh])

    useEffect(() => {
        if (!loading) syncAppBadge(unreadCount)
    }, [loading, unreadCount])

    const markRead = useCallback((ids: string[]) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        setNotifications(prev => prev.map(n => idSet.has(n.id) ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        setUnreadCount(prev => Math.max(0, prev - ids.length))
        void markCoachNotificationsAsRead(ids)
    }, [])

    const markAllRead = useCallback(() => {
        if (!coachId) return
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        setUnreadCount(0)
        void markAllCoachNotificationsAsRead(coachId)
    }, [coachId])

    const value = useMemo<CoachNotificationsValue>(() => ({
        notifications,
        unreadCount,
        loading,
        openSheet: () => setOpen(true),
        markRead,
        markAllRead,
    }), [notifications, unreadCount, loading, markRead, markAllRead])

    return (
        <CoachNotificationsContext.Provider value={value}>
            {children}
            <Suspense fallback={null}>
                <MarkReadOnVisit notifications={notifications} onRead={markRead} />
            </Suspense>
            <CoachNotificationsSheet open={open} onOpenChange={setOpen} />
        </CoachNotificationsContext.Provider>
    )
}

/** Si el coach ya está en la pantalla a la que lleva un aviso, ese aviso queda leído. */
function MarkReadOnVisit({
    notifications,
    onRead,
}: {
    notifications: CoachNotification[]
    onRead: (ids: string[]) => void
}) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const search = searchParams.toString()

    useEffect(() => {
        const seen = notifications
            .filter(n => !n.is_read && notificationMatchesLocation(n.url, pathname, search))
            .map(n => n.id)
        if (seen.length > 0) onRead(seen)
    }, [notifications, pathname, search, onRead])

    return null
}
