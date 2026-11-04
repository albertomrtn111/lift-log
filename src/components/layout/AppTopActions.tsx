import { NotificationsButton } from '@/components/notifications/NotificationsButton'
import { ProfileButton } from './ProfileButton'

/**
 * Botones circulares arriba a la derecha (avisos y perfil). Dos círculos de 44px
 * con 8px entre ellos ocupan justo el pr-24 que reservan las cabeceras, y quedan
 * centrados con su bloque de título (pt-4 + 40px). Se van con el scroll junto al
 * título: fijos taparían los controles que se quedan arriba.
 */
export function AppTopActions() {
    return (
        <div className="absolute right-[calc(var(--safe-area-right,0px)+1rem)] top-[calc(var(--safe-area-top,0px)+0.875rem)] z-30 flex items-center gap-2">
            <NotificationsButton />
            <ProfileButton />
        </div>
    )
}
