'use client'

import { useEffect, useState, useTransition } from 'react'
import {
    Bell,
    BellOff,
    BellRing,
    CalendarClock,
    ClipboardCheck,
    ListTodo,
    Loader2,
    MessageSquare,
    Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import {
    getCoachNotificationPreferencesAction,
    updateCoachNotificationPreferencesAction,
} from './notification-settings-actions'

interface CoachPreferencesState {
    tasks_enabled: boolean
    reviews_enabled: boolean
    messages_enabled: boolean
    day_before_time: string
    same_day_time: string
}

const DEFAULT_PREFERENCES: CoachPreferencesState = {
    tasks_enabled: true,
    reviews_enabled: true,
    messages_enabled: true,
    day_before_time: '20:00',
    same_day_time: '09:00',
}

export function NotificationSettingsPanel() {
    const {
        permissionState,
        isSubscribed,
        isServerSynced,
        isLoading: pushLoading,
        subscribe,
        unsubscribe,
    } = usePushNotifications('/api/push/subscribe-coach')

    const [preferences, setPreferences] = useState<CoachPreferencesState>(DEFAULT_PREFERENCES)
    const [loadingPreferences, setLoadingPreferences] = useState(true)
    const [isSaving, startSaving] = useTransition()

    useEffect(() => {
        let cancelled = false
        async function load() {
            const result = await getCoachNotificationPreferencesAction()
            if (cancelled) return
            if (result.success && result.preferences) {
                setPreferences(result.preferences)
            }
            setLoadingPreferences(false)
        }
        load()
        return () => { cancelled = true }
    }, [])

    const handleSave = () => {
        startSaving(async () => {
            const result = await updateCoachNotificationPreferencesAction(preferences)
            if (result.success && result.preferences) {
                setPreferences(result.preferences)
                toast.success('Preferencias de notificación guardadas')
            } else {
                toast.error(result.error || 'No se pudieron guardar las preferencias')
            }
        })
    }

    const handleToggleDevice = async () => {
        if (isSubscribed && isServerSynced) {
            const ok = await unsubscribe()
            if (ok) toast.success('Notificaciones desactivadas en este dispositivo')
            else toast.error('No se pudo desactivar este dispositivo')
        } else {
            const ok = await subscribe()
            if (ok) toast.success('¡Notificaciones activadas en este dispositivo!')
            else if (permissionState === 'denied') {
                toast.error('El navegador tiene bloqueadas las notificaciones. Actívalas en los ajustes del navegador.')
            } else {
                toast.error('No se pudieron activar las notificaciones')
            }
        }
    }

    const deviceActive = isSubscribed && isServerSynced

    return (
        <div className="space-y-6">
            {/* Dispositivo */}
            <Card className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <Smartphone className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-semibold">Este dispositivo</h2>
                                {permissionState === 'unsupported' ? (
                                    <Badge variant="outline" className="bg-muted/60 text-muted-foreground">No compatible</Badge>
                                ) : deviceActive ? (
                                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">Activas</Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-muted/60 text-muted-foreground">Desactivadas</Badge>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Recibe en el móvil o el navegador los recordatorios de tareas,
                                los avisos de revisiones y los mensajes de tus atletas.
                            </p>
                            {permissionState === 'denied' && (
                                <p className="mt-1 text-xs text-destructive">
                                    El navegador tiene el permiso bloqueado: actívalo desde los ajustes del navegador y vuelve a intentarlo.
                                </p>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={handleToggleDevice}
                        disabled={pushLoading || permissionState === 'unsupported'}
                        variant={deviceActive ? 'outline' : 'default'}
                        className="shrink-0 self-start sm:self-center"
                    >
                        {pushLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : deviceActive ? (
                            <BellOff className="mr-2 h-4 w-4" />
                        ) : (
                            <BellRing className="mr-2 h-4 w-4" />
                        )}
                        {deviceActive ? 'Desactivar aquí' : 'Activar notificaciones'}
                    </Button>
                </div>
            </Card>

            {/* Preferencias */}
            <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold">Qué recibir y cuándo</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    Se aplica a todos tus dispositivos con notificaciones activas.
                </p>

                {loadingPreferences ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="mt-5 space-y-5">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-xl border p-4">
                                <div className="flex items-center gap-3">
                                    <ListTodo className="h-4 w-4 text-amber-600" />
                                    <div>
                                        <p className="text-sm font-medium">Tareas</p>
                                        <p className="text-xs text-muted-foreground">
                                            Recordatorio la víspera y el mismo día de cada tarea.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={preferences.tasks_enabled}
                                    onCheckedChange={(v) => setPreferences(p => ({ ...p, tasks_enabled: v }))}
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-xl border p-4">
                                <div className="flex items-center gap-3">
                                    <ClipboardCheck className="h-4 w-4 text-blue-600" />
                                    <div>
                                        <p className="text-sm font-medium">Revisiones</p>
                                        <p className="text-xs text-muted-foreground">
                                            Aviso la víspera y cuando se envían a tus atletas.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={preferences.reviews_enabled}
                                    onCheckedChange={(v) => setPreferences(p => ({ ...p, reviews_enabled: v }))}
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-xl border p-4">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="h-4 w-4 text-green-600" />
                                    <div>
                                        <p className="text-sm font-medium">Mensajes</p>
                                        <p className="text-xs text-muted-foreground">
                                            Push inmediato cuando un atleta te escribe.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    checked={preferences.messages_enabled}
                                    onCheckedChange={(v) => setPreferences(p => ({ ...p, messages_enabled: v }))}
                                />
                            </div>
                        </div>

                        <div className="rounded-xl border p-4">
                            <div className="flex items-center gap-2">
                                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-medium">Horarios de los recordatorios</p>
                            </div>
                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <Label htmlFor="day-before-time" className="text-xs">
                                        Recordatorio del día anterior
                                    </Label>
                                    <Input
                                        id="day-before-time"
                                        type="time"
                                        value={preferences.day_before_time}
                                        onChange={(e) => setPreferences(p => ({ ...p, day_before_time: e.target.value }))}
                                        className="mt-1.5"
                                    />
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        Tareas y revisiones de mañana. Por defecto 20:00.
                                    </p>
                                </div>
                                <div>
                                    <Label htmlFor="same-day-time" className="text-xs">
                                        Recordatorio del mismo día
                                    </Label>
                                    <Input
                                        id="same-day-time"
                                        type="time"
                                        value={preferences.same_day_time}
                                        onChange={(e) => setPreferences(p => ({ ...p, same_day_time: e.target.value }))}
                                        className="mt-1.5"
                                    />
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        Tareas de hoy. Por defecto 09:00.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar preferencias
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}
