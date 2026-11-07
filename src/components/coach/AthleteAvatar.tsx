'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// Degradados de las iniciales, los mismos que las pantallas de la web comercial.
const GRADIENTS = [
    ['#2563EB', '#60A5FA'],
    ['#0D9488', '#2DD4BF'],
    ['#D97706', '#FBBF24'],
    ['#DB2777', '#F472B6'],
    ['#7C3AED', '#A78BFA'],
    ['#059669', '#34D399'],
] as const

/** Color estable por atleta: el mismo nombre (o id) da siempre el mismo degradado. */
export function athleteGradient(seed: string) {
    const [from, to] = GRADIENTS[[...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % GRADIENTS.length]
    return `linear-gradient(135deg, ${from}, ${to})`
}

interface AthleteAvatarProps {
    initials: string
    avatarUrl?: string | null
    /** Tamaño del círculo y adornos (anillo, sombra) */
    className?: string
    /** Fondo, color y letra de las iniciales */
    fallbackClassName?: string
    /** Con semilla, las iniciales van en blanco sobre un degradado propio del atleta */
    seed?: string
}

/**
 * Foto de perfil del atleta con sus iniciales de respaldo, que se ven si no
 * tiene foto o si la imagen no carga. Siempre va junto a su nombre, así que la
 * imagen es decorativa.
 */
export function AthleteAvatar({ initials, avatarUrl, className, fallbackClassName, seed }: AthleteAvatarProps) {
    return (
        <Avatar className={className}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" className="object-cover" />}
            <AvatarFallback
                className={cn(seed && 'font-semibold text-white', fallbackClassName)}
                style={seed ? { backgroundImage: athleteGradient(seed) } : undefined}
            >
                {initials}
            </AvatarFallback>
        </Avatar>
    )
}
