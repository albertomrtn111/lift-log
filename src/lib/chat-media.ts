'use client'

import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/media-upload'
import { chatAttachmentR2Key, privateMediaUrl } from '@/lib/storage/media-refs'
import type { MessageAttachment, MessageAttachmentType } from '@/types/messages'

export const CHAT_MEDIA_BUCKET = 'chat-media'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB (límite del bucket)

export function inferAttachmentType(mime: string): MessageAttachmentType {
    if (mime.startsWith('audio/')) return 'audio'
    if (mime.startsWith('image/')) return 'image'
    return 'document'
}

export function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatAudioDuration(seconds: number | null | undefined): string {
    const total = Math.max(0, Math.round(seconds ?? 0))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Sube un adjunto del chat. El servidor comprueba que quien sube pertenece a la
 * conversación, convierte las fotos a WebP y lo guarda en el bucket privado de R2
 * (`url` = «r2:chat-media/{coachId}/{clientId}/…») o, si R2 no está configurado,
 * en el bucket chat-media de Supabase (`url` = «{coachId}/{clientId}/…»).
 */
export async function uploadChatAttachment(params: {
    coachId: string
    clientId: string
    file: File | Blob
    fileName: string
    mime: string
    duration?: number | null
    onProgress?: (fraction: number) => void
}): Promise<{ attachment?: MessageAttachment; error?: string }> {
    const { coachId, clientId, file, fileName, mime, duration, onProgress } = params

    if (file.size > MAX_ATTACHMENT_BYTES) {
        return { error: 'El archivo supera el máximo de 25 MB.' }
    }

    const blob = file.type ? file : new Blob([file], { type: mime })
    const { data, error } = await uploadMedia<{ url: string; name: string; mime: string; size: number }>(
        { kind: 'chat', coachId, clientId },
        blob,
        fileName,
        onProgress,
    )
    if (error || !data) return { error: error ?? 'No se pudo subir el archivo.' }

    return {
        attachment: {
            type: inferAttachmentType(data.mime),
            url: data.url,
            name: data.name,
            size: data.size,
            mime: data.mime,
            duration: duration ?? null,
        },
    }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

/** Adjuntos antiguos de Supabase: URL firmada (1h) con caché en memoria para no repetir peticiones por burbuja. */
export async function getChatAttachmentUrl(path: string): Promise<string | null> {
    // En R2: la app lo sirve tras comprobar permisos (sin firma que caduque)
    const r2Key = chatAttachmentR2Key(path)
    if (r2Key) return privateMediaUrl(r2Key)

    const cached = signedUrlCache.get(path)
    if (cached && cached.expiresAt > Date.now() + 60_000) {
        return cached.url
    }

    const supabase = createClient()
    const { data, error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(path, 3600)

    if (error || !data?.signedUrl) {
        console.error('[chat-media] Signed URL error:', error)
        return null
    }

    signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 3600_000 })
    return data.signedUrl
}
