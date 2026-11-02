'use client'

import { useCallback, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { prepareImageFile } from '@/lib/chat-image'
import { AVATAR_MAX_SIDE } from '@/lib/chat-image-rules'
import { uploadMedia } from '@/lib/media-upload'

/** Formatos que el servidor sabe convertir a WebP */
const AVATAR_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Sin «image/*»: así el iPhone convierte HEIC y ProRAW a JPEG al elegir la foto */
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Contextos de react-query que llevan el perfil (atleta, coach y genérico) */
const PROFILE_QUERY_KEYS = [['client-context'], ['coach-context'], ['user-context']] as const

/** Lo que se espera a que el navegador tenga la foto nueva antes de cerrar el encuadre */
const PRELOAD_TIMEOUT_MS = 4000

/**
 * Subida de la foto de perfil (perfil del atleta, ajustes del coach, bienvenida
 * y aviso de foto): JPEG de 512 px en el navegador y POST /api/media/upload,
 * que la guarda en WebP en R2, actualiza profiles.avatar_url y borra la anterior.
 *
 * La foto nueva se ve al momento en toda la app: se descarga antes de devolver
 * el resultado y se escribe en la caché de react-query sin esperar a /api/me.
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

            // Con la foto ya en la caché del navegador, el cambio se ve sin parpadeo
            await preloadImage(data.url)
            setAvatarInCache(queryClient, data.url)
            // Y se confirma con el servidor (sin bloquear: la foto ya se ve)
            for (const queryKey of PROFILE_QUERY_KEYS) {
                void queryClient.invalidateQueries({ queryKey: [...queryKey] })
            }
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

function setAvatarInCache(queryClient: QueryClient, url: string) {
    for (const queryKey of PROFILE_QUERY_KEYS) {
        queryClient.setQueryData([...queryKey], (current: unknown) => {
            if (!current || typeof current !== 'object' || !('profile' in current)) return current
            const data = current as { profile: Record<string, unknown> | null }
            return { ...data, profile: { ...data.profile, avatar_url: url } }
        })
    }
}

/** Descarga la foto para que el <img> la pinte al instante; si tarda, se sigue igual */
function preloadImage(url: string): Promise<void> {
    return new Promise(resolve => {
        const img = new Image()
        const timer = window.setTimeout(resolve, PRELOAD_TIMEOUT_MS)
        const done = () => {
            window.clearTimeout(timer)
            resolve()
        }
        img.onload = done
        img.onerror = done
        img.src = url
    })
}
