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
    const optimizedUrl = useMemo(
        () => getCheckinMediaImageUrl(supabase, path, size),
        [path, size, supabase]
    )
    const originalUrl = useMemo(
        () => getCheckinMediaImageUrl(supabase, path, 'original'),
        [path, supabase]
    )
    const [src, setSrc] = useState(optimizedUrl)
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setSrc(optimizedUrl)
        setLoaded(false)
        setFailed(false)
    }, [optimizedUrl])

    const handleError = () => {
        if (src !== originalUrl) {
            setSrc(originalUrl)
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
            {failed && (
                <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted px-2 text-center text-muted-foreground">
                    <ImageOff className="h-5 w-5" aria-hidden="true" />
                    {showErrorLabel && <span className="text-xs">No se pudo cargar</span>}
                </span>
            )}
        </>
    )
}
