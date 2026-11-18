'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertCircle, CalendarRange, ChevronLeft, ChevronRight, Copy, Layers, Loader2, Undo2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
    addDays, buildBlockDays, dayErrors, eachDay, repeatWeek, weekStart,
} from '@/lib/nutrition/planning'
import { DayMacroEditor, NutritionDayTable, fillRows, rowFromDay, rowToInput, templateRow, type DayRow } from './NutritionDayTable'
import {
    PlannedDaysConflictError, clearPlannedDays, markDietScheduled, saveNutritionBlock,
    type BlockInput, type CalendarDay, type PlannedDayInput,
} from '@/data/nutrition/calendar'
import type { MacroDayTypeConfig, MacroDayTypeValues } from '@/data/nutrition/types'
import { nutritionCalendarKeys, useAssignableDiets, useNutritionCalendar } from '@/hooks/useNutritionCalendar'
import { nutritionHistoryKeys } from '@/hooks/useNutritionHistory'
import { notifyClientPlanUpdatedAction } from '@/lib/notifications/plan-update-actions'

interface NutritionCalendarTabProps {
    coachId: string
    clientId: string
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WEEKS_SHOWN = 4
const fmtInt = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmtDay = (d: string, pattern = 'd MMM') => format(parseISO(d), pattern, { locale: es })
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

type Target = MacroDayTypeValues

// ============================================================================
// MAIN
// ============================================================================

export function NutritionCalendarTab({ coachId, clientId }: NutritionCalendarTabProps) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const today = todayStr()
    const [weekOffset, setWeekOffset] = useState(0)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [planOpen, setPlanOpen] = useState(false)
    const [blockOpen, setBlockOpen] = useState(false)
    const [pending, setPending] = useState<null | (SaveRequest & { conflict?: string })>(null)
    const [saving, setSaving] = useState(false)

    const from = addDays(weekStart(today), weekOffset * 7)
    const to = addDays(from, WEEKS_SHOWN * 7 - 1)
    // Una semana más por delante para poder «repetir la semana anterior» en la primera fila
    const { data, isLoading, error, refetch } = useNutritionCalendar(clientId, addDays(from, -7), to)
    const byDate = useMemo(() => new Map((data ?? []).map(d => [d.day, d])), [data])
    const weeks = useMemo(
        () => Array.from({ length: WEEKS_SHOWN }, (_, w) => eachDay(addDays(from, w * 7), addDays(from, w * 7 + 6))),
        [from],
    )

    const selectedDays = useMemo(() => [...selected].sort(), [selected])
    const fullWeekSelected = selectedDays.length === 7 && weekStart(selectedDays[0]) === selectedDays[0]
        && selectedDays[6] === addDays(selectedDays[0], 6)

