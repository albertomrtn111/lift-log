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
import { macroKcal } from '@/lib/nutrition/macro-autofit'
import {
    addDays, buildBlockDays, dayErrors, eachDay, repeatWeek, weekStart,
} from '@/lib/nutrition/planning'
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

interface DayDraft {
    mode: 'simple' | 'day_type'
    simple: Target
    training: Target
    rest: Target
}

function draftFromDay(day: CalendarDay | undefined): DayDraft {
    const empty: Target = { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 }
    if (!day || day.source === 'none') return { mode: 'simple', simple: empty, training: empty, rest: empty }
    const simple = { kcal: day.kcal, protein_g: day.protein_g, carbs_g: day.carbs_g, fat_g: day.fat_g }
    if (day.day_type_config) {
        return { mode: 'day_type', simple, training: day.day_type_config.training, rest: day.day_type_config.rest }
    }
    return { mode: 'simple', simple, training: simple, rest: simple }
}

/** El objetivo que se guarda: con entreno/descanso, los macros de arriba son los de entreno. */
function draftToBase(draft: DayDraft) {
    if (draft.mode === 'day_type') {
        return { ...draft.training, day_type_config: { training: draft.training, rest: draft.rest } }
    }
    return { ...draft.simple, day_type_config: null }
}

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
    const [pending, setPending] = useState<null | { block: BlockInput; days: PlannedDayInput[]; dietToSchedule?: string | null; conflict?: string }>(null)
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

    const save = async (request: { block: BlockInput; days: PlannedDayInput[]; dietToSchedule?: string | null }, replace = false) => {
        setSaving(true)
        try {
            if (request.dietToSchedule) await markDietScheduled(request.dietToSchedule)
            const saved = await saveNutritionBlock({ coachId, clientId, block: request.block, days: request.days, replaceConflicts: replace })
            void notifyClientPlanUpdatedAction({ clientId, kind: 'macros' })
            toast({
                title: 'Calendario guardado',
                description: `${saved.name}: ${saved.days} ${saved.days === 1 ? 'día planificado' : 'días planificados'}.`
                    + (saved.replaced_dates?.length ? ` Sustituidos: ${saved.replaced_dates.length}.` : ''),
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

    const anchorDay = byDate.get(selectedDays[0] ?? today)

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
                initial={anchorDay}
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

// ============================================================================
// TARGET FIELDS
// ============================================================================

function TargetFields({ value, onChange }: { value: Target; onChange: (t: Target) => void }) {
    const fields: { key: keyof Target; label: string }[] = [
        { key: 'kcal', label: 'Kcal' },
        { key: 'protein_g', label: 'Prot. (g)' },
        { key: 'carbs_g', label: 'HC (g)' },
        { key: 'fat_g', label: 'Grasa (g)' },
    ]
    const fromMacros = macroKcal({ protein: value.protein_g, carbs: value.carbs_g, fat: value.fat_g })
    const gap = Math.round(value.kcal - fromMacros)
    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-4 gap-2">
                {fields.map(f => (
                    <div key={f.key} className="space-y-1">
                        <Label className="text-xs">{f.label}</Label>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={Number.isFinite(value[f.key]) ? value[f.key] : ''}
                            onChange={(e) => onChange({ ...value, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                        />
                    </div>
                ))}
            </div>
            {Math.abs(gap) > Math.max(50, value.kcal * 0.05) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                    Los macros suman {fmtInt(fromMacros)} kcal ({gap > 0 ? 'faltan' : 'sobran'} {fmtInt(Math.abs(gap))}).
                </p>
            )}
        </div>
    )
}

function DraftFields({ draft, onChange }: { draft: DayDraft; onChange: (d: DayDraft) => void }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                <div>
                    <p className="text-sm font-medium">Entreno y descanso</p>
                    <p className="text-xs text-muted-foreground">Dos juegos de macros; el atleta elige cada día.</p>
                </div>
                <Switch checked={draft.mode === 'day_type'} onCheckedChange={(on) => onChange({ ...draft, mode: on ? 'day_type' : 'simple' })} />
            </div>
            {draft.mode === 'simple' ? (
                <TargetFields value={draft.simple} onChange={(simple) => onChange({ ...draft, simple })} />
            ) : (
                <>
                    <p className="text-xs font-medium text-muted-foreground">Entreno</p>
                    <TargetFields value={draft.training} onChange={(training) => onChange({ ...draft, training })} />
                    <p className="text-xs font-medium text-muted-foreground">Descanso</p>
                    <TargetFields value={draft.rest} onChange={(rest) => onChange({ ...draft, rest })} />
                </>
            )}
        </div>
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

type SaveRequest = { block: BlockInput; days: PlannedDayInput[]; dietToSchedule?: string | null }

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

function PlanDaysDialog({ open, onOpenChange, coachId, clientId, dates, initial, saving, onSave }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    dates: string[]
    initial: CalendarDay | undefined
    saving: boolean
    onSave: (request: SaveRequest) => void
}) {
    const [draft, setDraft] = useState<DayDraft>(() => draftFromDay(initial))
    const [name, setName] = useState('')
    const [label, setLabel] = useState('')
    const [diet, setDiet] = useState('base')
    const [note, setNote] = useState('')
    const resolveDiet = useDietChoice(coachId, clientId)
    const isWeek = dates.length === 7 && weekStart(dates[0]) === dates[0] && dates[6] === addDays(dates[0], 6)
    const defaultName = isWeek ? `Semana del ${dates[0] ? fmtDay(dates[0]) : ''}` : 'Días planificados'

    // Cada vez que se abre, el formulario parte del primer día seleccionado
    useEffect(() => {
        if (!open) return
        setDraft(draftFromDay(initial))
        setName('')
        setLabel('')
        setDiet('base')
        setNote('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const base = draftToBase(draft)
    const errors = dayErrors(base)
    const submit = () => {
        const { dietPlanId, dietToSchedule } = resolveDiet(diet)
        onSave({
            block: { name: name.trim() || defaultName, kind: isWeek ? 'week' : 'days', change_note: note.trim() || null },
            days: dates.map(date => ({ date, ...base, label: label.trim() || null, diet_plan_id: dietPlanId })),
            dietToSchedule,
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Planificar {dates.length} {dates.length === 1 ? 'día' : 'días'}</DialogTitle>
                    <DialogDescription>
                        {dates.map(d => fmtDay(d, 'EEE d')).join(', ')}. Mandan sobre el plan base solo esos días.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Nombre</Label>
                            <Input value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Etiqueta del día</Label>
                            <Input value={label} maxLength={60} placeholder="ej: Carga HC" onChange={(e) => setLabel(e.target.value)} />
                        </div>
                    </div>
                    <DraftFields draft={draft} onChange={setDraft} />
                    <DietSelect coachId={coachId} clientId={clientId} value={diet} onChange={setDiet} />
                    <div className="space-y-1">
                        <Label>Motivo del cambio (opcional)</Label>
                        <Input value={note} placeholder="ej: carga de hidratos antes de la maratón" onChange={(e) => setNote(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving || errors.length > 0 || dates.length === 0}>
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
    const [draft, setDraft] = useState<DayDraft>(() => draftFromDay(calendar.get(today)))
    const [type, setType] = useState<ProgressionType>('weekly')
    const [stepKcal, setStepKcal] = useState(100)
    const [startKcal, setStartKcal] = useState(100)
    const [to, setTo] = useState<'carbs' | 'fat' | 'carbs_fat'>('carbs')
    const [diet, setDiet] = useState('base')
    const [note, setNote] = useState('')
    const resolveDiet = useDietChoice(coachId, clientId)

    useEffect(() => {
        if (!open) return
        setStep(1); setName(''); setStart(nextMonday); setWeeks(4); setWeekdays([0, 1, 2, 3, 4, 5, 6])
        setUseBase(true); setDraft(draftFromDay(calendar.get(today))); setType('weekly'); setStepKcal(100)
        setStartKcal(100); setTo('carbs'); setDiet('base'); setNote('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const changeType = (next: ProgressionType) => {
        setType(next)
        // «Sube cada semana» suele empezar ya con el primer escalón; dentro de la semana, desde el punto de partida
        setStartKcal(next === 'weekly' ? stepKcal : 0)
    }

    const end = addDays(start, weeks * 7 - 1)
    // «Plan base»: el que esté vigente al empezar el bloque (o hoy, si ese día aún no está cargado)
    const baseDay = calendar.get(start) ?? calendar.get(today)
    const hasBase = !!baseDay && baseDay.source !== 'none'
    const fromBase = useBase && hasBase
    const origin = fromBase ? draftToBase(draftFromDay(baseDay)) : draftToBase(draft)
    const progression = type === 'none' ? { type: 'none' } : { type, step_kcal: stepKcal, start_kcal: startKcal, to }

    let preview: PlannedDayInput[] = []
    let previewError: string | null = null
    try {
        if (start < today) throw new Error('El bloque no puede empezar en el pasado.')
        preview = buildBlockDays({ start, end, base: origin, progression, weekdays }) as PlannedDayInput[]
        if (preview.length === 0) throw new Error('Elige al menos un día de la semana.')
    } catch (err) {
        previewError = (err as Error).message
    }

    const previewByDate = new Map(preview.map(d => [d.date, d]))
    const previewWeeks = Array.from({ length: weeks + (weekStart(start) === start ? 0 : 1) }, (_, w) =>
        eachDay(addDays(weekStart(start), w * 7), addDays(weekStart(start), w * 7 + 6)).map(date => ({ date, day: previewByDate.get(date) })))

    const submit = () => {
        const { dietPlanId, dietToSchedule } = resolveDiet(diet)
        onSave({
            block: {
                name: name.trim() || `Bloque ${fmtDay(start)} – ${fmtDay(end)}`,
                kind: weeks === 1 ? 'week' : 'block',
                progression: { ...progression, weeks, weekdays, base: fromBase ? 'plan_base' : 'custom' },
                change_note: note.trim() || null,
            },
            days: preview.map(d => ({ ...d, diet_plan_id: dietPlanId })),
            dietToSchedule,
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
                        {!fromBase && <DraftFields draft={draft} onChange={setDraft} />}

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
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Empieza con (kcal)</Label>
                                <Input type="number" value={startKcal} onChange={(e) => setStartKcal(Number(e.target.value) || 0)} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{type === 'within_week' ? 'Cada día (kcal)' : 'Cada semana (kcal)'}</Label>
                                <Input type="number" value={stepKcal} disabled={type === 'none'} onChange={(e) => setStepKcal(Number(e.target.value) || 0)} />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Las kcal van a</Label>
                                <Select value={to} onValueChange={(v) => setTo(v as typeof to)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="carbs">Hidratos</SelectItem>
                                        <SelectItem value="fat">Grasa</SelectItem>
                                        <SelectItem value="carbs_fat">Mitad y mitad</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            La proteína no cambia. «Empieza con» se suma desde el primer día (pon 0 para empezar en el punto de partida).
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
                            <div className="overflow-x-auto">
                                <div className="min-w-[560px] space-y-1.5">
                                    <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted-foreground">
                                        {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
                                    </div>
                                    {previewWeeks.map(week => (
                                        <div key={week[0].date} className="grid grid-cols-7 gap-1.5">
                                            {week.map(({ date, day }) => (
                                                <div key={date} className={cn('rounded-lg p-1.5 text-xs tabular-nums', day ? 'border border-primary/50 bg-primary/10' : 'bg-muted/50 text-muted-foreground')}>
                                                    <span className="block text-[10px] text-muted-foreground">{fmtDay(date)}</span>
                                                    {day ? (
                                                        day.day_type_config
                                                            ? <span className="font-semibold">E {fmtInt(day.day_type_config.training.kcal)} · D {fmtInt(day.day_type_config.rest.kcal)}</span>
                                                            : <span className="font-semibold">{fmtInt(day.kcal)}</span>
                                                    ) : <span>base</span>}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {preview.length} días. Después podrás retocar cualquier día desde el calendario.
                        </p>
                    </div>
                )}

                <DialogFooter>
                    {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>Atrás</Button>}
                    {step < 3 ? (
                        <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && (weekdays.length === 0 || start < today)}>Siguiente</Button>
                    ) : (
                        <Button onClick={submit} disabled={saving || !!previewError || preview.some(d => dayErrors(d).length > 0)}>
                            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            Guardar bloque
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
