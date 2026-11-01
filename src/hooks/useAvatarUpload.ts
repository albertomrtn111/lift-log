'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** Lado máximo de la foto guardada: de sobra para un avatar y muy por debajo de 2 MB */
const MAX_SIDE = 800
/** Límite del bucket avatars */
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'

class AvatarUploadError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')) }
        image.src = url
    })
}

/**
 * Las fotos del móvil pesan 3–6 MB y el bucket admite 2 MB: se reducen a JPEG
 * de 800 px. El navegador ya aplica la orientación EXIF al dibujar la imagen.
 * Devuelve null si no se puede leer (se intenta subir el original).
 */
async function shrinkImage(file: File): Promise<Blob | null> {
    try {
        const image = await loadImage(file)
        const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return null
        // Fondo blanco para los PNG con transparencia
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    } catch {
        return null
    }
}

/** Sube la foto al bucket avatars y la guarda en profiles.avatar_url. Devuelve la URL nueva. */
async function uploadAvatar(file: File): Promise<string> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new AvatarUploadError('Tu sesión ha caducado. Vuelve a entrar.')

    const shrunk = await shrinkImage(file)
    if (!shrunk && !ALLOWED_TYPES.includes(file.type)) throw new AvatarUploadError('Usa una foto en JPG, PNG o WebP.')
    const body = shrunk ?? file
    if (body.size > MAX_BYTES) throw new AvatarUploadError('La imagen no puede superar 2 MB.')

    const ext = shrunk ? 'jpg' : file.type.split('/')[1]
    const path = `${user.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, body, { upsert: true, contentType: shrunk ? 'image/jpeg' : file.type })
    if (uploadError) throw uploadError

    // Cache-buster para que el navegador no use la imagen anterior
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatarUrl = `${publicUrl}?t=${Date.now()}`
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id)
    if (profileError) throw profileError
    return avatarUrl
}

/** Subida de la foto de perfil (perfil, bienvenida y aviso de foto) */
export function useAvatarUpload() {
    const queryClient = useQueryClient()
    const [uploading, setUploading] = useState(false)

    const upload = useCallback(async (file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
        setUploading(true)
        try {
            const url = await uploadAvatar(file)
            // El avatar del header y del perfil vienen de react-query, no del
            // server render: invalidar para que la foto nueva se vea al momento.
            await queryClient.invalidateQueries({ queryKey: ['client-context'] })
            return { ok: true, url }
        } catch (error) {
            console.error('[uploadAvatar]', error)
            return { ok: false, error: error instanceof AvatarUploadError ? error.message : 'No se pudo subir la foto. Inténtalo de nuevo.' }
        } finally {
            setUploading(false)
        }
    }, [queryClient])

    return { upload, uploading }
}
