'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, X, Loader2, Upload, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaRow {
    id: string
    path: string
    mime_type: string | null
    file_size_bytes: number | null
    taken_at: string | null
}

interface PhotoUploadBlockProps {
    checkinId: string
    coachId: string
    clientId: string
    maxItems?: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhotoUploadBlock({
    checkinId,
    coachId,
    clientId,
    maxItems = 6,
}: PhotoUploadBlockProps) {
    const supabase = createClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [photos, setPhotos] = useState<MediaRow[]>([])
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // -----------------------------------------------------------------------
    // Fetch existing photos
    // -----------------------------------------------------------------------

    const fetchPhotos = useCallback(async () => {
        const { data, error: fetchErr } = await supabase
            .from('checkin_media')
            .select('id, path, mime_type, file_size_bytes, taken_at')
            .eq('checkin_id', checkinId)
            .eq('media_type', 'progress_photo')
            .order('taken_at', { ascending: true })

        if (fetchErr) {
            console.error('[PhotoUploadBlock] Fetch error:', fetchErr)
            setError('Error al cargar las fotos')
            return
        }

        setPhotos((data as MediaRow[]) ?? [])
    }, [checkinId, supabase])

    useEffect(() => {
        fetchPhotos().finally(() => setLoading(false))
    }, [fetchPhotos])

    // -----------------------------------------------------------------------
    // Upload
    // -----------------------------------------------------------------------

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        const remaining = maxItems - photos.length
        if (remaining <= 0) {
            setError(`Máximo ${maxItems} fotos permitidas`)
            return
        }

        const filesToUpload = Array.from(files).slice(0, remaining)
        setUploading(true)
        setError(null)

        try {
            for (const file of filesToUpload) {
                // Generate unique path
                const ext = file.name.split('.').pop() || 'jpg'
                const timestamp = Date.now()
                const random = Math.random().toString(36).substring(2, 8)
                const path = `${coachId}/${clientId}/${checkinId}/${timestamp}_${random}.${ext}`

                // 1) Upload to Storage
                const { error: uploadErr } = await supabase.storage
                    .from('checkin-media')
                    .upload(path, file, {
                        contentType: file.type,
                        upsert: false,
                    })

                if (uploadErr) {
                    console.error('[PhotoUploadBlock] Storage upload error:', uploadErr)
                    setError(`Error al subir ${file.name}: ${uploadErr.message}`)
                    continue
                }

                // 2) Insert metadata into checkin_media
                const { error: insertErr } = await supabase
                    .from('checkin_media')
                    .insert({
                        coach_id: coachId,
                        client_id: clientId,
                        checkin_id: checkinId,
                        bucket: 'checkin-media',
                        path,
                        media_type: 'progress_photo',
                        mime_type: file.type,
                        file_size_bytes: file.size,
                        taken_at: new Date().toISOString(),
                    })

                if (insertErr) {
                    console.error('[PhotoUploadBlock] Insert error:', insertErr)
                    // Try to clean up the uploaded file
                    await supabase.storage.from('checkin-media').remove([path])
                    setError(`Error al registrar ${file.name}: ${insertErr.message}`)
                    continue
                }
            }

            // Refresh list
            await fetchPhotos()
        } finally {
            setUploading(false)
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // -----------------------------------------------------------------------
    // Delete
    // -----------------------------------------------------------------------

    const handleDelete = async (photo: MediaRow) => {
        setError(null)

        // 1) Delete from Storage
        const { error: storageErr } = await supabase.storage
            .from('checkin-media')
            .remove([photo.path])

        if (storageErr) {
            console.error('[PhotoUploadBlock] Storage delete error:', storageErr)
            // Still try to delete the row
        }

        // 2) Delete row from checkin_media
        const { error: deleteErr } = await supabase
            .from('checkin_media')
            .delete()
            .eq('id', photo.id)

        if (deleteErr) {
            console.error('[PhotoUploadBlock] Row delete error:', deleteErr)
            setError('Error al eliminar la foto')
            return
        }

        // Update local state
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    }

    // -----------------------------------------------------------------------
    // Get public URL for thumbnail
    // -----------------------------------------------------------------------

    const getPublicUrl = (path: string): string => {
        const { data } = supabase.storage.from('checkin-media').getPublicUrl(path)
        return data.publicUrl
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    const canUploadMore = photos.length < maxItems

    return (
        <Card className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-blue-400" />
                    <h3 className="font-medium">Fotos de progreso</h3>
                    <Badge variant="outline" className="text-xs">
                        {photos.length}/{maxItems}
                    </Badge>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Sube fotos (frontal, lateral y espalda). Máximo {maxItems} fotos.
            </p>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Photo grid */}
            {loading ? (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                    {photos.map((photo) => (
                        <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                            <img
                                src={getPublicUrl(photo.path)}
                                alt="Progress photo"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                            <button
                                type="button"
                                onClick={() => handleDelete(photo)}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="h-3.5 w-3.5 text-white" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}

            {/* Upload button */}
            {canUploadMore && (
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Subiendo...
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4" />
                                Subir fotos
                            </>
                        )}
                    </Button>
                </div>
            )}
        </Card>
    )
}
