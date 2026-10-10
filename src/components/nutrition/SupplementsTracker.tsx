'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, endOfWeek, format, isAfter, isToday, startOfDay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronDown, Clock, FlaskConical, Loader2, Pill, X } from 'lucide-react'
import { toast } from 'sonner'
import { ProgressRing } from '@/components/ui/progress-ring'
import { cn } from '@/lib/utils'

export interface ClientSupplement {
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

type DoseStatus = 'taken' | 'skipped'

interface DoseLog {
    id: string
    supplement_id: string
    scheduled_date: string
    scheduled_time: string
    status: DoseStatus
}

interface ScheduledDose {
    supplement: ClientSupplement
    /** "22:00" o "libre-1" si el coach no fijó hora */
    slot: string
}

const ANYTIME_PREFIX = 'libre-'

function doseKey(supplementId: string, slot: string) {
    return `${supplementId}:${slot}`
}

function isActiveOn(supplement: ClientSupplement, dateStr: string) {
    if (supplement.start_date && supplement.start_date > dateStr) return false
    if (supplement.end_date && supplement.end_date < dateStr) return false
    return true
}

/** Tomas del día: horas fijadas por el coach o, si no hay, N tomas "cuando quieras" */
function dosesFor(supplements: ClientSupplement[], dateStr: string): ScheduledDose[] {
    return supplements
        .filter(supplement => isActiveOn(supplement, dateStr))
        .flatMap(supplement => {
            const times = (supplement.dose_schedule ?? []).filter(time => /^\d{2}:\d{2}$/.test(time ?? ''))
            if (times.length > 0) return times.map(slot => ({ supplement, slot }))
            const count = Math.max(1, Number(supplement.daily_doses) || 1)
            return Array.from({ length: count }, (_, index) => ({ supplement, slot: `${ANYTIME_PREFIX}${index + 1}` }))
        })
}

function formatDose(supplement: ClientSupplement) {
    const amount = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(supplement.dose_amount))
    return `${amount} ${supplement.dose_unit}`.trim()
}

interface SupplementsTrackerProps {
    supplements: ClientSupplement[]
    date: Date
    onDateChange: (date: Date) => void
}

