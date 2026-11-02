import 'server-only'

import sharp from 'sharp'
import { MEDIA_IMAGE_MAX_SIDE, MEDIA_WEBP_QUALITY } from '@/lib/chat-image-rules'

/**
 * Convierte una foto a WebP con el lado mayor limitado (1600 px por defecto).
 * Aplica la orientación EXIF y descarta los metadatos (incluida la ubicación).
 * Devuelve null si sharp no puede leer el formato (p. ej. HEIC fuera de Safari).
 */
export async function toWebp(
    input: Uint8Array,
    maxSide: number = MEDIA_IMAGE_MAX_SIDE,
): Promise<Uint8Array | null> {
    try {
        const output = await sharp(input, { failOn: 'error' })
            .rotate()
            .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: MEDIA_WEBP_QUALITY })
            .toBuffer()
        return new Uint8Array(output)
    } catch (error) {
        console.warn('[webp] No se pudo convertir la imagen:', error instanceof Error ? error.message : error)
        return null
    }
}
