'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Activity, Battery, Check, Footprints, ListTodo, Loader2, Moon, Scale, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { BackfillModal } from '@/components/backfill/BackfillModal'
import { ProgressBackfillContent } from '@/components/backfill/ProgressBackfillContent'
import { DayNavigator } from '@/components/nutrition/DayNavigator'
import { cn } from '@/lib/utils'
import {
    DAILY_METRIC_EXTRAS,
    FATIGUE_LABELS,
    type DailyMetricExtra,
    type DailyMetricExtraKey,
} from '@/lib/daily-metrics'
import {
    getClientMetrics,
    getEnabledDailyMetricExtras,
    saveClientMetrics,
} from '@/data/progress'

interface RegistrarSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved?: () => void
    /** Día con el que se abre (p. ej. al tocar un día del registro) */
    initialDate?: Date | null
}

type ExtraValues = Partial<Record<DailyMetricExtra['column'], string>>

/** Número escrito con coma o punto; null si está vacío, NaN si no es válido */
function parseNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return null
    return Number(trimmed.replace(',', '.'))
}

function toInput(value: number | null | undefined) {
    return value === null || value === undefined ? '' : String(value).replace('.', ',')
}

const EXTRA_ICONS: Record<DailyMetricExtraKey, React.ComponentType<{ className?: string }>> = {
    hrv: Activity,
    sleep_score: Sparkles,
    fatigue: Battery,
}