export function SupplementsTracker({ supplements, date, onDateChange }: SupplementsTrackerProps) {
    const [logsByDate, setLogsByDate] = useState<Record<string, Record<string, DoseLog>>>({})
    const [loading, setLoading] = useState(false)
    const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
    const [showPlan, setShowPlan] = useState(false)

    const dateStr = format(date, 'yyyy-MM-dd')
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekEndStr = format(endOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const isFutureDay = isAfter(startOfDay(date), startOfDay(new Date()))

    const loadWeek = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/supplements/logs?start=${weekStartStr}&end=${weekEndStr}`, { cache: 'no-store' })
            if (!res.ok) throw new Error('logs')
            const data = await res.json()
            const byDate: Record<string, Record<string, DoseLog>> = {}
            for (const log of (data.logs ?? []) as DoseLog[]) {
                byDate[log.scheduled_date] ??= {}
                byDate[log.scheduled_date][doseKey(log.supplement_id, log.scheduled_time)] = log
            }
            setLogsByDate(byDate)
        } catch {
            toast.error('No se pudo cargar tu registro de suplementos')
        } finally {
            setLoading(false)
        }
    }, [weekStartStr, weekEndStr])

    useEffect(() => {
        void loadWeek()
    }, [loadWeek])

    const doses = useMemo(() => dosesFor(supplements, dateStr), [supplements, dateStr])
    const dayLogs = logsByDate[dateStr] ?? {}
    const takenCount = doses.filter(dose => dayLogs[doseKey(dose.supplement.id, dose.slot)]?.status === 'taken').length
    const pendingDoses = doses.filter(dose => !dayLogs[doseKey(dose.supplement.id, dose.slot)])

    // Agrupar por hora; las tomas sin hora van al final como "Cuando quieras"
    const groups = useMemo(() => {
        const map = new Map<string, ScheduledDose[]>()
        for (const dose of doses) {
            const group = dose.slot.startsWith(ANYTIME_PREFIX) ? 'anytime' : dose.slot
            map.set(group, [...(map.get(group) ?? []), dose])
        }
        return [...map.entries()].sort(([a], [b]) => (a === 'anytime' ? 1 : b === 'anytime' ? -1 : a.localeCompare(b)))
    }, [doses])

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index)
        const key = format(day, 'yyyy-MM-dd')
        const scheduled = dosesFor(supplements, key)
        const logs = logsByDate[key] ?? {}
        const taken = scheduled.filter(dose => logs[doseKey(dose.supplement.id, dose.slot)]?.status === 'taken').length
        return { day, key, scheduled: scheduled.length, taken, future: isAfter(startOfDay(day), startOfDay(new Date())) }
    }), [weekStart, supplements, logsByDate])

    const weekStats = weekDays.filter(day => !day.future).reduce((acc, day) => ({
        scheduled: acc.scheduled + day.scheduled,
        taken: acc.taken + day.taken,
    }), { scheduled: 0, taken: 0 })

    // ---- Acciones ----

    const setSaving = (key: string, saving: boolean) => {
        setSavingKeys(current => {
            const next = new Set(current)
            if (saving) next.add(key)
            else next.delete(key)
            return next
        })
    }

    const applyLog = (key: string, log: DoseLog | null) => {
        setLogsByDate(current => {
            const day = { ...(current[dateStr] ?? {}) }
            if (log) day[key] = log
            else delete day[key]
            return { ...current, [dateStr]: day }
        })
    }

    const logDose = async (dose: ScheduledDose, status: DoseStatus) => {
        const key = doseKey(dose.supplement.id, dose.slot)
        const previous = dayLogs[key] ?? null
        setSaving(key, true)
        // Optimista: la marca aparece al instante
        applyLog(key, { id: previous?.id ?? `tmp-${key}`, supplement_id: dose.supplement.id, scheduled_date: dateStr, scheduled_time: dose.slot, status })
        try {
            const res = await fetch('/api/supplements/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supplementId: dose.supplement.id, scheduledDate: dateStr, scheduledTime: dose.slot, status }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'save')
            applyLog(key, data.log)
        } catch (error) {
            applyLog(key, previous)
            toast.error(error instanceof Error && error.message !== 'save' ? error.message : 'No se pudo guardar la toma')
        } finally {
            setSaving(key, false)
        }
    }

    const undoDose = async (dose: ScheduledDose) => {
        const key = doseKey(dose.supplement.id, dose.slot)
        const previous = dayLogs[key] ?? null
        if (!previous) return
        setSaving(key, true)
        applyLog(key, null)
        try {
            const res = await fetch('/api/supplements/logs', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ supplementId: dose.supplement.id, scheduledDate: dateStr, scheduledTime: dose.slot }),
            })
            if (!res.ok) throw new Error('undo')
        } catch {
            applyLog(key, previous)
            toast.error('No se pudo deshacer la toma')
        } finally {
            setSaving(key, false)
        }
    }

    const markAllTaken = async () => {
        await Promise.all(pendingDoses.map(dose => logDose(dose, 'taken')))
    }

    if (supplements.length === 0) {
        return (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <FlaskConical className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">Sin suplementación</p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">Tu coach añadirá aquí tu pauta de suplementos.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Semana */}
            <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Esta semana</p>
                    {weekStats.scheduled > 0 && (
                        <p className="text-xs tabular-nums text-muted-foreground">
                            <span className="font-semibold text-foreground">{Math.round((weekStats.taken / weekStats.scheduled) * 100)}%</span> de tomas
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {weekDays.map(day => {
                        const isSelected = day.key === dateStr
                        const progress = day.scheduled > 0 ? day.taken / day.scheduled : 0
                        return (
                            <button
                                key={day.key}
                                type="button"
                                disabled={day.future}
                                onClick={() => onDateChange(day.day)}
                                aria-label={`${format(day.day, "EEEE d 'de' MMMM", { locale: es })}: ${day.taken} de ${day.scheduled} tomas`}
                                className={cn(
                                    'flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors disabled:opacity-35',
                                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/60'
                                )}
                            >
                                <span className={cn('text-[11px] font-medium uppercase', isSelected || isToday(day.day) ? 'text-primary' : 'text-muted-foreground')}>
                                    {format(day.day, 'EEEEE', { locale: es })}
                                </span>
                                <ProgressRing value={day.future ? 0 : progress} size={30} stroke={3.5}>
                                    {!day.future && day.scheduled > 0 && progress >= 1 ? (
                                        <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />
                                    ) : (
                                        <span className="text-[10px] font-semibold">{format(day.day, 'd')}</span>
                                    )}
                                </ProgressRing>
                            </button>
                        )
                    })}
                </div>
            </section>

            {/* Día */}
            <section className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <ProgressRing value={doses.length > 0 ? takenCount / doses.length : 0} size={56} stroke={6}>
                    <span className="text-xs">{takenCount}/{doses.length}</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                        {doses.length === 0
                            ? 'Sin tomas este día'
                            : takenCount === doses.length
                                ? '¡Todo tomado!'
                                : `${doses.length - takenCount} ${doses.length - takenCount === 1 ? 'toma pendiente' : 'tomas pendientes'}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {isToday(date) ? 'Hoy' : format(date, "EEEE d 'de' MMMM", { locale: es })}
                        {loading && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
                    </p>
                </div>
                {pendingDoses.length > 1 && !isFutureDay && (
                    <button
                        type="button"
                        onClick={markAllTaken}
                        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Marcar todas
                    </button>
                )}
            </section>

            {/* Tomas */}
            {groups.map(([group, groupDoses]) => (
                <section key={group} className="space-y-2">
                    <h3 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {group === 'anytime' ? 'Cuando quieras' : group}
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                        {groupDoses.map((dose, index) => {
                            const key = doseKey(dose.supplement.id, dose.slot)
                            const log = dayLogs[key]
                            const saving = savingKeys.has(key)
                            const multipleAnytime = dose.slot.startsWith(ANYTIME_PREFIX) && Number(dose.supplement.daily_doses) > 1
                            return (
                                <div key={key} className={cn('flex items-center gap-3 px-4 py-3', index > 0 && 'border-t border-border/60')}>
                                    <button
                                        type="button"
                                        disabled={saving || isFutureDay}
                                        onClick={() => (log?.status === 'taken' ? undoDose(dose) : logDose(dose, 'taken'))}
                                        aria-label={log?.status === 'taken' ? `Desmarcar ${dose.supplement.supplement_name}` : `Marcar ${dose.supplement.supplement_name} como tomado`}
                                        className={cn(
                                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all disabled:opacity-50',
                                            log?.status === 'taken'
                                                ? 'border-success bg-success text-success-foreground'
                                                : log?.status === 'skipped'
                                                    ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
                                                    : 'border-border hover:border-primary'
                                        )}
                                    >
                                        {log?.status === 'taken' ? <Check className="h-4 w-4" strokeWidth={3} /> : log?.status === 'skipped' ? <X className="h-4 w-4" /> : null}
                                    </button>
                                    <div className={cn('min-w-0 flex-1', log?.status === 'skipped' && 'opacity-60')}>
                                        <p className={cn('truncate text-sm font-semibold', log?.status === 'skipped' && 'line-through')}>
                                            {dose.supplement.supplement_name}
                                            {multipleAnytime && <span className="font-normal text-muted-foreground"> · toma {dose.slot.slice(ANYTIME_PREFIX.length)}</span>}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {formatDose(dose.supplement)}
                                            {dose.supplement.notes ? ` · ${dose.supplement.notes}` : ''}
                                        </p>
                                    </div>
                                    {!isFutureDay && (
                                        log?.status === 'skipped' ? (
                                            <button type="button" onClick={() => undoDose(dose)} disabled={saving} className="shrink-0 text-xs font-medium text-primary">
                                                Deshacer
                                            </button>
                                        ) : !log ? (
                                            <button type="button" onClick={() => logDose(dose, 'skipped')} disabled={saving} className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">
                                                Omitir
                                            </button>
                                        ) : null
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </section>
            ))}

            {/* Pauta completa */}
            <section className="rounded-2xl border border-border/70 bg-card shadow-sm">
                <button
                    type="button"
                    onClick={() => setShowPlan(value => !value)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    aria-expanded={showPlan}
                >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                        <Pill className="h-4 w-4 text-muted-foreground" /> Tu pauta
                        <span className="text-xs font-normal text-muted-foreground">· {supplements.length} {supplements.length === 1 ? 'suplemento' : 'suplementos'}</span>
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showPlan && 'rotate-180')} />
                </button>
                {showPlan && (
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                        {supplements.map(supplement => {
                            const times = (supplement.dose_schedule ?? []).filter(time => /^\d{2}:\d{2}$/.test(time ?? ''))
                            return (
                                <li key={supplement.id} className="px-4 py-3">
                                    <p className="text-sm font-medium">{supplement.supplement_name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {formatDose(supplement)} · {times.length > 0 ? times.join(', ') : `${supplement.daily_doses || 1} ${Number(supplement.daily_doses) === 1 || !supplement.daily_doses ? 'toma' : 'tomas'} al día, cuando quieras`}
                                    </p>
                                    {(supplement.start_date || supplement.end_date) && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {supplement.start_date && `Desde ${format(new Date(`${supplement.start_date}T12:00:00`), 'd MMM yyyy', { locale: es })}`}
                                            {supplement.start_date && supplement.end_date && ' · '}
                                            {supplement.end_date && `Hasta ${format(new Date(`${supplement.end_date}T12:00:00`), 'd MMM yyyy', { locale: es })}`}
                                        </p>
                                    )}
                                    {supplement.notes && <p className="mt-1 text-xs italic text-muted-foreground">{supplement.notes}</p>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </div>
    )
}
