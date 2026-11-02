'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Camera, X, Loader2, Upload, AlertCircle } from 'lucide-react'
import { ProgressPhotoImage } from '@/components/media/ProgressPhotoImage'
import { prepareChatFile } from '@/lib/chat-image'
import { PHOTO_INPUT_ACCEPT, photoUploadProblem } from '@/lib/chat-image-rules'
import { uploadMedia } from '@/lib/media-upload'
import { R2_BUCKET_MARKER, privateMediaUrl } from '@/lib/storage/media-refs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaRow {
    id: string
    bucket: string
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
    required?: boolean
    error?: string
    onCountChange?: (count: number) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhotoUploadBlock({
    checkinId,
    coachId,
    clientId,
    maxItems = 6,
    required = false,
    error: externalError,
    onCountChange,
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
            .select('id, bucket, path, mime_type, file_size_bytes, taken_at')
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

    useEffect(() => {
        onCountChange?.(photos.length)
    }, [onCountChange, photos.length])

    /** Borra el archivo de R2 (vía la app, que comprueba permisos) o de Supabase */
    const removeStoredFile = useCallback(async (bucket: string, path: string) => {
        try {
            if (bucket === R2_BUCKET_MARKER) {
                const response = await fetch(privateMediaUrl(path), { method: 'DELETE' })
                if (!response.ok) throw new Error(String(response.status))
            } else {
                const { error } = await supabase.storage.from('checkin-media').remove([path])
                if (error) throw error
            }
        } catch (err) {
            console.error('[PhotoUploadBlock] Storage delete error:', err)
        }
    }, [supabase])

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
                // 1) Se reduce en el móvil y el servidor la guarda en WebP (R2 o Supabase)
                const prepared = await prepareChatFile(file)
                // RAW (ProRAW del iPhone), HEIC que el navegador no convierte o
                // demasiado grande: avisar sin subir nada
                const problem = photoUploadProblem(prepared.mime, prepared.fileName, prepared.file.size)
                if (problem) {
                    setError(`${file.name}: ${problem}`)
                    continue
                }
                const { data: uploaded, error: uploadErr } = await uploadMedia<{
                    bucket: string
                    path: string
                    mime: string
                    size: number
                }>(
                    { kind: 'checkin', coachId, clientId, checkinId },
                    prepared.file,
                    prepared.fileName,
                )

                if (uploadErr || !uploaded) {
                    console.error('[PhotoUploadBlock] Upload error:', uploadErr)
                    setError(`Error al subir ${file.name}: ${uploadErr}`)
                    continue
                }

                // 2) Insert metadata into checkin_media
                const { error: insertErr } = await supabase
                    .from('checkin_media')
                    .insert({
                        coach_id: coachId,
                        client_id: clientId,
                        checkin_id: checkinId,
                        bucket: uploaded.bucket,
                        path: uploaded.path,
                        media_type: 'progress_photo',
                        mime_type: uploaded.mime,
                        file_size_bytes: uploaded.size,
                        taken_at: new Date().toISOString(),
                    })

                if (insertErr) {
                    console.error('[PhotoUploadBlock] Insert error:', insertErr)
                    // Try to clean up the uploaded file
                    await removeStoredFile(uploaded.bucket, uploaded.path)
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

        // 1) Delete from Storage (still try to delete the row if it fails)
        await removeStoredFile(photo.bucket, photo.path)

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
    // Render
    // -----------------------------------------------------------------------

    const canUploadMore = photos.length < maxItems

    return (
        <Card className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-primary" />
                    <h3 className="font-medium">Fotos de progreso</h3>
                    {required && <span className="text-destructive">*</span>}
                    <Badge variant="outline" className="text-xs">
                        {photos.length}/{maxItems}
                    </Badge>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Sube fotos (frontal, lateral y espalda). Máximo {maxItems} fotos.
            </p>

            {/* Error */}
            {(error || externalError) && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error || externalError}
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
                            <ProgressPhotoImage
                                path={photo.path}
                                alt="Progress photo"
                                className="w-full h-full object-cover"
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
                        accept={PHOTO_INPUT_ACCEPT}
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
