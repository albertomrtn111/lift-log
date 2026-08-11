'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { GalleryTab } from '@/components/coach/workspace/GalleryTab'
import {
    getClientGalleryAction,
    type ClientGalleryData,
} from '@/data/client-reviews'

export function ClientGalleryTab() {
    const [gallery, setGallery] = useState<ClientGalleryData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        getClientGalleryAction()
            .then((result) => {
                if (cancelled) return

                if (!result.success || !result.gallery) {
                    setError(result.error ?? 'No se pudo cargar tu galería.')
                    return
                }

                setGallery(result.gallery)
            })
            .catch((loadError) => {
                console.error('[ClientGalleryTab] Load error:', loadError)
                if (!cancelled) setError('No se pudo cargar tu galería.')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [])

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
