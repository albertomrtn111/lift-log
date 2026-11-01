'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    getCurrentClientId,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markManyAsRead,
    markAllAsRead,
    type ClientNotification,
} from '@/data/notifications'
import { syncAppBadge } from '@/lib/notifications/app-badge'
import { syncTimezoneAction } from '@/lib/notifications/timezone-actions'

const TIMEZONE_SYNC_KEY = 'nt:timezone-synced'

/** Una vez por sesión: guarda la zona horaria del móvil para los recordatorios. */
function syncTimezoneOnce() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!tz || window.sessionStorage.getItem(TIMEZONE_SYNC_KEY) === tz) return
        window.sessionStorage.setItem(TIMEZONE_SYNC_KEY, tz)
        void syncTimezoneAction(tz).catch(() => window.sessionStorage.removeItem(TIMEZONE_SYNC_KEY))
    } catch {
        // Sin sessionStorage o sin Intl: se usará la zona del servidor.
    }
}

export function useClientNotifications() {
    const [notifications, setNotifications] = useState<ClientNotification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        const [list, count] = await Promise.all([getNotifications(), getUnreadCount()])
        setNotifications(list)
        setUnreadCount(count)
        setLoading(false)
    }, [])

    useEffect(() => {
        refresh()
        syncTimezoneOnce()
    }, [refresh])

    // Realtime: escucha inserts en client_notifications para el cliente actual
    useEffect(() => {
        const supabase = createClient()
        let channel: ReturnType<typeof supabase.channel> | null = null

        ;(async () => {
            const clientId = await getCurrentClientId()
            if (!clientId) return

            channel = supabase
                .channel('client_notifications_' + clientId)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'client_notifications',
                        filter: `client_id=eq.${clientId}`,
                    },
                    () => { refresh() }
                )
                .subscribe()
        })()

        return () => {
            if (channel) supabase.removeChannel(channel)
        }
    }, [refresh])

    const handleMarkAsRead = useCallback(async (id: string) => {
        await markAsRead(id)
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
    }, [])

    useEffect(() => {
        if (!loading) syncAppBadge(unreadCount)
    }, [loading, unreadCount])

    const handleMarkManyAsRead = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        setNotifications(prev =>
            prev.map(n => idSet.has(n.id) ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
        )
        setUnreadCount(prev => Math.max(0, prev - ids.length))
        await markManyAsRead(ids)
    }, [])

    const handleMarkAllAsRead = useCallback(async () => {
        await markAllAsRead()
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        setUnreadCount(0)
    }, [])

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead: handleMarkAsRead,
        markManyAsRead: handleMarkManyAsRead,
        markAllAsRead: handleMarkAllAsRead,
        refresh,
    }
}
