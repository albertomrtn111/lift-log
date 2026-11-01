import type { SupabaseClient } from '@supabase/supabase-js'

export const CHECKIN_MEDIA_BUCKET = 'checkin-media'

export type CheckinMediaImageSize = 'thumbnail' | 'preview' | 'original'

const IMAGE_TRANSFORMS = {
    thumbnail: {
        width: 640,
        height: 640,
        resize: 'cover' as const,
        quality: 70,
    },
    preview: {
        width: 1600,
        height: 1600,
        resize: 'contain' as const,
        quality: 82,
    },
}

const SIGNED_URL_TTL_SECONDS = 3600
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

/**
 * URL firmada (1 h) de una foto de progreso. El bucket es privado: la firma solo se
 * concede si las políticas de storage dejan leer el archivo (coach del espacio o el
 * propio atleta). Se guarda en caché por ruta y tamaño para no pedirla en cada render.
 */
export async function getCheckinMediaImageUrl(
    supabase: SupabaseClient,
    path: string,
    size: CheckinMediaImageSize = 'original'
): Promise<string | null> {
    const key = `${size}:${path}`
    const cached = signedUrlCache.get(key)
    if (cached && cached.expiresAt > Date.now() + 60_000) {
        return cached.url
    }

    const options = size === 'original' ? undefined : { transform: IMAGE_TRANSFORMS[size] }
    const { data, error } = await supabase.storage
        .from(CHECKIN_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options)

    if (error || !data?.signedUrl) {
        console.error('[checkin-media] Signed URL error:', error)
        return null
    }

    signedUrlCache.set(key, {
        url: data.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    })
    return data.signedUrl
}
