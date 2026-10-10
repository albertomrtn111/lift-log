'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Plus,
    Dumbbell,
    Bed,
    Trash2,
    Loader2,
    Check,
    X,
    Coffee,
    UtensilsCrossed,
    Apple,
    Moon,
    Utensils,
    MoreHorizontal,
    Copy,
    ClipboardPaste,
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { MacroPlan } from '@/types/training'
import {
    getNutritionLogForDate,
    addNutritionLogEntriesBatch,
    deleteNutritionLogEntry,
    setDayTypeForDate,
    getDayTypeForDate,
    getNutritionMealSlotsForDate,
    createNutritionMealSlot,
    deleteNutritionMealSlot,
} from '@/data/nutrition/log'
import {
    type MealType,
    type DayType,
    type NutritionLogEntry,
} from '@/data/nutrition/tracking-types'
import { AddFoodDialog, EditNutritionEntryDialog } from './AddFoodDialog'
import { toast } from 'sonner'
import {
    buildMealSlotsForDate,
    buildPastedNutritionEntries,
    doesEntryBelongToMeal,
} from '@/lib/nutrition/meals'

interface MacrosTrackerProps {
    macroPlan: MacroPlan | null
    /** Día que se muestra (lo controla la página, compartido con Suplementos) */
    date: Date
}

interface MealSlot {
    id?: string
    type: MealType
    label: string
    order: number
    canDelete?: boolean
}

const DEFAULT_MEALS: MealSlot[] = [
    { type: 'breakfast', label: 'Desayuno', order: 0 },
    { type: 'lunch', label: 'Comida', order: 1 },
    { type: 'snack', label: 'Merienda', order: 2 },
    { type: 'dinner', label: 'Cena', order: 3 },
]