export function RegistrarSheet({ open, onOpenChange, onSaved, initialDate }: RegistrarSheetProps) {
    const router = useRouter()
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [weight, setWeight] = useState('')
    const [steps, setSteps] = useState('')
    const [sleep, setSleep] = useState('')
    const [notes, setNotes] = useState('')
    const [extraValues, setExtraValues] = useState<ExtraValues>({})
    const [enabledExtras, setEnabledExtras] = useState<DailyMetricExtraKey[]>([])
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [isLoading, setIsLoading] = useState(false)
    const [backfillOpen, setBackfillOpen] = useState(false)

    const extras = DAILY_METRIC_EXTRAS.filter(extra => enabledExtras.includes(extra.key))

    // Adicionales que pide el coach y día inicial, en cada apertura
    useEffect(() => {
        if (!open) return
        setSelectedDate(initialDate ?? new Date())
        getEnabledDailyMetricExtras().then(setEnabledExtras).catch(() => setEnabledExtras([]))
    }, [open, initialDate])

    // Datos ya guardados del día elegido
    useEffect(() => {
        if (!open) return
        let isMounted = true

        async function load() {
            setIsLoading(true)
            try {
                const data = await getClientMetrics(selectedDate)
                if (!isMounted) return
                setWeight(toInput(data?.weight_kg))
                setSteps(data?.steps != null ? String(data.steps) : '')
                setSleep(toInput(data?.sleep_h))
                setNotes(data?.notes ?? '')
                setExtraValues({
                    hrv_ms: toInput(data?.hrv_ms),
                    sleep_score: toInput(data?.sleep_score),
                    fatigue: toInput(data?.fatigue),
                })
            } catch {
                // silent
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }
        load()
        return () => { isMounted = false }
    }, [open, selectedDate])

    const handleSave = async () => {
        const weightValue = parseNumber(weight)
        const stepsValue = parseNumber(steps)
        const sleepValue = parseNumber(sleep)

        if (weightValue !== null && (!Number.isFinite(weightValue) || weightValue < 20 || weightValue > 400)) {
            toast.error('Revisa el peso: debe estar entre 20 y 400 kg')
            return
        }
        if (stepsValue !== null && (!Number.isInteger(stepsValue) || stepsValue < 0 || stepsValue > 200000)) {
            toast.error('Revisa los pasos: un número entero')
            return
        }
        if (sleepValue !== null && (!Number.isFinite(sleepValue) || sleepValue < 0 || sleepValue > 24)) {
            toast.error('Revisa el sueño: entre 0 y 24 horas')
            return
        }

        // Solo se envían los adicionales activados: el resto se conserva tal cual
        const extrasPayload: Partial<Record<DailyMetricExtra['column'], number | null>> = {}
        for (const extra of extras) {
            const value = parseNumber(extraValues[extra.column] ?? '')
            if (value !== null && (!Number.isFinite(value) || value < extra.min || value > extra.max)) {
                toast.error(`Revisa ${extra.label}: entre ${extra.min} y ${extra.max}`)
                return
            }
            extrasPayload[extra.column] = value === null ? null : (extra.input === 'scale' || extra.key === 'sleep_score' ? Math.round(value) : value)
        }

        setSaveStatus('saving')
        try {
            const result = await saveClientMetrics({
                metric_date: format(selectedDate, 'yyyy-MM-dd'),
                weight_kg: weightValue ?? undefined,
                steps: stepsValue ?? undefined,
                sleep_h: sleepValue ?? undefined,
                notes: notes.trim() || undefined,
                extras: extrasPayload,
            })

            if (result.success) {
                setSaveStatus('saved')
                onSaved?.()
                setTimeout(() => {
                    setSaveStatus('idle')
                    onOpenChange(false)
                }, 900)
            } else {
                setSaveStatus('idle')
                if (result.sessionExpired) {
                    toast.error('Tu sesión ha caducado. Redirigiendo...')
                    setTimeout(() => router.push('/login'), 2000)
                } else {
                    toast.error(result.error ?? 'No se pudo guardar')
                }
            }
        } catch {
            setSaveStatus('idle')
            toast.error('Error inesperado. Por favor recarga la página.')
        }
    }

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="bottom" className="flex max-h-[92vh] flex-col rounded-t-3xl p-0">
                    <SheetHeader className="space-y-3 border-b border-border/60 px-4 pb-3 pt-5 text-left">
                        <SheetTitle className="text-lg">Registro del día</SheetTitle>
                        <DayNavigator date={selectedDate} onChange={setSelectedDate} className="mr-10" />
                    </SheetHeader>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-16">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Base */}
                                <div className="grid grid-cols-3 gap-2">
                                    <MetricTile icon={Scale} tone="text-primary bg-primary/10" label="Peso" unit="kg" value={weight} onChange={setWeight} placeholder="78,5" inputMode="decimal" />
                                    <MetricTile icon={Footprints} tone="text-emerald-600 bg-emerald-500/10 dark:text-emerald-400" label="Pasos" value={steps} onChange={setSteps} placeholder="10000" inputMode="numeric" />
                                    <MetricTile icon={Moon} tone="text-indigo-600 bg-indigo-500/10 dark:text-indigo-400" label="Sueño" unit="h" value={sleep} onChange={setSleep} placeholder="7,5" inputMode="decimal" />
                                </div>

                                {/* Adicionales que pide el coach */}
                                {extras.length > 0 && (
                                    <section className="space-y-2">
                                        <div className="px-0.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Adicionales</p>
                                            <p className="text-xs text-muted-foreground">Te los pide tu coach. Rellena los que tengas.</p>
                                        </div>
                                        <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
                                            {extras.map(extra => {
                                                const Icon = EXTRA_ICONS[extra.key]
                                                const value = extraValues[extra.column] ?? ''
                                                return (
                                                    <div key={extra.key} className="px-3 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                                                <Icon className="h-4 w-4" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-semibold">{extra.label}</p>
                                                                <p className="text-[11px] leading-snug text-muted-foreground">{extra.description}</p>
                                                            </div>
                                                            {extra.input === 'number' && (
                                                                <div className="flex shrink-0 items-baseline gap-1">
                                                                    <input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        value={value}
                                                                        onChange={(event) => setExtraValues(current => ({ ...current, [extra.column]: event.target.value }))}
                                                                        placeholder="—"
                                                                        aria-label={extra.label}
                                                                        className="h-10 w-16 rounded-lg border border-transparent bg-muted/60 px-2 text-center text-base font-semibold tabular-nums focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                                    />
                                                                    <span className="w-8 text-xs text-muted-foreground">{extra.unit}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {extra.input === 'scale' && (
                                                            <div className="mt-2.5 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={extra.label}>
                                                                {Array.from({ length: extra.max - extra.min + 1 }, (_, index) => extra.min + index).map(level => {
                                                                    const isActive = value === String(level)
                                                                    return (
                                                                        <button
                                                                            key={level}
                                                                            type="button"
                                                                            role="radio"
                                                                            aria-checked={isActive}
                                                                            onClick={() => setExtraValues(current => ({ ...current, [extra.column]: isActive ? '' : String(level) }))}
                                                                            className={cn(
                                                                                'flex flex-col items-center rounded-xl border py-1.5 transition-colors',
                                                                                isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 hover:bg-muted/60'
                                                                            )}
                                                                        >
                                                                            <span className="text-sm font-bold tabular-nums">{level}</span>
                                                                            <span className={cn('text-[9px] leading-tight', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                                                                                {FATIGUE_LABELS[level]}
                                                                            </span>
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Notas */}
                                <section className="space-y-2">
                                    <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notas del día</p>
                                    <Textarea
                                        placeholder="¿Cómo te has sentido hoy?"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="min-h-[72px] resize-none rounded-2xl text-sm"
                                    />
                                </section>

                                <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                    onClick={() => setBackfillOpen(true)}
                                >
                                    <ListTodo className="h-4 w-4" />
                                    Rellenar días pendientes
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-border/60 px-4 pb-[calc(var(--safe-area-bottom,0px)+0.75rem)] pt-3">
                        <Button
                            onClick={handleSave}
                            className="h-12 w-full rounded-xl text-base"
                            disabled={saveStatus === 'saving' || isLoading}
                        >
                            {saveStatus === 'saving' ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…</>
                            ) : saveStatus === 'saved' ? (
                                <><Check className="mr-2 h-4 w-4" /> Guardado</>
                            ) : (
                                'Guardar'
                            )}
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            <BackfillModal
                open={backfillOpen}
                onOpenChange={setBackfillOpen}
                title="Rellenar métricas pendientes"
            >
                {({ days, onClose }) => (
                    <ProgressBackfillContent
                        days={days}
                        onClose={onClose}
                        onSuccess={() => { onSaved?.() }}
                    />
                )}
            </BackfillModal>
        </>
    )
}

function MetricTile({
    icon: Icon,
    tone,
    label,
    unit,
    value,
    onChange,
    placeholder,
    inputMode,
}: {
    icon: React.ComponentType<{ className?: string }>
    tone: string
    label: string
    unit?: string
    value: string
    onChange: (value: string) => void
    placeholder: string
    inputMode: 'decimal' | 'numeric'
}) {
    return (
        <label className="flex flex-col rounded-2xl border border-border/70 bg-card p-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="flex items-center gap-1.5">
                <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', tone)}>
                    <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </span>
            <span className="mt-2 flex items-baseline gap-1">
                <input
                    type="text"
                    inputMode={inputMode}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className="w-full min-w-0 bg-transparent text-xl font-semibold tabular-nums placeholder:text-muted-foreground/40 focus:outline-none"
                />
                {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </span>
        </label>
    )
}
