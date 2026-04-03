'use client'

import { useState } from 'react'
import { Bell, X, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'

function isIOS(): boolean {
    if (typeof window === 'undefined') return false
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isRunningAsPWA(): boolean {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
}

export function PushNotificationBanner() {
    const { permissionState, isSubscribed, isServerSynced, isLoading, subscribe, lastError } = usePushNotifications()
    const [dismissed, setDismissed] = useState(false)

    // No mostrar si lo descartó, ya denegó permisos, o no hay soporte
    if (dismissed || permissionState === 'denied' || permissionState === 'unsupported') {
        return null
    }

    // Solo ocultar si está completamente activo en servidor Y en browser
    if (isSubscribed && isServerSynced && permissionState === 'granted') {
        return null
    }

    const isiOS = isIOS()
    const isPWA = isRunningAsPWA()

    // iOS sin PWA: mostrar instrucciones de instalación
    if (isiOS && !isPWA) {
        return (
            <div className="mx-4 mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
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
                    onClick={() => setDismissed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        )
    }

    // Estado especial: suscripción en browser pero no en servidor
    const needsSync = isSubscribed && !isServerSynced && permissionState === 'granted'

    // Banner normal o de reintento
    return (
        <div className="mx-4 mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
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
                        : 'Recibe avisos cuando tu entrenador te manda un mensaje o revisa tu check-in.'
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
                            onClick={() => setDismissed(true)}
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
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