export function MacrosTracker({ macroPlan, date }: MacrosTrackerProps) {
    const [dayType, setDayType] = useState<DayType>('training')
    const [entries, setEntries] = useState<NutritionLogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [extraMeals, setExtraMeals] = useState<MealSlot[]>([])
    const [addingMealName, setAddingMealName] = useState(false)
    const [newMealName, setNewMealName] = useState('')

    const [addDialog, setAddDialog] = useState<MealSlot | null>(null)
    const [editingEntry, setEditingEntry] = useState<NutritionLogEntry | null>(null)
    const [mealClipboard, setMealClipboard] = useState<{ meal: MealSlot; entries: NutritionLogEntry[] } | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<NutritionLogEntry | null>(null)
    const [deleting, setDeleting] = useState(false)

    const loadDay = useCallback(async () => {
        setLoading(true)
        const [list, dt, slots] = await Promise.all([
            getNutritionLogForDate(date),
            getDayTypeForDate(date),
            getNutritionMealSlotsForDate(date),
        ])
        setEntries(list)
        const persistentMeals = buildMealSlotsForDate(DEFAULT_MEALS, slots).filter((meal: MealSlot) => meal.type === 'other')

        // Mantener visibles comidas custom legacy si tienen entradas en el día.
        const seenCustom = new Map<string, MealSlot>()
        persistentMeals.forEach((meal: MealSlot) => {
            seenCustom.set(`other:${meal.label}:${meal.order}`, meal)
        })
        list.forEach(e => {
            if (e.meal_type === 'other') {
                const key = `other:${e.meal_label ?? 'Otra'}:${e.meal_order}`
                if (!seenCustom.has(key)) {
                    seenCustom.set(key, {
                        type: 'other',
                        label: e.meal_label ?? 'Otra',
                        order: e.meal_order,
                    })
                }
            }
        })
        setExtraMeals(Array.from(seenCustom.values()))
        // day_type: prioridad → setting persistido > snapshot en entries > default
        if (dt) {
            setDayType(dt)
        } else if (list.length > 0 && list[0].day_type) {
            setDayType(list[0].day_type)
        }
        setLoading(false)
    }, [date])

    // Cargar registros, day_type y comidas extra cuando cambia la fecha
    useEffect(() => {
        void loadDay()
    }, [loadDay])

    const getEntriesForMeal = useCallback((meal: MealSlot, sourceEntries = entries) => {
        return sourceEntries.filter(entry => doesEntryBelongToMeal(entry, meal))
    }, [entries])

    const allMeals = useMemo<MealSlot[]>(() => {
        return [...DEFAULT_MEALS, ...extraMeals].sort((a, b) => a.order - b.order)
    }, [extraMeals])

    // Objetivos según day_type
    const targets = useMemo(() => {
        if (!macroPlan) return null
        if (macroPlan.day_type_config) {
            const t = macroPlan.day_type_config[dayType]
            return { kcal: t.kcal, protein: t.protein_g, carbs: t.carbs_g, fat: t.fat_g }
        }
        return {
            kcal: macroPlan.kcal,
            protein: macroPlan.protein,
            carbs: macroPlan.carbs,
            fat: macroPlan.fat,
        }
    }, [macroPlan, dayType])

    // Totales consumidos
    const totals = useMemo(() => {
        return entries.reduce(
            (acc, e) => {
                acc.kcal += Number(e.kcal) || 0
                acc.protein += Number(e.protein_g) || 0
                acc.carbs += Number(e.carbs_g) || 0
                acc.fat += Number(e.fat_g) || 0
                return acc
            },
            { kcal: 0, protein: 0, carbs: 0, fat: 0 }
        )
    }, [entries])

    const handleDayTypeChange = async (next: DayType) => {
        if (next === dayType) return
        const prev = dayType
        setDayType(next)
        const ok = await setDayTypeForDate(date, next)
        if (!ok) {
            setDayType(prev)
            toast.error('No se pudo guardar el tipo de día')
            return
        }
        // Refrescar entradas para reflejar snapshot
        const list = await getNutritionLogForDate(date)
        setEntries(list)
    }

    const handleAddCustomMeal = () => {
        const name = newMealName.trim()
        if (!name) return
        const newOrder = Math.max(...allMeals.map(m => m.order), 3) + 1
        ;(async () => {
            const slot = await createNutritionMealSlot(name, newOrder, date)
            if (!slot) {
                toast.error('No se pudo guardar la comida extra')
                return
            }
            setExtraMeals(prev => [...prev, {
                id: slot.id,
                type: 'other',
                label: slot.label,
                order: slot.order_index,
                canDelete: true,
            }])
            setNewMealName('')
            setAddingMealName(false)
        })()
    }

    const refreshEntries = async () => {
        const list = await getNutritionLogForDate(date)
        setEntries(list)
    }

    const pasteEntriesIntoMeal = async (sourceEntries: NutritionLogEntry[], targetMeal: MealSlot, successMessage: string) => {
        if (sourceEntries.length === 0) {
            toast.error('No hay alimentos para pegar')
            return
        }
        const payload = buildPastedNutritionEntries(sourceEntries, {
            date: format(date, 'yyyy-MM-dd'),
            dayType,
            targetMeal,
        })
        const inserted = await addNutritionLogEntriesBatch(payload)
        if (inserted.length === 0) {
            toast.error('No se pudo pegar la comida')
            return
        }
        toast.success(successMessage)
        await refreshEntries()
    }

    const handleCopyMeal = (meal: MealSlot) => {
        const mealEntries = getEntriesForMeal(meal)
        if (mealEntries.length === 0) {
            toast.error('Esta comida no tiene alimentos para copiar')
            return
        }
        setMealClipboard({ meal, entries: mealEntries })
        toast.success(`${meal.label} copiada`)
    }

    const handlePasteMeal = async (meal: MealSlot) => {
        if (!mealClipboard) {
            toast.error('Primero copia una comida')
            return
        }
        await pasteEntriesIntoMeal(mealClipboard.entries, meal, 'Comida pegada')
    }

    const handlePastePreviousDay = async (meal: MealSlot) => {
        const previousEntries = await getNutritionLogForDate(subDays(date, 1))
        const mealEntries = getEntriesForMeal(meal, previousEntries)
        await pasteEntriesIntoMeal(mealEntries, meal, 'Comida del día anterior pegada')
    }

    const handleDeleteCustomMeal = async (meal: MealSlot) => {
        if (!meal.canDelete || !meal.id) return
        const ok = await deleteNutritionMealSlot(meal.id, date)
        if (!ok) {
            toast.error('No se pudo eliminar la comida extra')
            return
        }
        toast.success('Comida extra eliminada')
        await loadDay()
    }

    const handleDelete = async () => {
        if (!confirmDelete) return
        setDeleting(true)
        const ok = await deleteNutritionLogEntry(confirmDelete.id)
        setDeleting(false)
        if (!ok) {
            toast.error('No se pudo eliminar')
            return
        }
        setConfirmDelete(null)
        await refreshEntries()
    }

    if (!macroPlan) {
        return (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Utensils className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold">Sin objetivos de macros</p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">Tu coach configurará tus objetivos pronto.</p>
            </div>
        )
    }

    if (!targets) return null

    const kcalRatio = targets.kcal > 0 ? totals.kcal / targets.kcal : 0
    const kcalLeft = Math.round(targets.kcal - totals.kcal)

    return (
        <div className="space-y-4">
            {/* Tipo de día */}
            {macroPlan.day_type_config && (
                <div className="grid grid-cols-2 rounded-full bg-muted p-1" role="tablist" aria-label="Tipo de día">
                    {([
                        { value: 'training', label: 'Día de entreno', icon: Dumbbell },
                        { value: 'rest', label: 'Día de descanso', icon: Bed },
                    ] as const).map(option => {
                        const Icon = option.icon
                        const isActive = dayType === option.value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => handleDayTypeChange(option.value)}
                                className={cn(
                                    'flex h-8 items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-all',
                                    isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {option.label}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Resumen del día */}
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <ProgressRing value={kcalRatio} size={96} stroke={8} className={cn(kcalLeft < 0 && '[&_circle:last-child]:stroke-destructive')}>
                        <span className="flex flex-col items-center leading-none">
                            <span className={cn('text-xl font-bold tabular-nums', kcalLeft < 0 && 'text-destructive')}>
                                {Math.abs(kcalLeft).toLocaleString('es-ES')}
                            </span>
                            <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                {kcalLeft < 0 ? 'de más' : 'restantes'}
                            </span>
                        </span>
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Calorías</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums">
                            {Math.round(totals.kcal).toLocaleString('es-ES')}
                            <span className="text-sm font-normal text-muted-foreground"> / {Math.round(targets.kcal).toLocaleString('es-ES')} kcal</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {loading ? (
                                <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Cargando…</span>
                            ) : entries.length === 0 ? 'Aún no has registrado nada este día' : `${entries.length} ${entries.length === 1 ? 'alimento registrado' : 'alimentos registrados'}`}
                        </p>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
                    <MacroColumn label="Proteína" consumed={totals.protein} target={targets.protein} colorText="text-rose-600 dark:text-rose-400" colorBar="bg-rose-500" />
                    <MacroColumn label="Hidratos" consumed={totals.carbs} target={targets.carbs} colorText="text-amber-600 dark:text-amber-400" colorBar="bg-amber-500" />
                    <MacroColumn label="Grasa" consumed={totals.fat} target={targets.fat} colorText="text-sky-600 dark:text-sky-400" colorBar="bg-sky-500" />
                </div>
            </section>

            {/* Comidas */}
            <div className="space-y-3">
                {allMeals.map(meal => (
                    <MealCard
                        key={`${meal.type}:${meal.label}:${meal.order}`}
                        meal={meal}
                        entries={entries.filter(e =>
                            doesEntryBelongToMeal(e, meal)
                        )}
                        onAdd={() => setAddDialog(meal)}
                        onCopy={() => handleCopyMeal(meal)}
                        onPaste={() => handlePasteMeal(meal)}
                        onPastePreviousDay={() => handlePastePreviousDay(meal)}
                        onDeleteMeal={() => handleDeleteCustomMeal(meal)}
                        canPaste={!!mealClipboard}
                        onDelete={(entry) => setConfirmDelete(entry)}
                        onEditEntry={setEditingEntry}
                    />
                ))}

                {addingMealName ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-sm">
                        <Input
                            autoFocus
                            placeholder="Nombre (p. ej. Pre-entreno)"
                            value={newMealName}
                            onChange={e => setNewMealName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleAddCustomMeal()
                                if (e.key === 'Escape') { setAddingMealName(false); setNewMealName('') }
                            }}
                            className="h-9"
                        />
                        <Button size="icon" variant="ghost" onClick={handleAddCustomMeal} aria-label="Crear comida"><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { setAddingMealName(false); setNewMealName('') }} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAddingMealName(true)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/80 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                        <Plus className="h-4 w-4" /> Añadir comida
                    </button>
                )}
            </div>

            {/* Diálogo de añadir alimento */}
            {addDialog && (
                <AddFoodDialog
                    open={true}
                    onOpenChange={(o) => { if (!o) setAddDialog(null) }}
                    date={date}
                    mealType={addDialog.type}
                    mealLabel={addDialog.label}
                    mealOrder={addDialog.order}
                    dayType={dayType}
                    onAdded={refreshEntries}
                />
            )}

            <EditNutritionEntryDialog
                open={!!editingEntry}
                onOpenChange={(open) => { if (!open) setEditingEntry(null) }}
                entry={editingEntry}
                onSaved={refreshEntries}
            />

            {/* Confirm delete */}
            <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Quitar alimento</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se quitará &quot;{confirmDelete?.item_name}&quot; del registro de este día.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                            {deleting ? 'Quitando…' : 'Quitar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------
function MacroColumn({
    label,
    consumed,
    target,
    colorText,
    colorBar,
}: {
    label: string
    consumed: number
    target: number
    colorText: string
    colorBar: string
}) {
    const safeTarget = target > 0 ? target : 0
    const pct = safeTarget > 0 ? Math.min(100, (consumed / safeTarget) * 100) : 0
    const left = Math.round(safeTarget - consumed)
    const over = left < 0
    return (
        <div className="min-w-0">
            <p className={cn('text-[11px] font-semibold', colorText)}>{label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {Math.round(consumed)}<span className="text-xs font-normal text-muted-foreground">/{Math.round(safeTarget)} g</span>
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full transition-[width] duration-500', over ? 'bg-destructive' : colorBar)} style={{ width: `${pct}%` }} />
            </div>
            <p className={cn('mt-1 text-[11px] tabular-nums', over ? 'text-destructive' : 'text-muted-foreground')}>
                {over ? `+${Math.abs(left)} g` : `quedan ${left} g`}
            </p>
        </div>
    )
}

const MEAL_META: Record<string, { icon: React.ComponentType<{ className?: string }>; tile: string }> = {
    breakfast: { icon: Coffee, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    lunch: { icon: UtensilsCrossed, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    snack: { icon: Apple, tile: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
    dinner: { icon: Moon, tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
    other: { icon: Utensils, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
}

function formatAmount(entry: NutritionLogEntry) {
    if (entry.quantity_g != null) return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Number(entry.quantity_g))} g`
    if (entry.servings != null) return `${entry.servings} ${Number(entry.servings) === 1 ? 'porción' : 'porciones'}`
    return null
}

function MealCard({
    meal,
    entries,
    onAdd,
    onCopy,
    onPaste,
    onPastePreviousDay,
    onDeleteMeal,
    canPaste,
    onDelete,
    onEditEntry,
}: {
    meal: MealSlot
    entries: NutritionLogEntry[]
    onAdd: () => void
    onCopy: () => void
    onPaste: () => void
    onPastePreviousDay: () => void
    onDeleteMeal: () => void
    canPaste: boolean
    onDelete: (e: NutritionLogEntry) => void
    onEditEntry: (e: NutritionLogEntry) => void
}) {
    const meta = MEAL_META[meal.type] ?? MEAL_META.other
    const Icon = meta.icon
    const sub = entries.reduce(
        (acc, e) => {
            acc.kcal += Number(e.kcal) || 0
            acc.p += Number(e.protein_g) || 0
            acc.c += Number(e.carbs_g) || 0
            acc.f += Number(e.fat_g) || 0
            return acc
        },
        { kcal: 0, p: 0, c: 0, f: 0 }
    )
    const hasEntries = entries.length > 0

    return (
        <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            {/* Cabecera de comida */}
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', meta.tile)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[15px] font-semibold leading-tight">{meal.label}</h4>
                    {hasEntries ? (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            <span className="font-semibold text-foreground">{Math.round(sub.kcal)} kcal</span>
                            {' · '}<span className="text-rose-600 dark:text-rose-400">P {Math.round(sub.p)}</span>
                            {' · '}<span className="text-amber-600 dark:text-amber-400">C {Math.round(sub.c)}</span>
                            {' · '}<span className="text-sky-600 dark:text-sky-400">G {Math.round(sub.f)}</span>
                        </p>
                    ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">Sin alimentos</p>
                    )}
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                            aria-label={`Acciones de ${meal.label}`}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={onCopy} disabled={!hasEntries}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar comida
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onPaste} disabled={!canPaste}>
                            <ClipboardPaste className="mr-2 h-4 w-4" />
                            Pegar comida copiada
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onPastePreviousDay}>
                            <ClipboardPaste className="mr-2 h-4 w-4" />
                            Repetir la del día anterior
                        </DropdownMenuItem>
                        {meal.canDelete && (
                            <DropdownMenuItem onClick={onDeleteMeal} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar comida
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label={`Añadir alimento a ${meal.label}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>

            {/* Alimentos */}
            {hasEntries && (
                <ul className="divide-y divide-border/60 border-t border-border/60">
                    {entries.map(e => (
                        <li key={e.id} className="flex items-center gap-2 pr-2">
                            <button
                                type="button"
                                onClick={() => onEditEntry(e)}
                                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-muted/30"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium leading-tight">{e.item_name}</p>
                                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                        {formatAmount(e) && <>{formatAmount(e)} · </>}
                                        <span className="text-rose-600/80 dark:text-rose-400/80">P {Math.round(Number(e.protein_g) * 10) / 10}</span>
                                        {' · '}<span className="text-amber-600/80 dark:text-amber-400/80">C {Math.round(Number(e.carbs_g) * 10) / 10}</span>
                                        {' · '}<span className="text-sky-600/80 dark:text-sky-400/80">G {Math.round(Number(e.fat_g) * 10) / 10}</span>
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums">{Math.round(Number(e.kcal))}<span className="text-xs font-normal text-muted-foreground"> kcal</span></span>
                            </button>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => onDelete(e)}
                                className="h-8 w-8 shrink-0 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Quitar ${e.item_name}`}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </article>
    )
}
