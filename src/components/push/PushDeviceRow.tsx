'use client'

import { useState } from 'react'
import { BellOff, BellRing, Loader2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SettingsRow } from '@/components/profile/settings-list'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import {
    blockedPermissionHelp,
    describePushTest,
    isIOS,
    isRunningAsPWA,
    sendTestPush,
} from '@/lib/notifications/device'

/**
 * Estado del push en este móvil, dentro de Perfil → Notificaciones:
 * activarlo, saber por qué no llega y mandarse un aviso de prueba.
 */
export function PushDeviceRow() {
    const { permissionState, isSubscribed, isServerSynced, isLoading, subscribe } = usePushNotifications()
    const [testing, setTesting] = useState(false)

    const active = permissionState === 'granted' && isSubscribed && isServerSynced
    const needsInstall = permissionState === 'unsupported' && isIOS() && !isRunningAsPWA()

    const handleTest = async () => {
        setTesting(true)
        const result = describePushTest(await sendTestPush('client'))
        setTesting(false)
        if (result.ok) toast.success(result.message)
        else toast.error(result.message)
    }

    const handleActivate = async () => {
        const ok = await subscribe()
        if (ok) toast.success('Notificaciones activadas en este móvil')
        else if (Notification.permission === 'denied') toast.error(blockedPermissionHelp())
        else toast.error('No se pudieron activar las notificaciones')
    }

    let description: string
    let trailing: React.ReactNode = null
    if (active) {
        description = 'Activas. Te llegan los avisos de abajo.'
        trailing = (
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Probar
            </Button>
        )
    } else if (permissionState === 'denied') {
        description = `Bloqueadas. ${blockedPermissionHelp()}`
    } else if (needsInstall) {
        description = 'En iPhone solo llegan con la app en la pantalla de inicio: Compartir → «Añadir a pantalla de inicio».'
    } else if (permissionState === 'unsupported') {
        description = 'Este navegador no admite notificaciones.'
    } else {
        description = 'Desactivadas: solo verás los avisos dentro de la app.'
        trailing = (
            <Button size="sm" className="h-8 shrink-0 text-xs" onClick={handleActivate} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Activar
            </Button>
        )
    }

    return (
        <SettingsRow
            icon={active ? BellRing : permissionState === 'denied' ? BellOff : Smartphone}
            iconTone={active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}
            title="Este móvil"
            description={description}
            trailing={trailing}
        />
    )
}
