import { NotificationsButton } from '@/components/notifications/NotificationsButton'
import { ProfileButton } from './ProfileButton'

/**
 * Píldora flotante arriba a la derecha con avisos y perfil. Queda alineada con
 * el bloque de título de las cabeceras (pt-4 + 40px), que reservan pr-24.
 */
export function AppTopActions() {
    return (
        <div className="fixed right-4 top-[calc(var(--safe-area-top,0px)+1rem)] z-50 flex h-10 items-center gap-1 rounded-full border border-border/60 bg-background/80 p-1 shadow-sm backdrop-blur-xl">
            <NotificationsButton />
            <ProfileButton />
        </div>
    )
}
