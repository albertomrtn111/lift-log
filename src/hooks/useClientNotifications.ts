'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'
import {
    getCurrentClientId,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    type ClientNotification,
} from '@/data/notifications'

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
    }, [refresh])

    // Vuelta a primer plano o reconexión: lo ocurrido mientras tanto no llega por Realtime
    useResyncOnReturn(refresh)

    // Realtime: escucha inserts en client_notifications para el cliente actual
    useEffect(() => {
        const supabase = createClient()
        let channel: ReturnType<typeof supabase.channel> | null = null
        let cancelled = false

        ;(async () => {
            const clientId = await getCurrentClientId()
            // Desmontado mientras se resolvía: no abrir un canal que nadie cerrará
            if (!clientId || cancelled) return

            channel = supabase
                .channel(uniqueChannelName(`client-notifications:${clientId}`))
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
                .subscribe(resyncOnResubscribe(refresh))
        })()

        return () => {
            cancelled = true
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
        markAllAsRead: handleMarkAllAsRead,
        refresh,
    }
}
