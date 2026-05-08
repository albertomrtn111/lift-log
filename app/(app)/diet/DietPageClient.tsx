'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Utensils,
    Flame,
    Beef,
    Wheat,
    Droplet,
    Footprints,
    Check,
    ChevronDown,
    MessageSquare,
    ListTodo,
    AlertCircle,
    CalendarIcon,
    FlaskConical,
    CheckCircle2,
    Circle,
    XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DietBackfillModal } from '@/components/backfill/DietBackfillModal'
import type { MacroPlan } from '@/types/training'
import { getDietAdherenceLog, saveDietAdherenceLog } from '@/data/diet-adherence'
import { toast } from 'sonner'
import { MacrosTracker } from '@/components/nutrition/MacrosTracker'

interface DietPlanMealItem {
    quantity: string
    name: string
    note?: string
}

interface DietPlanMealOption {
    title: string
    items: DietPlanMealItem[]
    notes?: string
}

interface DietPlanMeals {
    meals_per_day: number
    labels: string[]
    days: {
        default: Record<string, { options: DietPlanMealOption[] }>
    }
}

interface ParsedDietPlan {
    id: string
    name: string
    meals: DietPlanMeals
    effectiveFrom: string
}

interface ClientSupplement {
    id: string
    supplement_name: string
    dose_amount: number
    dose_unit: string
    daily_doses: number
    dose_schedule: string[]
    notes?: string
    start_date?: string
    end_date?: string
}

interface DietPageClientProps {
    macroPlan: MacroPlan | null
    dietPlan: ParsedDietPlan | null
    supplements: ClientSupplement[]
}

type SupplementDoseStatus = 'taken' | 'skipped'

interface SupplementDoseLog {
    id: string
    supplement_id: string
    scheduled_date: string
    scheduled_time: string
    status: SupplementDoseStatus
    logged_at: string
}

function doseKey(supplementId: string, time: string) {
    return `${supplementId}:${time}`
}

function isSupplementActiveOnDate(supplement: ClientSupplement, dateStr: string) {
    if (supplement.start_date && supplement.start_date > dateStr) return false
    if (supplement.end_date && supplement.end_date < dateStr) return false
    return true
}

