'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { prepareImageFile } from '@/lib/chat-image'
import { AVATAR_MAX_SIDE } from '@/lib/chat-image-rules'
import { uploadMedia } from '@/lib/media-upload'

/** Formatos que el servidor sabe convertir a WebP */
const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Sin «image/*»: así el iPhone convierte HEIC y ProRAW a JPEG al elegir la foto */
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'

/**
 * Subida de la foto de perfil (perfil, bienvenida y aviso de foto). Mismo flujo
 * que /profile: JPEG de 512 px en el navegador y POST /api/media/upload, que la
 * guarda en WebP en R2, actualiza profiles.avatar_url y borra la anterior.
 */
export function useAvatarUpload() {
    const queryClient = useQueryClient()
    const [uploading, setUploading] = useState(false)

    const upload = useCallback(async (file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
        setUploading(true)
        try {
            const prepared = await prepareImageFile(file, { maxSide: AVATAR_MAX_SIDE, alwaysConvert: true })
            if (!AVATAR_INPUT_TYPES.includes(prepared.mime)) {
                return { ok: false, error: 'Este formato de imagen no se puede usar. Prueba con una foto JPG o PNG.' }
            }
            const { data, error } = await uploadMedia<{ url: string }>({ kind: 'avatar' }, prepared.file, prepared.fileName)
            if (error || !data) return { ok: false, error: error ?? 'No se pudo subir la foto. Inténtalo de nuevo.' }

            // El avatar del header y del perfil vienen de react-query, no del
            // server render: invalidar para que la foto nueva se vea al momento.
            await queryClient.invalidateQueries({ queryKey: ['client-context'] })
            return { ok: true, url: data.url }
        } catch (error) {
            console.error('[uploadAvatar]', error)
            return { ok: false, error: 'No se pudo subir la foto. Inténtalo de nuevo.' }
        } finally {
            setUploading(false)
        }
    }, [queryClient])

    return { upload, uploading }
}
