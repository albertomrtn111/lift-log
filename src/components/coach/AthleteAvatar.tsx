'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface AthleteAvatarProps {
    initials: string
    avatarUrl?: string | null
    /** Tamaño del círculo y adornos (anillo, sombra) */
    className?: string
    /** Fondo, color y letra de las iniciales */
    fallbackClassName?: string
}

/**
 * Foto de perfil del atleta con sus iniciales de respaldo, que se ven si no
 * tiene foto o si la imagen no carga. Siempre va junto a su nombre, así que la
 * imagen es decorativa.
 */
export function AthleteAvatar({ initials, avatarUrl, className, fallbackClassName }: AthleteAvatarProps) {
    return (
        <Avatar className={className}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" className="object-cover" />}
            <AvatarFallback className={fallbackClassName}>{initials}</AvatarFallback>
        </Avatar>
    )
}
