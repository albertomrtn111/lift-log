'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useResyncOnReturn } from '@/hooks/useResyncOnReturn'
import { resyncOnResubscribe, uniqueChannelName } from '@/lib/realtime'
import { viewersFromPresence } from '@/lib/studio/editor-rules'
import { createClient } from '@/lib/supabase/client'

/** Agrupa los cambios que llegan seguidos, como pegar una sesión, en una sola recarga. */
const LIVE_REFRESH_DEBOUNCE_MS = 300

export interface StudioViewer {
    userId: string
    name: string
    sessionId: string | null
}

/**
 * Mantiene al día la cuadrícula de un cliente y dice quién más la está mirando.
 * Toda escritura deja una fila en el registro, así que basta con escucharlo.
 */
export function useStudioLive({ clientId, userId, userName, openSessionId }: {
    clientId: string
    userId: string | null
    userName: string
    openSessionId: string | null
}) {
    const router = useRouter()
    const [viewers, setViewers] = useState<StudioViewer[]>([])
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const channelRef = useRef<RealtimeChannel | null>(null)
    const trackedRef = useRef({ userId: userId ?? '', name: userName, sessionId: openSessionId })
    trackedRef.current = { userId: userId ?? '', name: userName, sessionId: openSessionId }

    const refresh = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => router.refresh(), LIVE_REFRESH_DEBOUNCE_MS)
    }, [router])

    useEffect(() => {
        const supabase = createClient()
        const channel = supabase
            .channel(uniqueChannelName(`studio-changes:${clientId}`))
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'studio_change_log', filter: `client_id=eq.${clientId}` },
                refresh
            )
            .subscribe(resyncOnResubscribe(refresh))
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            void supabase.removeChannel(channel)
        }
    }, [clientId, refresh])

    useResyncOnReturn(refresh)

    // La presencia va aparte: si no conecta, la cuadrícula sigue en vivo igual.
    useEffect(() => {
        if (!userId) return
        const supabase = createClient()
        let cancelled = false
        let channel: RealtimeChannel | null = null

        async function join() {
            try {
                await supabase.realtime.setAuth()
                if (cancelled) return
                const joined = supabase.channel(`studio:${clientId}`, {
                    config: { private: true, presence: { key: userId! } },
                })
                channel = joined
                channelRef.current = joined
                joined
                    .on('presence', { event: 'sync' }, () => {
                        setViewers(viewersFromPresence(joined.presenceState(), userId) as StudioViewer[])
                    })
                    .subscribe(status => {
                        if (status === 'SUBSCRIBED') void joined.track(trackedRef.current)
                    })
            } catch (error) {
                console.warn('[sala] presencia no disponible', error)
            }
        }

        void join()
        return () => {
            cancelled = true
            channelRef.current = null
            setViewers([])
            if (channel) void supabase.removeChannel(channel)
        }
    }, [clientId, userId])

    useEffect(() => {
        void channelRef.current?.track(trackedRef.current)
    }, [openSessionId])

    return { viewers }
}
