'use client'

import { useState, useEffect, useCallback } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import {
    Camera,
    Loader2,
    AlertCircle,
    Download,
    ChevronLeft,
    ChevronRight,
    X,
} from 'lucide-react'

interface MediaRow {
    id: string
    path: string
    mime_type: string | null
    file_size_bytes: number | null
    taken_at: string | null
}

interface CheckinPhotosViewerProps {
    checkinId: string
    coachId: string
}

export function CheckinPhotosViewer({ checkinId, coachId }: CheckinPhotosViewerProps) {
    const supabase = createClient()
    const [photos, setPhotos] = useState<MediaRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    // Lightbox state: null = cerrado, número = índice de la foto abierta
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const [touchStartX, setTouchStartX] = useState<number | null>(null)

    const fetchPhotos = useCallback(async () => {
        const { data, error: fetchErr } = await supabase
            .from('checkin_media')
            .select('id, path, mime_type, file_size_bytes, taken_at')
            .eq('checkin_id', checkinId)
            .eq('media_type', 'progress_photo')
            .order('taken_at', { ascending: true })

        if (fetchErr) {
            console.error('[CheckinPhotosViewer] Fetch error:', fetchErr)
            setError('Error al cargar las fotos')
            return
        }

        setPhotos((data as MediaRow[]) ?? [])
    }, [checkinId, supabase])

    useEffect(() => {
        fetchPhotos().finally(() => setLoading(false))
    }, [fetchPhotos])

    const getPublicUrl = useCallback(
        (path: string): string => {
            const { data } = supabase.storage.from('checkin-media').getPublicUrl(path)
            return data.publicUrl
        },
        [supabase]
    )

    const goPrev = useCallback(() => {
        setLightboxIndex((i) =>
            i === null ? i : (i - 1 + photos.length) % photos.length
        )
    }, [photos.length])

    const goNext = useCallback(() => {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % photos.length))
    }, [photos.length])

    // Navegación con teclado mientras el lightbox está abierto
    useEffect(() => {
        if (lightboxIndex === null) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                goPrev()
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                goNext()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [lightboxIndex, goPrev, goNext])

    // Precarga de las imágenes adyacentes para que pasar sea instantáneo
    useEffect(() => {
        if (lightboxIndex === null || photos.length < 2) return
        const preload = (idx: number) => {
            const img = new window.Image()
            img.src = getPublicUrl(photos[idx].path)
        }
        preload((lightboxIndex + 1) % photos.length)
        preload((lightboxIndex - 1 + photos.length) % photos.length)
    }, [lightboxIndex, photos, getPublicUrl])

    const handleDownload = async (e: React.MouseEvent, path: string) => {
        e.preventDefault()
        e.stopPropagation()
        try {
            const url = getPublicUrl(path)
            const response = await fetch(url)
            const blob = await response.blob()
            const objectUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = objectUrl
            const filename = path.split('/').pop() || 'foto-progreso.jpg'
            link.download = filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(objectUrl)
        } catch (err) {
            console.error('[CheckinPhotosViewer] Download error:', err)
        }
    }

    // Swipe táctil en el lightbox (móvil/tablet)
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchStartX(e.touches[0].clientX)
    }
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX === null) return
        const delta = e.changedTouches[0].clientX - touchStartX
        if (Math.abs(delta) > 50) {
            if (delta > 0) goPrev()
            else goNext()
        }
        setTouchStartX(null)
    }

    const formatTakenAt = (takenAt: string | null): string | null => {
        if (!takenAt) return null
        try {
            return new Date(takenAt).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })
        } catch {
            return null
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-6 border rounded-lg bg-muted/20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
            </div>
        )
    }

    if (photos.length === 0) {
        return (
            <div className="p-6 border rounded-lg bg-muted/20 text-center">
                <Camera className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Sin fotos de progreso</p>
                <p className="text-xs text-muted-foreground mt-1">El cliente no subió fotos en esta revisión.</p>
            </div>
        )
    }

    const activePhoto = lightboxIndex !== null ? photos[lightboxIndex] : null

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Fotos de progreso</h4>
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4 ml-auto">
                    {photos.length}
                </Badge>
            </div>

            {/* Grid de miniaturas: click abre el preview en la misma pantalla */}
            <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, idx) => (
                    <button
                        key={photo.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="relative group aspect-square rounded-md overflow-hidden bg-muted border block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Ver foto"
                    >
                        <img
                            src={getPublicUrl(photo.path)}
                            alt={`Foto de progreso ${idx + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => handleDownload(e, photo.path)}
                                className="rounded-md border border-white/20 bg-background/90 p-1.5 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                                title="Descargar foto"
                            >
                                <Download className="h-4 w-4" />
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Lightbox con navegación */}
            <DialogPrimitive.Root
                open={lightboxIndex !== null}
                onOpenChange={(open) => {
                    if (!open) setLightboxIndex(null)
                }}
            >
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                    <DialogPrimitive.Content
                        className="fixed inset-0 z-50 flex flex-col outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                    >
                        <DialogPrimitive.Title className="sr-only">
                            Fotos de progreso
                        </DialogPrimitive.Title>

                        {activePhoto && (
                            <>
                                {/* Barra superior: contador, fecha, descargar, cerrar */}
                                <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-sm font-medium tabular-nums shrink-0">
                                            {(lightboxIndex ?? 0) + 1} / {photos.length}
                                        </span>
                                        {formatTakenAt(activePhoto.taken_at) && (
                                            <span className="text-xs text-white/60 truncate">
                                                {formatTakenAt(activePhoto.taken_at)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => handleDownload(e, activePhoto.path)}
                                            className="rounded-md p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                            title="Descargar foto"
                                        >
                                            <Download className="h-5 w-5" />
                                        </button>
                                        <DialogPrimitive.Close asChild>
                                            <button
                                                type="button"
                                                className="rounded-md p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                                                title="Cerrar (Esc)"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        </DialogPrimitive.Close>
                                    </div>
                                </div>

                                {/* Imagen central con flechas */}
                                <div className="relative flex-1 flex items-center justify-center min-h-0 px-2 pb-4 sm:px-14">
                                    {photos.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={goPrev}
                                            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2 sm:p-2.5 transition-colors"
                                            title="Anterior (←)"
                                        >
                                            <ChevronLeft className="h-6 w-6" />
                                        </button>
                                    )}

                                    <img
                                        key={activePhoto.id}
                                        src={getPublicUrl(activePhoto.path)}
                                        alt={`Foto de progreso ${(lightboxIndex ?? 0) + 1} de ${photos.length}`}
                                        className="max-h-full max-w-full object-contain rounded-md select-none"
                                        draggable={false}
                                    />

                                    {photos.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={goNext}
                                            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2 sm:p-2.5 transition-colors"
                                            title="Siguiente (→)"
                                        >
                                            <ChevronRight className="h-6 w-6" />
                                        </button>
                                    )}
                                </div>

                                {/* Tira de miniaturas para saltar directo a una foto */}
                                {photos.length > 1 && (
                                    <div className="flex gap-2 justify-center px-4 pb-4 overflow-x-auto">
                                        {photos.map((photo, idx) => (
                                            <button
                                                key={photo.id}
                                                type="button"
                                                onClick={() => setLightboxIndex(idx)}
                                                className={`h-14 w-14 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                                                    idx === lightboxIndex
                                                        ? 'border-white opacity-100'
                                                        : 'border-transparent opacity-50 hover:opacity-80'
                                                }`}
                                                title={`Foto ${idx + 1}`}
                                            >
                                                <img
                                                    src={getPublicUrl(photo.path)}
                                                    alt={`Miniatura ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
        </div>
    )
}
