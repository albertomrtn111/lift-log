'use client'

import { useEffect, useMemo, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
    getCheckinMediaImageUrl,
    type CheckinMediaImageSize,
} from '@/lib/checkin-media'

interface ProgressPhotoImageProps {
    path: string
    alt: string
    size?: CheckinMediaImageSize
    className?: string
    loading?: 'eager' | 'lazy'
    draggable?: boolean
    showErrorLabel?: boolean
}

export function ProgressPhotoImage({
    path,
    alt,
    size = 'thumbnail',
    className,
    loading = 'lazy',
    draggable,
    showErrorLabel = false,
}: ProgressPhotoImageProps) {
    const supabase = useMemo(() => createClient(), [])
    // Primero la versión reducida; si no se puede firmar o no carga, la original
    const [stage, setStage] = useState<CheckinMediaImageSize>(size)
    const [src, setSrc] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setStage(size)
        setSrc(null)
        setLoaded(false)
        setFailed(false)
    }, [path, size])

    useEffect(() => {
        let cancelled = false
        getCheckinMediaImageUrl(supabase, path, stage).then((url) => {
            if (cancelled) return
            if (url) {
                setSrc(url)
            } else if (stage !== 'original') {
                setStage('original')
            } else {
                setFailed(true)
            }
        })
        return () => {
            cancelled = true
        }
    }, [path, stage, supabase])

    const handleError = () => {
        if (stage !== 'original') {
            setStage('original')
            setLoaded(false)
            return
        }
        setFailed(true)
    }

    return (
        <>
            {!loaded && !failed && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 animate-pulse bg-muted"
                />
            )}
            {src && (
                <img
                    src={src}
                    alt={alt}
                    className={`${className ?? ''} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    loading={loading}
                    decoding="async"
                    draggable={draggable}
                    onLoad={() => setLoaded(true)}
                    onError={handleError}
                />
            )}
            {failed && (
                <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted px-2 text-center text-muted-foreground">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    {showErrorLabel && <span className="text-xs">No se pudo cargar</span>}
                </span>
            )}
        </>
    )
}
