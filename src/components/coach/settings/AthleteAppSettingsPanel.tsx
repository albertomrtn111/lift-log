'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    getAthleteAppSettingsAction,
    saveAthleteAppSettingsAction,
    type AthleteAppSettings,
} from '@/components/coach/settings/athlete-app-actions'

/** Interruptores de la app para los clientes de esta sala. */
export function AthleteAppSettingsPanel() {
    const [settings, setSettings] = useState<AthleteAppSettings | null>(null)
    const [isPending, startTransition] = useTransition()

    useEffect(() => { void getAthleteAppSettingsAction().then(setSettings) }, [])

    function save(next: AthleteAppSettings) {
        const previous = settings
        setSettings(next)
        startTransition(async () => {
            const result = await saveAthleteAppSettingsAction(next)
            if (result.success) return
            setSettings(previous)
            toast.error(result.error)
        })
    }

    if (!settings) {
        return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
    }

    return (
        <Card className="divide-y">
            <div className="flex items-center justify-between gap-4 p-4">
                <div>
                    <Label htmlFor="athlete-app-on" className="font-semibold">App para los clientes</Label>
                    <p className="text-sm text-muted-foreground">Sus sesiones hechas e informes. Apagada, los informes siguen llegando por enlace.</p>
                </div>
                <Switch
                    id="athlete-app-on"
                    checked={settings.athleteApp}
                    disabled={isPending}
                    onCheckedChange={athleteApp => save({ ...settings, athleteApp })}
                />
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
                <div>
                    <Label htmlFor="athlete-app-chat" className="font-semibold">Chat</Label>
                    <p className="text-sm text-muted-foreground">Los clientes pueden escribir al equipo desde la app.</p>
                </div>
                <Switch
                    id="athlete-app-chat"
                    checked={settings.chat}
                    disabled={isPending}
                    onCheckedChange={chat => save({ ...settings, chat })}
                />
            </div>
        </Card>
    )
}
