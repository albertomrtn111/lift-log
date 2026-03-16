'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Camera, Loader2, AlertCircle, Download } from 'lucide-react'

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

    const getPublicUrl = (path: string): string => {
        const { data } = supabase.storage.from('checkin-media').getPublicUrl(path)
        return data.publicUrl
    }

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
                <p className="text-xs text-muted-foreground mt-1">El cliente no subió fotos en este check-in.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium">Fotos de progreso</h4>
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4 ml-auto">
                    {photos.length}
                </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                    <a
                        key={photo.id}
                        href={getPublicUrl(photo.path)}
                        target="_blank"
                        rel="noreferrer"
                        className="relative group aspect-square rounded-md overflow-hidden bg-muted border block"
                        title="Ver imagen original"
                    >
                        <img
                            src={getPublicUrl(photo.path)}
                            alt="Progress photo"
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                        />
                        {/* Download overlay on hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                            <button
                                onClick={(e) => handleDownload(e, photo.path)}
                                className="bg-white/90 hover:bg-white text-black rounded-md p-1.5 transition-colors"
                                title="Descargar foto"
                            >
                                <Download className="h-4 w-4" />
                            </button>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    )
}
