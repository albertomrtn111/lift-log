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

export function getCheckinMediaImageUrl(
    supabase: SupabaseClient,
    path: string,
    size: CheckinMediaImageSize = 'original'
): string {
    const options = size === 'original' ? undefined : { transform: IMAGE_TRANSFORMS[size] }
    const { data } = supabase.storage.from(CHECKIN_MEDIA_BUCKET).getPublicUrl(path, options)
    return data.publicUrl
}
