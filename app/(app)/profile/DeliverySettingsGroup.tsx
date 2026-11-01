'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Dumbbell, Mail, Moon } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { SettingsGroup, SettingsRow } from '@/components/profile/settings-list'
import type { ClientDeliverySettings } from '@/lib/notifications/delivery-settings'
import { getDeliverySettingsAction, updateDeliverySettingsAction } from './actions'

const DEFAULTS: ClientDeliverySettings = {
    reviews_email_enabled: true,
    quiet_hours_enabled: true,
    quiet_start: '22:00',
    quiet_end: '08:00',
    timezone: null,
    workout_reminder_enabled: false,
    workout_reminder_time: '08:00',
    week_summary_enabled: true,
}

/** Perfil → «Cómo te llegan»: email de revisiones y horas de silencio. */
export function DeliverySettingsGroup() {
    const [settings, setSettings] = useState<ClientDeliverySettings>(DEFAULTS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let mounted = true
        getDeliverySettingsAction().then(result => {
            if (!mounted) return
            if (result.success && result.settings) setSettings(result.settings)
            setLoading(false)
        })
        return () => { mounted = false }
    }, [])

    const save = async (patch: Partial<ClientDeliverySettings>) => {
        const previous = settings
        setSettings({ ...settings, ...patch })
        setSaving(true)
        const result = await updateDeliverySettingsAction(patch)
        setSaving(false)
        if (result.success && result.settings) {
            setSettings(result.settings)
        } else {
            setSettings(previous)
            toast.error(result.error || 'No se pudo guardar')
        }
    }

    const disabled = loading || saving

    return (
        <SettingsGroup
            title="Cómo te llegan"
            footer={settings.timezone
                ? `Las horas se aplican en tu zona horaria (${settings.timezone}). Los recordatorios de suplementación y el entreno del día respetan su hora.`
                : 'Los recordatorios de suplementación y el entreno del día respetan su hora aunque sea de silencio.'}
        >
            <SettingsRow
                icon={Mail}
                iconTone="bg-sky-500/10 text-sky-600 dark:text-sky-400"
                title="Revisiones por email"
                description="Si no te llega el aviso al móvil, o si una revisión lleva un día sin responder"
                trailing={
                    <Switch
                        checked={settings.reviews_email_enabled}
                        disabled={disabled}
                        onCheckedChange={(checked) => save({ reviews_email_enabled: checked })}
                        aria-label="Recibir revisiones por email"
                    />
                }
            />
            <SettingsRow
                icon={Dumbbell}
                iconTone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
                title="Entreno del día"
                description={settings.workout_reminder_enabled
                    ? `A las ${settings.workout_reminder_time}, los días que tengas sesión`
                    : 'Un aviso con lo que toca hoy, a la hora que elijas'}
                trailing={
                    <Switch
                        checked={settings.workout_reminder_enabled}
                        disabled={disabled}
                        onCheckedChange={(checked) => save({ workout_reminder_enabled: checked })}
                        aria-label="Avisarme del entreno del día"
                    />
                }
            />
            {settings.workout_reminder_enabled && (
                <div className="flex items-center gap-3 px-3.5 py-3">
                    <label className="flex flex-1 items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Hora del aviso</span>
                        <input
                            type="time"
                            value={settings.workout_reminder_time}
                            disabled={disabled}
                            onChange={(e) => e.target.value && save({ workout_reminder_time: e.target.value })}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                        />
                    </label>
                </div>
            )}
            <SettingsRow
                icon={CalendarDays}
                iconTone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                title="Tu semana"
                description="Los lunes, en la campana: las sesiones que tienes por delante"
                trailing={
                    <Switch
                        checked={settings.week_summary_enabled}
                        disabled={disabled}
                        onCheckedChange={(checked) => save({ week_summary_enabled: checked })}
                        aria-label="Resumen de la semana"
                    />
                }
            />
            <SettingsRow
                icon={Moon}
                iconTone="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                title="Horas de silencio"
                description={settings.quiet_hours_enabled
                    ? `De ${settings.quiet_start} a ${settings.quiet_end}: los avisos esperan y te llegan juntos al terminar`
                    : 'Desactivadas: los avisos llegan a cualquier hora'}
                trailing={
                    <Switch
                        checked={settings.quiet_hours_enabled}
                        disabled={disabled}
                        onCheckedChange={(checked) => save({ quiet_hours_enabled: checked })}
                        aria-label="Activar horas de silencio"
                    />
                }
            />
            {settings.quiet_hours_enabled && (
                <div className="flex items-center gap-3 px-3.5 py-3">
                    <label className="flex flex-1 items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Desde</span>
                        <input
                            type="time"
                            value={settings.quiet_start}
                            disabled={disabled}
                            onChange={(e) => e.target.value && save({ quiet_start: e.target.value })}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                        />
                    </label>
                    <label className="flex flex-1 items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Hasta</span>
                        <input
                            type="time"
                            value={settings.quiet_end}
                            disabled={disabled}
                            onChange={(e) => e.target.value && save({ quiet_end: e.target.value })}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
                        />
                    </label>
                </div>
            )}
        </SettingsGroup>
    )
}