    const toggleDay = (date: string) => {
        if (date < today) return
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(date)) next.delete(date)
            else next.add(date)
            return next
        })
    }

    const toggleWeek = (days: string[]) => {
        const future = days.filter(d => d >= today)
        if (future.length === 0) return
        setSelected(prev => {
            const allIn = future.every(d => prev.has(d))
            const next = new Set(prev)
            future.forEach(d => (allIn ? next.delete(d) : next.add(d)))
            return next
        })
    }

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: nutritionCalendarKeys.client(clientId) })
        queryClient.invalidateQueries({ queryKey: nutritionHistoryKeys.client(clientId) })
        queryClient.invalidateQueries({ queryKey: nutritionCalendarKeys.diets(clientId) })
    }

    const save = async (request: SaveRequest, replace = false) => {
        setSaving(true)
        try {
            if (request.dietToSchedule) await markDietScheduled(request.dietToSchedule)
            const saved = request.days.length > 0
                ? await saveNutritionBlock({ coachId, clientId, block: request.block, days: request.days, replaceConflicts: replace })
                : null
            // Días que el coach ha dejado en el plan base dentro de la misma selección
            const cleared = request.clearDates?.length
                ? (await clearPlannedDays(coachId, clientId, request.clearDates)).cleared_dates.length
                : 0
            void notifyClientPlanUpdatedAction({ clientId, kind: 'macros' })
            toast({
                title: 'Calendario guardado',
                description: [
                    saved && `${saved.name}: ${saved.days} ${saved.days === 1 ? 'día planificado' : 'días planificados'}.`,
                    saved?.replaced_dates?.length && `Sustituidos: ${saved.replaced_dates.length}.`,
                    cleared && `Vuelven al plan base: ${cleared}.`,
                ].filter(Boolean).join(' '),
            })
            setPending(null)
            setPlanOpen(false)
            setBlockOpen(false)
            setSelected(new Set())
            refresh()
        } catch (err) {
            if (err instanceof PlannedDaysConflictError) {
                setPending({ ...request, conflict: err.message })
            } else {
                toast({ title: 'No se ha podido guardar', description: (err as Error).message, variant: 'destructive' })
            }
        } finally {
            setSaving(false)
        }
    }

    const backToBase = async () => {
        const dates = selectedDays.filter(d => byDate.get(d)?.source === 'planned')
        if (dates.length === 0) {
            toast({ title: 'Nada que quitar', description: 'Esos días ya siguen el plan base.' })
            return
        }
        setSaving(true)
        try {
            const result = await clearPlannedDays(coachId, clientId, dates)
            void notifyClientPlanUpdatedAction({ clientId, kind: 'macros' })
            toast({ title: 'Vuelven al plan base', description: `${result.cleared_dates.length} días.` })
            setSelected(new Set())
            refresh()
        } catch (err) {
            toast({ title: 'No se ha podido cambiar', description: (err as Error).message, variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    const repeatPrevious = (plusKcal: number) => {
        const startDay = selectedDays[0]
        const previous = eachDay(addDays(startDay, -7), addDays(startDay, -1)).map(d => byDate.get(d))
        if (previous.some(d => !d || d.source === 'none')) {
            toast({ title: 'Falta la semana anterior', description: 'La semana anterior no tiene objetivos que copiar.', variant: 'destructive' })
            return
        }
        const days = repeatWeek(previous.map(d => ({ ...d!, date: d!.day })), plusKcal) as PlannedDayInput[]
        void save({
            block: {
                name: `Semana del ${fmtDay(startDay)}`,
                kind: 'week',
                progression: { type: 'repeat_week', step_kcal: plusKcal },
                change_note: plusKcal ? `Semana anterior ${plusKcal > 0 ? '+' : ''}${plusKcal} kcal` : 'Repite la semana anterior',
            },
            days,
        })
    }

    if (isLoading) {
        return (
            <Card className="rounded-2xl border-border/70 p-4 sm:p-5 space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-64 w-full" />
            </Card>
        )
    }

    if (error) {
        return (
            <Card className="rounded-2xl border-border/70 p-6 text-center text-destructive">
                <AlertCircle className="mx-auto mb-2 h-6 w-6" />
                <p className="text-sm">Error al cargar el calendario</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>Reintentar</Button>
            </Card>
        )
    }


    return (
        <Card className="rounded-2xl border-border/70 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold">Calendario</h3>
                    <p className="text-sm text-muted-foreground">
                        Los días en gris siguen el plan base. Selecciona días o una semana para planificarlos.
                    </p>
                </div>
                <Button size="sm" className="rounded-full" onClick={() => setBlockOpen(true)}>
                    <Layers className="mr-1 h-4 w-4" />
                    Nuevo bloque
                </Button>
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o - WEEKS_SHOWN)} aria-label="Semanas anteriores">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Hoy</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekOffset(o => o + WEEKS_SHOWN)} aria-label="Semanas siguientes">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
                <span className="text-sm text-muted-foreground">{fmtDay(from)} – {fmtDay(to, 'd MMM yyyy')}</span>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                    <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5 pb-1.5 text-center text-xs font-semibold text-muted-foreground">
                        <span />
                        {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
                    </div>
                    <div className="space-y-1.5">
                        {weeks.map(days => (
                            <div key={days[0]} className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => toggleWeek(days)}
                                    disabled={days[6] < today}
                                    className="rounded-lg px-1 text-left text-xs text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
                                    title="Seleccionar la semana"
                                >
                                    Sem. {fmtDay(days[0])}
                                </button>
                                {days.map(date => (
                                    <DayCell
                                        key={date}
                                        date={date}
                                        day={byDate.get(date)}
                                        past={date < today}
                                        isToday={date === today}
                                        selected={selected.has(date)}
                                        onClick={() => toggleDay(date)}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-muted" />Plan base</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-primary bg-primary/10" />Día planificado</span>
                <span>E/D = entreno y descanso</span>
            </div>

            {selectedDays.length > 0 && (
                <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-lg">
                    <span className="mr-auto text-sm font-medium">
                        {selectedDays.length} {selectedDays.length === 1 ? 'día' : 'días'} seleccionados
                    </span>
                    <Button size="sm" onClick={() => setPlanOpen(true)} disabled={saving}>
                        <CalendarRange className="mr-1 h-4 w-4" />
                        Planificar
                    </Button>
                    {fullWeekSelected && (
                        <>
                            <Button size="sm" variant="outline" onClick={() => repeatPrevious(0)} disabled={saving}>
                                <Copy className="mr-1 h-4 w-4" />
                                Repetir semana anterior
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => repeatPrevious(100)} disabled={saving}>
                                … con +100 kcal
                            </Button>
                        </>
                    )}
                    <Button size="sm" variant="outline" onClick={backToBase} disabled={saving}>
                        <Undo2 className="mr-1 h-4 w-4" />
                        Volver al plan base
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected(new Set())} aria-label="Quitar selección">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <PlanDaysDialog
                open={planOpen}
                onOpenChange={setPlanOpen}
                coachId={coachId}
                clientId={clientId}
                dates={selectedDays}
                calendar={byDate}
                saving={saving}
                onSave={(request) => save(request)}
            />

            <BlockWizardDialog
                open={blockOpen}
                onOpenChange={setBlockOpen}
                coachId={coachId}
                clientId={clientId}
                today={today}
                calendar={byDate}
                saving={saving}
                onSave={(request) => save(request)}
            />

            <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Sustituir días ya planificados?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending?.conflict} Lo anterior quedará en el historial.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); if (pending) void save(pending, true) }}>
                            Sustituir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}

// ============================================================================
// DAY CELL
// ============================================================================

function DayCell({ date, day, past, isToday, selected, onClick }: {
    date: string
    day: CalendarDay | undefined
    past: boolean
    isToday: boolean
    selected: boolean
    onClick: () => void
}) {
    const planned = day?.source === 'planned'
    const cfg = day?.day_type_config
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={past}
            title={day?.block_name ? `${day.block_name}${day.label ? ` · ${day.label}` : ''}` : 'Plan base'}
            className={cn(
                'flex min-h-[76px] flex-col rounded-xl border p-1.5 text-left transition-colors',
                planned ? 'border-primary/60 bg-primary/10' : 'border-transparent bg-muted/60',
                past && 'opacity-50',
                !past && 'hover:border-primary/40',
                isToday && 'ring-2 ring-primary/50',
                selected && 'border-primary bg-primary/20 ring-2 ring-primary',
            )}
        >
            <span className="text-[11px] text-muted-foreground">{fmtDay(date, 'd')}</span>
            {!day || day.source === 'none' ? (
                <span className="mt-auto text-[11px] text-muted-foreground">Sin plan</span>
            ) : cfg ? (
                <span className="mt-auto text-[11px] leading-tight tabular-nums">
                    <span className="block font-semibold">E {fmtInt(cfg.training.kcal)}</span>
                    <span className="block text-muted-foreground">D {fmtInt(cfg.rest.kcal)}</span>
                </span>
            ) : (
                <span className="mt-auto leading-tight tabular-nums">
                    <span className="block text-sm font-semibold">{fmtInt(day.kcal)}</span>
                    <span className="block text-[10px] text-muted-foreground">{day.protein_g}/{day.carbs_g}/{day.fat_g}</span>
                </span>
            )}
            {planned && day?.label && (
                <span className="mt-0.5 truncate text-[10px] font-medium text-primary">{day.label}</span>
            )}
        </button>
    )
}

function DietSelect({ coachId, clientId, value, onChange }: {
    coachId: string; clientId: string; value: string; onChange: (v: string) => void
}) {
    const { data: diets } = useAssignableDiets(coachId, clientId)
    const statusLabel: Record<string, string> = { active: 'activa', scheduled: 'programada', draft: 'borrador' }
    return (
        <div className="space-y-1">
            <Label>Dieta por opciones</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="base">La de siempre (dieta activa)</SelectItem>
                    {(diets ?? []).map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name} · {statusLabel[d.status] ?? d.status}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
                Para una dieta solo de estos días, créala como borrador en «Dieta por opciones» y elígela aquí.
            </p>
        </div>
    )
}

type SaveRequest = { block: BlockInput; days: PlannedDayInput[]; dietToSchedule?: string | null; clearDates?: string[] }

const rowErrors = (rows: DayRow[]) => rows.filter(r => r.include).flatMap(r => dayErrors(rowToInput(r, null)))

function useDietChoice(coachId: string, clientId: string) {
    const { data: diets } = useAssignableDiets(coachId, clientId)
    return (choice: string) => {
        if (choice === 'base') return { dietPlanId: null, dietToSchedule: null }
        const diet = diets?.find(d => d.id === choice)
        return { dietPlanId: choice, dietToSchedule: diet?.status === 'draft' ? choice : null }
    }
}

// ============================================================================
// PLAN SELECTED DAYS
// ============================================================================

function PlanDaysDialog({ open, onOpenChange, coachId, clientId, dates, calendar, saving, onSave }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    dates: string[]
    calendar: Map<string, CalendarDay>
    saving: boolean
    onSave: (request: SaveRequest) => void
}) {
    const [rows, setRows] = useState<DayRow[]>([])
    const [selectedRow, setSelectedRow] = useState<string | null>(null)
    const [fillOpen, setFillOpen] = useState(false)
    const [fill, setFill] = useState<DayRow>(() => templateRow())
    const [name, setName] = useState('')
    const [diet, setDiet] = useState('base')
    const [note, setNote] = useState('')
    const resolveDiet = useDietChoice(coachId, clientId)
    const isWeek = dates.length === 7 && weekStart(dates[0]) === dates[0] && dates[6] === addDays(dates[0], 6)
    const defaultName = isWeek ? `Semana del ${dates[0] ? fmtDay(dates[0]) : ''}` : 'Días planificados'
    const planned = useMemo(() => new Set(dates.filter(d => calendar.get(d)?.source === 'planned')), [dates, calendar])

    // Cada vez que se abre, cada fila parte de lo que ese día tiene ahora (planificado o plan base)
    useEffect(() => {
        if (!open) return
        const first = dates.map(d => calendar.get(d)).find(d => d && d.source !== 'none')
        const initial = dates.map(d => rowFromDay(d, calendar.get(d), first ? rowFromDay(d, first).simple : undefined))
        setRows(initial)
        setSelectedRow(dates[0] ?? null)
        setFill(templateRow(initial[0]))
        setFillOpen(false)
        setName('')
        setDiet('base')
        setNote('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const applyFill = () => {
        setRows(rows => fillRows(rows, fill))
        setFillOpen(false)
    }

    const included = rows.filter(r => r.include)
    const errors = rowErrors(rows)
    const submit = () => {
        const { dietPlanId, dietToSchedule } = resolveDiet(diet)
        onSave({
            block: { name: name.trim() || defaultName, kind: isWeek ? 'week' : 'days', change_note: note.trim() || null },
            days: included.map(r => rowToInput(r, dietPlanId)),
            dietToSchedule: included.length ? dietToSchedule : null,
            clearDates: rows.filter(r => !r.include && planned.has(r.date)).map(r => r.date),
        })
    }
    const nothingToDo = included.length === 0 && !rows.some(r => !r.include && planned.has(r.date))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Planificar {dates.length} {dates.length === 1 ? 'día' : 'días'}</DialogTitle>
                    <DialogDescription>
                        Pulsa un día para cambiar sus macros; con «Auto» los hidratos completan las kcal. Mandan sobre el plan base solo esos días.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label>Nombre</Label>
                        <Input value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
                    </div>

                    {dates.length > 1 && (
                        <div className="rounded-xl border border-border/70">
                            <button
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
                                onClick={() => setFillOpen(o => !o)}
                            >
                                Mismos valores para todos los días
                                <ChevronRight className={cn('h-4 w-4 transition-transform', fillOpen && 'rotate-90')} />
                            </button>
                            {fillOpen && (
                                <div className="space-y-3 border-t border-border/70 p-3">
                                    <DayMacroEditor row={fill} onChange={setFill} bare />
                                    <Button type="button" size="sm" variant="outline" onClick={applyFill}>Aplicar a todos</Button>
                                </div>
                            )}
                        </div>
                    )}

                    <NutritionDayTable rows={rows} onChange={setRows} selected={selectedRow} onSelect={setSelectedRow} planned={planned} />

                    <DietSelect coachId={coachId} clientId={clientId} value={diet} onChange={setDiet} />
                    <div className="space-y-1">
                        <Label>Motivo del cambio (opcional)</Label>
                        <Input value={note} placeholder="ej: carga de hidratos antes de la maratón" onChange={(e) => setNote(e.target.value)} />
                    </div>
                    {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving || errors.length > 0 || nothingToDo}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// BLOCK WIZARD
// ============================================================================

type ProgressionType = 'none' | 'weekly' | 'within_week'
type Grams = Omit<Target, 'kcal'>
const ZERO_G: Grams = { protein_g: 0, carbs_g: 0, fat_g: 0 }
const WEEKLY_STEP: Grams = { protein_g: 0, carbs_g: 25, fat_g: 0 }

/** Gramos que se suman (pueden ser negativos), con su equivalente en kcal. */
function GramStepFields({ label, hint, value, onChange }: {
    label: string; hint: string; value: Grams; onChange: (g: Grams) => void
}) {
    const fields: { key: keyof Grams; label: string }[] = [
        { key: 'protein_g', label: 'Prot. (g)' },
        { key: 'carbs_g', label: 'HC (g)' },
        { key: 'fat_g', label: 'Grasa (g)' },
    ]
    const kcal = value.protein_g * 4 + value.carbs_g * 4 + value.fat_g * 9
    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_88px] items-end gap-2">
                {fields.map(f => (
                    <div key={f.key} className="space-y-1">
                        <span className="text-xs text-muted-foreground">{f.label}</span>
                        <Input
                            type="number"
                            inputMode="numeric"
                            value={value[f.key]}
                            onChange={(e) => onChange({ ...value, [f.key]: Math.round(Number(e.target.value) || 0) })}
                        />
                    </div>
                ))}
                <span className="pb-2 text-right text-sm font-semibold tabular-nums">{kcal > 0 ? '+' : ''}{fmtInt(kcal)} kcal</span>
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
    )
}

function BlockWizardDialog({ open, onOpenChange, coachId, clientId, today, calendar, saving, onSave }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    today: string
    calendar: Map<string, CalendarDay>
    saving: boolean
    onSave: (request: SaveRequest) => void
}) {
    const nextMonday = addDays(weekStart(today), 7)
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [start, setStart] = useState(nextMonday)
    const [weeks, setWeeks] = useState(4)
    const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
    const [useBase, setUseBase] = useState(true)
    const [draft, setDraft] = useState<DayRow>(() => rowFromDay(today, calendar.get(today)))
    const [selectedRow, setSelectedRow] = useState<string | null>(null)
    const [type, setType] = useState<ProgressionType>('weekly')
    const [startG, setStartG] = useState<Grams>(WEEKLY_STEP)
    const [stepG, setStepG] = useState<Grams>(WEEKLY_STEP)
    const [rows, setRows] = useState<DayRow[]>([])
    const [diet, setDiet] = useState('base')
    const [note, setNote] = useState('')
    const resolveDiet = useDietChoice(coachId, clientId)

    useEffect(() => {
        if (!open) return
        setStep(1); setName(''); setStart(nextMonday); setWeeks(4); setWeekdays([0, 1, 2, 3, 4, 5, 6])
        setUseBase(true); setDraft(rowFromDay(today, calendar.get(today))); setType('weekly'); setStepG(WEEKLY_STEP)
        setStartG(WEEKLY_STEP); setRows([]); setDiet('base'); setNote('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const changeType = (next: ProgressionType) => {
        setType(next)
        // «Sube cada semana» suele empezar ya con el primer escalón; dentro de la semana, desde el punto de partida
        setStartG(next === 'weekly' ? stepG : ZERO_G)
    }

    const end = addDays(start, weeks * 7 - 1)
    // «Plan base»: el que esté vigente al empezar el bloque (o hoy, si ese día aún no está cargado)
    const baseDay = calendar.get(start) ?? calendar.get(today)
    const hasBase = !!baseDay && baseDay.source !== 'none'
    const fromBase = useBase && hasBase
    const origin = rowToInput(fromBase ? rowFromDay(start, baseDay) : draft, null)
    const progression = type === 'none' ? { type: 'none', start_g: startG } : { type, start_g: startG, step_g: stepG }

    let preview: PlannedDayInput[] = []
    let previewError: string | null = null
    try {
        if (start < today) throw new Error('El bloque no puede empezar en el pasado.')
        preview = buildBlockDays({ start, end, base: origin, progression, weekdays }) as PlannedDayInput[]
        if (preview.length === 0) throw new Error('Elige al menos un día de la semana.')
    } catch (err) {
        previewError = (err as Error).message
    }

    const goToReview = () => {
        // La tabla parte de lo generado; a partir de aquí cada día se retoca a mano
        setRows(preview.map(d => rowFromDay(d.date, d)))
        setSelectedRow(preview[0]?.date ?? null)
        setStep(3)
    }
    const included = rows.filter(r => r.include)
    const errors = rowErrors(rows)

    const submit = () => {
        const { dietPlanId, dietToSchedule } = resolveDiet(diet)
        onSave({
            block: {
                name: name.trim() || (included.length
                    ? `Bloque ${fmtDay(included[0].date)} – ${fmtDay(included[included.length - 1].date)}`
                    : `Bloque ${fmtDay(start)}`),
                kind: weeks === 1 ? 'week' : 'block',
                progression: { ...progression, weeks, weekdays, base: fromBase ? 'plan_base' : 'custom' },
                change_note: note.trim() || null,
            },
            days: included.map(r => rowToInput(r, dietPlanId)),
            dietToSchedule,
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nuevo bloque · paso {step} de 3</DialogTitle>
                    <DialogDescription>
                        {step === 1 && 'Fechas y nombre del bloque.'}
                        {step === 2 && 'Punto de partida y progresión.'}
                        {step === 3 && 'Revisa cada día antes de guardar.'}
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label>Nombre</Label>
                            <Input value={name} placeholder="ej: Volumen noviembre" onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Empieza</Label>
                                <Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Semanas</Label>
                                <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Días de la semana</Label>
                            <div className="flex gap-1.5">
                                {WEEKDAYS.map((d, i) => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setWeekdays(w => (w.includes(i) ? w.filter(x => x !== i) : [...w, i].sort()))}
                                        className={cn(
                                            'h-9 w-9 rounded-full border text-sm font-medium',
                                            weekdays.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                                        )}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Del {fmtDay(start)} al {fmtDay(end, 'd MMM yyyy')}. Los días sin marcar siguen el plan base.</p>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 py-2">
                        <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                            <div>
                                <p className="text-sm font-medium">Partir del plan base</p>
                                <p className="text-xs text-muted-foreground">
                                    {hasBase && baseDay
                                        ? `Al empezar: ${baseDay.day_type_config ? `E ${fmtInt(baseDay.day_type_config.training.kcal)} / D ${fmtInt(baseDay.day_type_config.rest.kcal)}` : fmtInt(baseDay.kcal)} kcal`
                                        : 'El atleta no tiene plan base: escribe los valores.'}
                                </p>
                            </div>
                            <Switch checked={fromBase} onCheckedChange={setUseBase} disabled={!hasBase} />
                        </div>
                        {!fromBase && <DayMacroEditor row={draft} onChange={setDraft} hideLabel />}

                        <div className="space-y-1">
                            <Label>Progresión</Label>
                            <Select value={type} onValueChange={(v) => changeType(v as ProgressionType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin progresión (igual todos los días)</SelectItem>
                                    <SelectItem value="weekly">Sube cada semana</SelectItem>
                                    <SelectItem value="within_week">Sube durante la semana y vuelve al inicio</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <GramStepFields label="Empieza con" hint="Se suma ya el primer día (0 = el punto de partida)" value={startG} onChange={setStartG} />
                        {type !== 'none' && (
                            <GramStepFields
                                label={type === 'within_week' ? 'Cada día' : 'Cada semana'}
                                hint={type === 'within_week'
                                    ? 'Cada día planificado de la semana suma esto; la semana siguiente vuelve a empezar.'
                                    : 'Cada semana suma esto a la anterior.'}
                                value={stepG}
                                onChange={setStepG}
                            />
                        )}
                        <p className="text-xs text-muted-foreground">
                            En gramos; usa negativos para bajar (p. ej. −5 g de grasa). En el paso siguiente puedes retocar cada día.
                        </p>
                        <DietSelect coachId={coachId} clientId={clientId} value={diet} onChange={setDiet} />
                        <div className="space-y-1">
                            <Label>Motivo del cambio (opcional)</Label>
                            <Input value={note} placeholder="ej: volumen, +100 kcal cada semana" onChange={(e) => setNote(e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-2 py-2">
                        {previewError ? (
                            <p className="text-sm text-destructive">{previewError}</p>
                        ) : (
                            <NutritionDayTable rows={rows} onChange={setRows} selected={selectedRow} onSelect={setSelectedRow} />
                        )}
                        {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}
                        <p className="text-xs text-muted-foreground">
                            {included.length} {included.length === 1 ? 'día' : 'días'} planificados. Pulsa un día para cambiar sus macros antes de guardar.
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>Atrás</Button>}
                    {step < 3 ? (
                        <Button
                            onClick={() => (step === 2 ? goToReview() : setStep(s => s + 1))}
                            disabled={(step === 1 && (weekdays.length === 0 || start < today)) || (step === 2 && !!previewError)}
                        >
                            Siguiente
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={saving || !!previewError || included.length === 0 || errors.length > 0}>
                            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            Guardar bloque
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
