'use client'

import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export function PushNotificationBanner() {
    const { permissionState, isSubscribed, isLoading, subscribe } = usePushNotifications()
    const [dismissed, setDismissed] = useState(false)

    // No mostrar si: ya tiene permiso, lo denegó, no hay soporte, o lo descartó
    if (
        dismissed ||
        permissionState === 'granted' ||
        permissionState === 'denied' ||
        permissionState === 'unsupported' ||
        isSubscribed
    ) {
        return null
    }

    return (
        <div className="mx-4 mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bell className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Activa las notificaciones</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Recibe avisos cuando tu entrenador te manda un mensaje o revisa tu check-in.
                </p>
                <div className="flex gap-2 mt-3">
                    <Button
                        size="sm"
                        onClick={subscribe}
                        disabled={isLoading}
                        className="text-xs h-8"
                    >
                        {isLoading ? 'Activando...' : 'Activar'}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDismissed(true)}
                        className="text-xs h-8"
                    >
                        Ahora no
                    </Button>
                </div>
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
