'use client'

import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { AvatarCropDialog } from '@/components/profile/AvatarCropDialog'
import { toast } from '@/components/ui/sonner'
import { AVATAR_ACCEPT, useAvatarUpload } from '@/hooks/useAvatarUpload'

interface CoachAvatarUploaderProps {
    name: string
    initial: string
    avatarUrl: string | null
}

/**
 * Foto de perfil del coach en Ajustes › Perfil. Mismo flujo que la del atleta
 * en /profile: encuadre, JPEG en el navegador y POST /api/media/upload.
 */
export function CoachAvatarUploader({ name, initial, avatarUrl: serverAvatarUrl }: CoachAvatarUploaderProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [avatarToCrop, setAvatarToCrop] = useState<File | null>(null)
    const { upload, uploading } = useAvatarUpload()
    // La tarjeta viene del server render: la foto nueva se pinta ya, sin
    // esperar a router.refresh
    const [avatarUrl, setAvatarUrl] = useState(serverAvatarUrl)
    useEffect(() => setAvatarUrl(serverAvatarUrl), [serverAvatarUrl])

    const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        // Reset input para permitir elegir el mismo archivo otra vez
        e.target.value = ''
        if (file) setAvatarToCrop(file)
    }

    /** Sube el cuadrado ya encuadrado. Devuelve false si falla, para reintentar desde el diálogo. */
    const handleAvatarUpload = async (cropped: File): Promise<boolean> => {
        const result = await upload(cropped)
        if (!result.ok) {
            toast.error(result.error)
            return false
        }
        setAvatarUrl(result.url)
        setAvatarToCrop(null)
        toast.success('Foto de perfil actualizada')
        // El resto del panel (CoachContext) ya lo actualiza el hook
        router.refresh()
        return true
    }

    return (
        <div className="relative h-16 w-16 shrink-0">
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 text-2xl font-bold text-white">
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                ) : initial}
            </span>
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label={avatarUrl ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
                title={avatarUrl ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-card bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
            >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="hidden"
                onChange={handleAvatarPick}
            />
            <AvatarCropDialog
                file={avatarToCrop}
                onCancel={() => setAvatarToCrop(null)}
                onSave={handleAvatarUpload}
            />
        </div>
    )
}
