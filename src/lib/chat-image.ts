'use client'

import {
    CHAT_IMAGE_QUALITY,
    fitWithin,
    isHeic,
    jpegFileName,
    shouldPrepareImage,
} from '@/lib/chat-image-rules'

export interface PreparedChatFile {
    file: Blob
    fileName: string
    mime: string
}

/**
 * Reduce las fotos a JPEG de 2048 px como máximo antes de subirlas: una foto
 * del móvil pasa de 3-8 MB a unos cientos de KB, se sube en segundos con mala
 * cobertura, pierde los metadatos (incluida la ubicación) y las HEIC del iPhone
 * se ven en cualquier navegador. Si algo falla, se envía el archivo original.
 */
export async function prepareChatFile(file: File): Promise<PreparedChatFile> {
    const original: PreparedChatFile = {
        file,
        fileName: file.name,
        mime: file.type || 'application/octet-stream',
    }
    if (!shouldPrepareImage(file.type, file.name) || typeof createImageBitmap === 'undefined') return original

    try {
        // from-image: respeta la orientación EXIF (fotos hechas en vertical)
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const { width, height } = fitWithin(bitmap.width, bitmap.height)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
            bitmap.close()
            return original
        }
        // Fondo blanco: las zonas transparentes de un PNG saldrían negras en JPEG
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', CHAT_IMAGE_QUALITY))
        if (!blob) return original
        // Una imagen ya ligera puede crecer al recomprimirla; las HEIC se convierten siempre
        if (!isHeic(file.type, file.name) && blob.size >= file.size) return original

        return { file: blob, fileName: jpegFileName(file.name), mime: 'image/jpeg' }
    } catch (error) {
        // Navegador sin soporte para ese formato (p. ej. HEIC fuera de Safari)
        console.warn('[chat-image] Se envía el archivo original:', error)
        return original
    }
}
