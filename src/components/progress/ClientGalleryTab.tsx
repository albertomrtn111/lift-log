'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { GalleryTab } from '@/components/coach/workspace/GalleryTab'
import {
    getClientGalleryAction,
    type ClientGalleryData,
} from '@/data/client-reviews'
import { useAthleteLiveRefresh } from '@/hooks/useAthleteLiveRefresh'

export function ClientGalleryTab() {
    const [gallery, setGallery] = useState<ClientGalleryData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // `silent`: recarga en segundo plano; si falla, se queda la galería que había
    const load = useCallback(async (silent: boolean, isCancelled: () => boolean = () => false) => {
        try {
            const result = await getClientGalleryAction()
            if (isCancelled()) return
            if (!result.success || !result.gallery) {
                if (!silent) setError(result.error ?? 'No se pudo cargar tu galería.')
                return
            }
            setGallery(result.gallery)
            setError(null)
        } catch (loadError) {
            console.error('[ClientGalleryTab] Load error:', loadError)
            if (!silent && !isCancelled()) setError('No se pudo cargar tu galería.')
        } finally {
            if (!isCancelled()) setLoading(false)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        void load(false, () => cancelled)
        return () => {
            cancelled = true
        }
    }, [load])

    // Fotos nuevas de una revisión, vuelta a la app o cambios del coach
    useAthleteLiveRefresh(() => { void load(true) }, ['reviews'])

    if (loading) {
        return (
            <div className="flex min-h-[280px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || !gallery) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error ?? 'No se pudo cargar tu galería.'}
            </div>
        )
    }

    return (
        <GalleryTab
            coachId={gallery.coachId}
            clientId={gallery.clientId}
            checkins={gallery.checkins}
            initialMedia={gallery.media}
            initialWeights={gallery.weights}
            viewerRole="client"
        />
    )
}
