'use client'

import { createClient } from '@/lib/supabase/client'
import type { MessageAttachment, MessageAttachmentType } from '@/types/messages'

export const CHAT_MEDIA_BUCKET = 'chat-media'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MB (límite del bucket)

function sanitizeFileName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-80)
}

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
 * Sube un adjunto del chat al bucket privado.
 * Ruta: {coachId}/{clientId}/{uuid}-{nombre} — las políticas RLS del bucket
 * validan que quien sube pertenece a esa conversación.
 */
export async function uploadChatAttachment(params: {
    coachId: string
    clientId: string
    file: File | Blob
    fileName: string
    mime: string
    duration?: number | null
}): Promise<{ attachment?: MessageAttachment; error?: string }> {
    const { coachId, clientId, file, fileName, mime, duration } = params

    if (file.size > MAX_ATTACHMENT_BYTES) {
        return { error: 'El archivo supera el máximo de 25 MB.' }
    }

    const supabase = createClient()
    const path = `${coachId}/${clientId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`

    const { error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .upload(path, file, { contentType: mime, upsert: false })

    if (error) {
        console.error('[chat-media] Upload error:', error)
        return { error: 'No se pudo subir el archivo. Inténtalo de nuevo.' }
    }

    return {
        attachment: {
            type: inferAttachmentType(mime),
            url: path,
            name: fileName,
            size: file.size,
            mime,
            duration: duration ?? null,
        },
    }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

/** URL firmada (1h) con caché en memoria para no repetir peticiones por burbuja. */
export async function getChatAttachmentUrl(path: string): Promise<string | null> {
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
