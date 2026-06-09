'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
    Flame,
    Beef,
    Wheat,
    Droplet,
    CalendarIcon,
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

export function MacrosTracker({ macroPlan }: MacrosTrackerProps) {
    const [date, setDate] = useState<Date>(new Date())
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
            <div className="text-center py-12 text-muted-foreground">
                <p>Aún no tienes un plan de macros asignado.</p>
                <p className="text-xs mt-2">Tu coach configurará tus objetivos pronto.</p>
            </div>
        )
    }

    if (!targets) return null

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Fecha + selector entreno/descanso */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full sm:w-[220px] justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(date, "PPP", { locale: es })}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(d) => d && setDate(d)}
                            initialFocus
                            disabled={(d) => d > new Date() || d < new Date('1900-01-01')}
                        />
                    </PopoverContent>
                </Popover>

                {macroPlan.day_type_config && (
                    <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md w-full sm:w-auto">
                        <Button
                            variant={dayType === 'training' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleDayTypeChange('training')}
                            className="h-8"
                        >
                            <Dumbbell className="h-3.5 w-3.5 mr-1.5" /> Entreno
                        </Button>
                        <Button
                            variant={dayType === 'rest' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => handleDayTypeChange('rest')}
                            className="h-8"
                        >
                            <Bed className="h-3.5 w-3.5 mr-1.5" /> Descanso
                        </Button>
                    </div>
                )}
            </div>

            {/* Resumen del día */}
            <Card className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Flame className="h-4 w-4 text-accent" /> Resumen
                    </h3>
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                <MacroBar
                    label="Calorías"
                    consumed={totals.kcal}
                    target={targets.kcal}
                    unit="kcal"
                    icon={<Flame className="h-4 w-4 text-blue-500" />}
                    color="bg-blue-500"
                    big
                />
                <div className="grid grid-cols-1 gap-3">
                    <MacroBar
                        label="Proteína"
                        consumed={totals.protein}
                        target={targets.protein}
                        unit="g"
                        icon={<Beef className="h-4 w-4 text-destructive" />}
                        color="bg-destructive"
                    />
                    <MacroBar
                        label="Carbohidratos"
                        consumed={totals.carbs}
                        target={targets.carbs}
                        unit="g"
                        icon={<Wheat className="h-4 w-4 text-pink-500" />}
                        color="bg-pink-500"
                    />
                    <MacroBar
                        label="Grasa"
                        consumed={totals.fat}
                        target={targets.fat}
                        unit="g"
                        icon={<Droplet className="h-4 w-4 text-warning/80" />}
                        color="bg-warning/80"
                    />
                </div>
            </Card>

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
                    <Card className="p-3 flex items-center gap-2">
                        <Input
                            autoFocus
                            placeholder="Nombre de la comida (p. ej. Pre-entreno)"
                            value={newMealName}
                            onChange={e => setNewMealName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleAddCustomMeal()
                                if (e.key === 'Escape') { setAddingMealName(false); setNewMealName('') }
                            }}
                        />
                        <Button size="icon" variant="ghost" onClick={handleAddCustomMeal}><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { setAddingMealName(false); setNewMealName('') }}><X className="h-4 w-4" /></Button>
                    </Card>
                ) : (
                    <Button variant="outline" className="w-full" onClick={() => setAddingMealName(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Añadir comida
                    </Button>
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
                        <AlertDialogTitle>Eliminar entrada</AlertDialogTitle>
                        <AlertDialogDescription>
                            Quitar &quot;{confirmDelete?.item_name}&quot; del registro de hoy.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                            {deleting ? 'Eliminando…' : 'Eliminar'}
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
function MacroBar({
    label,
    consumed,
    target,
    unit,
    icon,
    color,
    big,
}: {
    label: string
    consumed: number
    target: number
    unit: string
    icon: React.ReactNode
    color: string
    big?: boolean
}) {
    const safeTarget = target > 0 ? target : 0
    const pct = safeTarget > 0 ? Math.min(100, (consumed / safeTarget) * 100) : 0
    const remaining = Math.max(0, safeTarget - consumed)
    const over = consumed > safeTarget && safeTarget > 0
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    {icon}
                    <span className={cn('text-sm font-medium', big && 'text-base')}>{label}</span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                    <span className={cn('font-semibold', over ? 'text-destructive' : 'text-foreground', big && 'text-sm')}>
                        {Math.round(consumed)}
                    </span>
                    <span> / {Math.round(safeTarget)} {unit}</span>
                    <span className="ml-2 hidden sm:inline">
                        {over ? `+${Math.round(consumed - safeTarget)}` : `restan ${Math.round(remaining)}`}
                    </span>
                </div>
            </div>
            <div className={cn('h-2 overflow-hidden rounded-full bg-muted', big && 'h-3')}>
                <div
                    className={cn('h-full rounded-full transition-all', over ? 'bg-destructive' : color)}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

const MEAL_META: Record<string, { icon: React.ReactNode; accent: string; bg: string }> = {
    breakfast: {
        icon: <Coffee className="h-4 w-4" />,
        accent: 'text-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
    lunch: {
        icon: <UtensilsCrossed className="h-4 w-4" />,
        accent: 'text-green-500',
        bg: 'bg-green-50 dark:bg-green-950/30',
    },
    snack: {
        icon: <Apple className="h-4 w-4" />,
        accent: 'text-pink-500',
        bg: 'bg-pink-50 dark:bg-pink-950/30',
    },
    dinner: {
        icon: <Moon className="h-4 w-4" />,
        accent: 'text-indigo-500',
        bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    },
    other: {
        icon: <Utensils className="h-4 w-4" />,
        accent: 'text-violet-500',
        bg: 'bg-violet-50 dark:bg-violet-950/30',
    },
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
        <Card className="overflow-hidden">
            {/* Cabecera de comida */}
            <div className={cn('flex items-center justify-between px-4 py-3', meta.bg)}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn('shrink-0', meta.accent)}>{meta.icon}</span>
                    <div className="min-w-0">
                        <h4 className="font-semibold text-sm leading-tight">{meal.label}</h4>
                        {hasEntries ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                <span className="font-medium text-foreground">{Math.round(sub.kcal)} kcal</span>
                                <span className="ml-1.5 opacity-70">
                                    P {Math.round(sub.p)}g · C {Math.round(sub.c)}g · G {Math.round(sub.f)}g
                                </span>
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground mt-0.5">Sin alimentos</p>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 hover:bg-background/60"
                                aria-label={`Acciones de ${meal.label}`}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={onCopy} disabled={!hasEntries}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copiar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onPaste} disabled={!canPaste}>
                                <ClipboardPaste className="mr-2 h-4 w-4" />
                                Pegar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onPastePreviousDay}>
                                <ClipboardPaste className="mr-2 h-4 w-4" />
                                Pegar día anterior
                            </DropdownMenuItem>
                            {meal.canDelete && (
                                <DropdownMenuItem onClick={onDeleteMeal} className="text-destructive focus:text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Eliminar comida
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onAdd}
                        className={cn('h-9 shrink-0 px-3 gap-1 font-medium', meta.accent, 'hover:bg-background/60')}
                    >
                        <Plus className="h-3.5 w-3.5" /> Añadir
                    </Button>
                </div>
            </div>

            {/* Alimentos */}
            {hasEntries && (
                <ul className="divide-y divide-border/60">
                    {entries.map(e => (
                        <li
                            key={e.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onEditEntry(e)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    onEditEntry(e)
                                }
                            }}
                            className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {/* Punto de color */}
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.accent.replace('text-', 'bg-'))} />

                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate leading-tight">{e.item_name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                        {e.quantity_g != null ? `${e.quantity_g} g` : `${e.servings} porc.`}
                                    </span>
                                    <MacroChip value={Math.round(Number(e.kcal))} unit="kcal" color="text-blue-500" />
                                    <MacroChip value={Math.round(Number(e.protein_g) * 10) / 10} unit="P" color="text-destructive" />
                                    <MacroChip value={Math.round(Number(e.carbs_g) * 10) / 10} unit="C" color="text-pink-500" />
                                    <MacroChip value={Math.round(Number(e.fat_g) * 10) / 10} unit="G" color="text-warning" />
                                </div>
                            </div>

                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onDelete(e)
                                }}
                                className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    )
}

function MacroChip({ value, unit, color }: { value: number; unit: string; color: string }) {
    return (
        <span className={cn('text-xs font-medium', color)}>
            {value}{unit !== 'kcal' ? <span className="text-muted-foreground font-normal">{unit}</span> : <span className="text-muted-foreground font-normal"> {unit}</span>}
        </span>
    )
}
