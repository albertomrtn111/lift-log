'use client'

import { useEffect, useState, useTransition } from 'react'
import { Activity, Battery, ClipboardList, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { DAILY_METRIC_EXTRAS, type DailyMetricExtraKey } from '@/lib/daily-metrics'
import { getAthleteDailyMetricsAction, setAthleteDailyMetricsAction } from './daily-metrics-actions'

const ICONS: Record<DailyMetricExtraKey, React.ComponentType<{ className?: string }>> = {
    hrv: Activity,
    sleep_score: Sparkles,
    fatigue: Battery,
}

/** Qué medidas diarias adicionales ve el atleta en su registro */
export function AthleteDailyMetricsCard({ clientId }: { clientId: string }) {
    const [enabled, setEnabled] = useState<DailyMetricExtraKey[]>([])
    const [loading, setLoading] = useState(true)
    const [isSaving, startSaving] = useTransition()

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        getAthleteDailyMetricsAction(clientId)
            .then(keys => { if (!cancelled) setEnabled(keys) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [clientId])

    const toggle = (key: DailyMetricExtraKey, on: boolean) => {
        const previous = enabled
        const next = on ? [...enabled, key] : enabled.filter(item => item !== key)
        setEnabled(next)
        startSaving(async () => {
            const result = await setAthleteDailyMetricsAction(clientId, next)
            if (!result.success) {
                setEnabled(previous)
                toast.error(result.error ?? 'No se pudo guardar')
            }
        })
    }

    return (
        <Card className="p-4">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardList className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">Registro diario</h3>
                    <p className="text-xs text-muted-foreground">
                        Peso, pasos y horas de sueño se piden siempre. Activa las medidas adicionales que quieres que registre este atleta.
                    </p>
                </div>
            </div>

            <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/70">
                {DAILY_METRIC_EXTRAS.map(extra => {
                    const Icon = ICONS[extra.key]
                    const isOn = enabled.includes(extra.key)
                    return (
                        <label key={extra.key} className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                    {extra.label} <span className="font-normal text-muted-foreground">({extra.rangeLabel})</span>
                                </span>
                                <span className="block text-xs text-muted-foreground">{extra.description}</span>
                            </span>
                            <Switch
                                checked={isOn}
                                disabled={loading || isSaving}
                                onCheckedChange={(checked) => toggle(extra.key, checked)}
                                aria-label={`Pedir ${extra.label}`}
                            />
                        </label>
                    )
                })}
            </div>
        </Card>
    )
}
