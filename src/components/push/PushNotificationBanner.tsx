'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, X, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import {
    blockedPermissionHelp,
    isDismissed,
    isIOS,
    isRunningAsPWA,
    rememberDismissal,
} from '@/lib/notifications/device'

/** «Ahora no» al aviso de activar: no insistir en 14 días. */
const DISMISS_KEY = 'nt:push-banner-dismissed-at'
const DISMISS_DAYS = 14
/** Aviso de permiso bloqueado: se explica una vez y no vuelve en 30 días. */
const BLOCKED_KEY = 'nt:push-blocked-dismissed-at'
const BLOCKED_DAYS = 30

export function PushNotificationBanner() {
    const { permissionState, isSubscribed, isServerSynced, isLoading, subscribe, lastError } = usePushNotifications()
    const [dismissed, setDismissed] = useState(true)

    // localStorage solo existe en el navegador: hasta leerlo, el banner no se muestra.
    useEffect(() => {
        setDismissed(permissionState === 'denied'
            ? isDismissed(BLOCKED_KEY, BLOCKED_DAYS)
            : isDismissed(DISMISS_KEY, DISMISS_DAYS))
    }, [permissionState])

    const dismiss = () => {
        rememberDismissal(permissionState === 'denied' ? BLOCKED_KEY : DISMISS_KEY)
        setDismissed(true)
    }

    // Sin soporte no hay nada que activar, salvo en iPhone fuera de la app instalada:
    // ahí el push existe, pero solo tras añadirla a la pantalla de inicio.
    if (dismissed || (permissionState === 'unsupported' && !(isIOS() && !isRunningAsPWA()))) {
        return null
    }

    // Solo ocultar si está completamente activo en servidor Y en browser
    if (isSubscribed && isServerSynced && permissionState === 'granted') {
        return null
    }

    const wrapperClassName = 'px-4 pt-[calc(var(--safe-area-top)+1rem)]'

    // Permiso bloqueado: explicar cómo desbloquearlo, una vez.
    if (permissionState === 'denied') {
        return (
            <div className={wrapperClassName}>
                <div className="p-4 bg-muted/60 border border-border rounded-xl flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <BellOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Las notificaciones están bloqueadas</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            No te llegarán los mensajes ni los recordatorios de tu entrenador. {blockedPermissionHelp()}
                        </p>
                    </div>
                    <button
                        onClick={dismiss}
                        aria-label="Cerrar"
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        )
    }

    // iOS sin PWA: mostrar instrucciones de instalación
    if (isIOS() && !isRunningAsPWA()) {
        return (
            <div className={wrapperClassName}>
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">Activa las notificaciones</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            En iPhone: pulsa el botón compartir{' '}
                            <Share className="inline h-3 w-3 -mt-0.5" />{' '}
                            y selecciona &quot;Añadir a pantalla de inicio&quot;, luego abre la app desde ahí.
                        </p>
                    </div>
                    <button
                        onClick={dismiss}
                        aria-label="Cerrar"
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        )
    }

    // Estado especial: suscripción en browser pero no en servidor
    const needsSync = isSubscribed && !isServerSynced && permissionState === 'granted'

    // Banner normal o de reintento
    return (
        <div className={wrapperClassName}>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bell className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                        {needsSync ? 'Notificaciones pendientes de activar' : 'Activa las notificaciones'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {needsSync
                            ? 'Las notificaciones no se guardaron correctamente. Pulsa para reintentar.'
                            : 'Recibe avisos de mensajes, revisiones y suplementación.'
                        }
                    </p>
                    <div className="flex gap-2 mt-3">
                        <Button
                            size="sm"
                            onClick={subscribe}
                            disabled={isLoading}
                            className="text-xs h-8"
                        >
                            {isLoading ? 'Activando...' : needsSync ? 'Reintentar' : 'Activar'}
                        </Button>
                        {!needsSync && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={dismiss}
                                className="text-xs h-8"
                            >
                                Ahora no
                            </Button>
                        )}
                    </div>
                    {lastError && (
                        <p className="text-xs text-destructive mt-1">{lastError}</p>
                    )}
                </div>
                <button
                    onClick={dismiss}
                    aria-label="Cerrar"
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
