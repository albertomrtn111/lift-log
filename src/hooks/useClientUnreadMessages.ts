'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'

/**
 * Returns the count of unread coach messages for the current client.
 * Automatically resets to 0 when the user navigates to /chat.
 * Updates in real time via Supabase Realtime, and re-counts when the app
 * comes back to the foreground or reconnects (Realtime drops what happened
 * while the socket was down).
 */
export function useClientUnreadMessages(): number {
    const { client } = useClientAppContext()
    const pathname = usePathname()
    const [unreadCount, setUnreadCount] = useState(0)
    const pathnameRef = useRef(pathname)

    const coachId = client?.coachId
    const clientId = client?.clientId

    // Keep ref in sync to avoid stale closures in realtime callback
    useEffect(() => {
        pathnameRef.current = pathname
    }, [pathname])

    // Reset when on /chat (ClientChat.tsx already marks messages as read)
    useEffect(() => {
        if (pathname === '/chat') {
            setUnreadCount(0)
        }
    }, [pathname])

    const fetchCount = useCallback(async () => {
        if (!coachId || !clientId || pathnameRef.current === '/chat') return

        const supabase = createClient()
        const { count, error } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .eq('sender_role', 'coach')
            .is('read_at', null)

        if (!error && pathnameRef.current !== '/chat') setUnreadCount(count ?? 0)
    }, [coachId, clientId])

    // Initial fetch: only on client/coach change, not on every navigation
    useEffect(() => {
        fetchCount()
    }, [fetchCount])

    useResyncOnReturn(fetchCount, Boolean(coachId && clientId))

    // Realtime — increment on new coach messages when NOT viewing chat
    useEffect(() => {
        if (!coachId || !clientId) return
        const supabase = createClient()

        const channel = supabase
            .channel(uniqueChannelName(`client-unread:${coachId}:${clientId}`))
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `client_id=eq.${clientId}`,
            }, (payload) => {
                const msg = payload.new as { coach_id: string; sender_role: string }
                if (
                    msg.coach_id === coachId &&
                    msg.sender_role === 'coach' &&
                    pathnameRef.current !== '/chat'
                ) {
                    setUnreadCount(prev => prev + 1)
                }
            })
            .subscribe(resyncOnResubscribe(fetchCount))

        return () => { supabase.removeChannel(channel) }
    }, [coachId, clientId, fetchCount])

    return unreadCount
}