export function DietPageClient({ macroPlan, dietPlan, supplements }: DietPageClientProps) {
    const [backfillOpen, setBackfillOpen] = useState(false)
    const [date, setDate] = useState<Date>(new Date())
    const [adherence, setAdherence] = useState(0) // Default 0 instead of 85
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [supplementLogs, setSupplementLogs] = useState<Record<string, SupplementDoseLog>>({})
    const [supplementLogsLoading, setSupplementLogsLoading] = useState(false)
    const [savingDoseKey, setSavingDoseKey] = useState<string | null>(null)

    // Load data when date changes
    useEffect(() => {
        let isMounted = true
        async function load() {
            setLoading(true)
            try {
                const log = await getDietAdherenceLog(date)
                if (isMounted) {
                    if (log) {
                        setAdherence(log.adherence_pct ?? 0)
                        setNotes(log.notes || '')
                    } else {
                        // Reset if no log exists
                        setAdherence(0)
                        setNotes('')
                    }
                }
            } catch (error) {
                console.error('Failed to load diet log', error)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()
        return () => { isMounted = false }
    }, [date])

    useEffect(() => {
        let isMounted = true
        async function loadSupplementLogs() {
            setSupplementLogsLoading(true)
            try {
                const dateStr = format(date, 'yyyy-MM-dd')
                const res = await fetch(`/api/supplements/logs?date=${dateStr}`, { cache: 'no-store' })
                if (!res.ok) throw new Error('logs')
                const data = await res.json()
                if (!isMounted) return

                const byDose: Record<string, SupplementDoseLog> = {}
                for (const log of data.logs || []) {
                    byDose[doseKey(log.supplement_id, log.scheduled_time)] = log
                }
                setSupplementLogs(byDose)
            } catch (error) {
                if (isMounted) setSupplementLogs({})
                console.error('Failed to load supplement logs', error)
            } finally {
                if (isMounted) setSupplementLogsLoading(false)
            }
        }

        loadSupplementLogs()
        return () => { isMounted = false }
    }, [date])

    const handleDoseLog = async (supplementId: string, scheduledTime: string, status: SupplementDoseStatus) => {
        const key = doseKey(supplementId, scheduledTime)
        setSavingDoseKey(key)
        try {
            const res = await fetch('/api/supplements/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplementId,
                    scheduledDate: format(date, 'yyyy-MM-dd'),
                    scheduledTime,
                    status,
                }),
            })
            if (!res.ok) throw new Error('save')
            const data = await res.json()
            setSupplementLogs((current) => ({
                ...current,
                [key]: data.log,
            }))
        } catch {
            toast.error('No se pudo guardar la toma')
        } finally {
            setSavingDoseKey(null)
        }
    }

    const handleSave = async () => {
        setSaveStatus('saving')
        try {
            const res = await saveDietAdherenceLog({
                date,
                adherence_pct: adherence,
                notes
            })

            if (res.success) {
                setSaveStatus('saved')
                toast.success('Adherencia guardada correctamente')
                setTimeout(() => setSaveStatus('idle'), 2000)
            } else {
                setSaveStatus('idle')
                toast.error('Error al guardar: ' + res.error)
            }
        } catch (e) {
            setSaveStatus('idle')
            toast.error('Error inesperado al guardar')
        }
    }

    const hasMacros = !!macroPlan
    const hasMeals = !!(dietPlan?.meals?.labels?.length)

    const hasSupplements = supplements.length > 0
    const defaultTab = hasMacros ? 'macros' : (hasMeals ? 'meals' : (hasSupplements ? 'supplements' : 'macros'))
    const selectedDateStr = format(date, 'yyyy-MM-dd')
    const supplementsForSelectedDate = supplements.filter((supplement) => isSupplementActiveOnDate(supplement, selectedDateStr))
    const scheduledSupplementDoses = supplementsForSelectedDate.flatMap((supplement) =>
        (supplement.dose_schedule || [])
            .filter(Boolean)
            .map((time) => ({ supplement, time }))
    ).sort((a, b) => a.time.localeCompare(b.time))
    const supplementTakenCount = scheduledSupplementDoses.filter(({ supplement, time }) =>
        supplementLogs[doseKey(supplement.id, time)]?.status === 'taken'
    ).length
    const supplementLoggedCount = scheduledSupplementDoses.filter(({ supplement, time }) =>
        supplementLogs[doseKey(supplement.id, time)]
    ).length

    return (
        <div className="app-mobile-page min-h-screen pb-4">
            {/* Header */}
            <header className="app-mobile-header bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Utensils className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Dieta</h1>
                            <p className="text-sm text-muted-foreground">Tu plan nutricional</p>
                        </div>
                    </div>
                </div>
            </header>

            <Tabs defaultValue={defaultTab} className="px-4 pt-4">
                <TabsList className="w-full grid grid-cols-3 mb-4">
                    <TabsTrigger value="macros">Macros</TabsTrigger>
                    <TabsTrigger value="meals">Plan de comidas</TabsTrigger>
                    <TabsTrigger value="supplements">Suplementos</TabsTrigger>
                </TabsList>

                <TabsContent value="macros" className="space-y-4 animate-fade-in">
                    <MacrosTracker macroPlan={macroPlan} />
                </TabsContent>

                <TabsContent value="meals" className="space-y-4 animate-fade-in">
                    {hasMeals ? (
                        <>
                            <div className="flex items-center gap-2 mb-4">
                                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                                    {dietPlan.name}
                                </Badge>
                            </div>

                            <p className="text-sm text-muted-foreground">
                                Opciones propuestas por tu entrenador. Elige combinaciones que encajen con tus macros.
                            </p>

                            {dietPlan.meals.labels.map((mealLabel) => {
                                const mealData = dietPlan.meals.days.default[mealLabel]
                                if (!mealData?.options?.length) return null

                                return (
                                    <Collapsible key={mealLabel} className="space-y-2">
                                        <Card className="overflow-hidden">
                                            <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                                <h3 className="font-semibold">{mealLabel}</h3>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary">{mealData.options.length} opciones</Badge>
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <div className="border-t border-border divide-y divide-border">
                                                    {mealData.options.map((option, optIdx) => (
                                                        <div key={optIdx} className="p-4">
                                                            <h4 className="font-medium text-sm mb-2">{option.title}</h4>
                                                            <ul className="space-y-1 mb-2">
                                                                {option.items.map((item, itemIdx) => (
                                                                    <li key={itemIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                                        <span className="text-primary">•</span>
                                                                        <span>
                                                                            {item.quantity && <strong>{item.quantity} </strong>}
                                                                            {item.name}
                                                                            {item.note && <span className="text-muted-foreground/70"> ({item.note})</span>}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                            {option.notes && (
                                                                <p className="text-xs text-primary bg-primary/5 px-2 py-1 rounded inline-block">
                                                                    💡 {option.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </CollapsibleContent>
                                        </Card>
                                    </Collapsible>
                                )
                            })}
                        </>
                    ) : (
                        <Card className="p-8 text-center">
                            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                            <h3 className="font-semibold text-lg">Sin plan de comidas</h3>
                            <p className="text-muted-foreground mt-2">
                                Tu entrenador aún no ha configurado un plan de comidas para ti.
                            </p>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="supplements" className="space-y-4 animate-fade-in">
                    {supplements.length > 0 ? (
                        <div className="space-y-4">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start gap-2">
                                        <CalendarIcon className="h-4 w-4" />
                                        {format(date, "EEEE, d 'de' MMMM", { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={(d) => d && setDate(d)}
                                        locale={es}
                                        disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                                    />
                                </PopoverContent>
                            </Popover>

                            <Card className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Tomas registradas</p>
                                        <p className="mt-1 text-2xl font-bold tabular-nums">
                                            {supplementTakenCount}
                                            <span className="text-base font-semibold text-muted-foreground">/{scheduledSupplementDoses.length}</span>
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                                        {scheduledSupplementDoses.length > 0 && supplementLoggedCount === scheduledSupplementDoses.length ? 'Día completo' : 'Pendiente'}
                                    </Badge>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{
                                            width: `${scheduledSupplementDoses.length ? (supplementTakenCount / scheduledSupplementDoses.length) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                            </Card>

                            <div className="space-y-3">
                                {scheduledSupplementDoses.length === 0 ? (
                                    <Card className="p-6 text-center">
                                        <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
                                        <p className="font-medium text-muted-foreground">Sin tomas programadas para este día</p>
                                    </Card>
                                ) : scheduledSupplementDoses.map(({ supplement: s, time }) => {
                                    const key = doseKey(s.id, time)
                                    const log = supplementLogs[key]
                                    const isSaving = savingDoseKey === key
                                    const isTaken = log?.status === 'taken'
                                    const isSkipped = log?.status === 'skipped'

                                    return (
                                        <Card key={key} className="p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                                                    {isTaken ? (
                                                        <CheckCircle2 className="h-5 w-5 text-success" />
                                                    ) : isSkipped ? (
                                                        <XCircle className="h-5 w-5 text-muted-foreground" />
                                                    ) : (
                                                        <Circle className="h-5 w-5 text-accent" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold text-foreground">{s.supplement_name}</p>
                                                            <p className="mt-0.5 text-sm text-muted-foreground">
                                                                {s.dose_amount} {s.dose_unit} · {time}
                                                            </p>
                                                        </div>
                                                        {log && (
                                                            <Badge variant={isTaken ? 'default' : 'secondary'} className="shrink-0">
                                                                {isTaken ? 'Tomado' : 'Omitido'}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {s.notes && (
                                                        <p className="mt-2 text-xs italic text-muted-foreground">{s.notes}</p>
                                                    )}

                                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant={isTaken ? 'default' : 'outline'}
                                                            disabled={isSaving || supplementLogsLoading}
                                                            onClick={() => handleDoseLog(s.id, time, 'taken')}
                                                            className="gap-2"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                            Tomado
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={isSkipped ? 'secondary' : 'outline'}
                                                            disabled={isSaving || supplementLogsLoading}
                                                            onClick={() => handleDoseLog(s.id, time, 'skipped')}
                                                        >
                                                            Omitir
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    )
                                })}
                            </div>

                            <Card className="p-4">
                                <h3 className="font-semibold">Pauta activa</h3>
                                <div className="mt-3 space-y-3">
                                    {supplementsForSelectedDate.map((s) => (
                                        <div key={s.id} className="rounded-lg border border-border p-3">
                                            <p className="font-medium text-foreground">{s.supplement_name}</p>
                                            <p className="mt-0.5 text-sm text-muted-foreground">
                                                {s.dose_amount} {s.dose_unit} · {s.daily_doses} {s.daily_doses === 1 ? 'toma' : 'tomas'} al día
                                            </p>
                                            {s.dose_schedule?.filter(t => t).length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {s.dose_schedule.filter(t => t).map((time, i) => (
                                                        <Badge key={i} variant="secondary" className="px-2 py-0.5 text-xs font-mono">
                                                            {time}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {(s.start_date || s.end_date) && (
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {s.start_date && `Desde ${format(new Date(s.start_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}`}
                                                    {s.start_date && s.end_date && ' · '}
                                                    {s.end_date && `Hasta ${format(new Date(s.end_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}`}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                                <FlaskConical className="h-7 w-7 text-muted-foreground opacity-40" />
                            </div>
                            <p className="font-medium text-muted-foreground">Sin suplementación prescrita</p>
                            <p className="text-sm text-muted-foreground/70 mt-1">Tu coach añadirá aquí tu pauta de suplementación</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Backfill Modal */}
            <DietBackfillModal
                open={backfillOpen}
                onOpenChange={setBackfillOpen}
            />
        </div>
    )
}
