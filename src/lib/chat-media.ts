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
 * Sube el archivo con XMLHttpRequest para poder mostrar el progreso
 * (supabase-js usa fetch, que no informa de la subida). Misma petición que
 * storage.upload(): con el token del usuario, así que aplican las mismas políticas.
 */
async function uploadWithProgress(
    path: string,
    file: Blob,
    mime: string,
    onProgress?: (fraction: number) => void,
): Promise<{ error?: string }> {
    const supabase = createClient()
    // getSession renueva el token si ha caducado (app que vuelve de segundo plano)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Tu sesión ha caducado. Vuelve a entrar para enviar archivos.' }

    const objectPath = path.split('/').map(encodeURIComponent).join('/')
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${CHAT_MEDIA_BUCKET}/${objectPath}`

    return new Promise(resolve => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
        xhr.setRequestHeader('Content-Type', mime)
        xhr.setRequestHeader('Cache-Control', 'max-age=3600')
        xhr.setRequestHeader('x-upsert', 'false')
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(1)
                resolve({})
            } else {
                console.error('[chat-media] Upload error:', xhr.status, xhr.responseText)
                resolve({ error: 'No se pudo subir el archivo. Inténtalo de nuevo.' })
            }
        }
        xhr.onerror = () => resolve({ error: 'Sin conexión: no se pudo subir el archivo.' })
        xhr.send(file)
    })
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
    onProgress?: (fraction: number) => void
}): Promise<{ attachment?: MessageAttachment; error?: string }> {
    const { coachId, clientId, file, fileName, mime, duration, onProgress } = params

    if (file.size > MAX_ATTACHMENT_BYTES) {
        return { error: 'El archivo supera el máximo de 25 MB.' }
    }

    const path = `${coachId}/${clientId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`
    const { error } = await uploadWithProgress(path, file, mime, onProgress)
    if (error) return { error }

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
