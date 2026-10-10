'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
    Apple,
    Check,
    Coffee,
    Dumbbell,
    Loader2,
    Moon,
    NotebookPen,
    Sandwich,
    Utensils,
    UtensilsCrossed,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ClientDietItem, ClientDietMeal, ClientDietOption } from '@/data/diet'
import { addNutritionLogEntriesBatch, deleteNutritionLogEntry } from '@/data/nutrition/log'
import type { MealType, NutritionLogEntryInput } from '@/data/nutrition/tracking-types'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalize(value: string) {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const MEAL_STYLE = [
    { match: ['desayuno'], icon: Coffee, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { match: ['media manana', 'almuerzo', 'tentempie'], icon: Sandwich, tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    { match: ['comida'], icon: UtensilsCrossed, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { match: ['merienda'], icon: Apple, tile: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
    { match: ['cena'], icon: Moon, tile: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
    { match: ['entreno', 'pre', 'post'], icon: Dumbbell, tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
]

function mealStyle(name: string) {
    const key = normalize(name)
    return MEAL_STYLE.find(style => style.match.some(token => key.includes(token)))
        ?? { icon: Utensils, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' }
}

/** A qué comida del diario de macros va cada comida del plan */
function trackerMealFor(meal: ClientDietMeal): { meal_type: MealType; meal_label: string | null; meal_order: number } {
    const key = normalize(meal.name)
    if (key.includes('desayuno')) return { meal_type: 'breakfast', meal_label: null, meal_order: 0 }
    if (key === 'comida' || key.startsWith('comida ')) return { meal_type: 'lunch', meal_label: null, meal_order: 1 }
    if (key.includes('merienda')) return { meal_type: 'snack', meal_label: null, meal_order: 2 }
    if (key.includes('cena')) return { meal_type: 'dinner', meal_label: null, meal_order: 3 }
    return { meal_type: 'other', meal_label: meal.name, meal_order: 10 + meal.order_index }
}

function formatQuantity(item: ClientDietItem) {
    const unit = (item.quantity_unit ?? '').trim()
    const value = item.quantity_value
    const normalizedUnit = normalize(unit)
    if (value === null || value === undefined) return unit || null
    const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value)
    if (normalizedUnit === 'g' || normalizedUnit === 'gr' || normalizedUnit === 'grs') return `${number} g`
    if (normalizedUnit === 'unidad' || normalizedUnit === 'uds' || normalizedUnit === 'ud') return `${number} ${value === 1 ? 'ud' : 'uds'}`
    return `${number} ${unit}`.trim()
}

interface OptionChoice {
    optionId: string
    /** grupo de alternativas → id del alimento elegido */
    alternatives: Record<string, string>
}

/** Alimentos que se comen con la elección actual (una alternativa por grupo) */
function chosenItems(option: ClientDietOption, choice: OptionChoice | undefined) {
    return option.items.filter(item => {
        if (item.alternative_group === null) return true
        const chosenId = choice?.optionId === option.id ? choice.alternatives[String(item.alternative_group)] : undefined
        if (chosenId) return item.id === chosenId
        return !item.is_alternative
    })
}

function sumMacros(items: ClientDietItem[]) {
    return items.reduce((total, item) => ({
        kcal: total.kcal + (item.kcal ?? 0),
        protein_g: total.protein_g + (item.protein_g ?? 0),
        carbs_g: total.carbs_g + (item.carbs_g ?? 0),
        fat_g: total.fat_g + (item.fat_g ?? 0),
    }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
}

function readStorage<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}

function writeStorage(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // Sin almacenamiento la elección dura lo que dure la sesión
    }
}

const DAY_TYPE_LABEL: Record<string, string> = { default: 'Normal', training: 'Entreno', rest: 'Descanso' }

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface DietOptionsPlanProps {
    planId: string
    planName: string
    meals: ClientDietMeal[]
}

export function DietOptionsPlan({ planId, planName, meals }: DietOptionsPlanProps) {
    const dayTypes = useMemo(() => [...new Set(meals.map(meal => meal.day_type))], [meals])
    const [dayType, setDayType] = useState(dayTypes.includes('default') ? 'default' : dayTypes[0])
    const [choices, setChoices] = useState<Record<string, OptionChoice>>({})
    const [loggedToday, setLoggedToday] = useState<Record<string, boolean>>({})
    const [loggingMealId, setLoggingMealId] = useState<string | null>(null)

    const today = format(new Date(), 'yyyy-MM-dd')
    const choicesKey = `diet-choices:${planId}`
    const loggedKey = `diet-logged:${planId}:${today}`

    useEffect(() => {
        setChoices(readStorage(choicesKey, {}))
        setLoggedToday(readStorage(loggedKey, {}))
    }, [choicesKey, loggedKey])

    const updateChoice = (mealId: string, choice: OptionChoice) => {
        setChoices(current => {
            const next = { ...current, [mealId]: choice }
            writeStorage(choicesKey, next)
            return next
        })
    }

    const visibleMeals = meals.filter(meal => meal.day_type === dayType).sort((a, b) => a.order_index - b.order_index)
    const dailyTarget = visibleMeals.reduce((total, meal) => ({
        kcal: total.kcal + (meal.target?.kcal ?? 0),
        protein_g: total.protein_g + (meal.target?.protein_g ?? 0),
        carbs_g: total.carbs_g + (meal.target?.carbs_g ?? 0),
        fat_g: total.fat_g + (meal.target?.fat_g ?? 0),
    }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
    const hasDailyTarget = dailyTarget.kcal > 0

    const handleLog = async (meal: ClientDietMeal, option: ClientDietOption) => {
        const items = chosenItems(option, choices[meal.id]).filter(item => item.food_id && item.quantity_g && item.kcal !== null)
        if (items.length === 0) {
            toast.error('Esta opción no tiene alimentos con macros para registrar')
            return
        }

        setLoggingMealId(meal.id)
        const slot = trackerMealFor(meal)
        const entries: NutritionLogEntryInput[] = items.map(item => ({
            log_date: today,
            ...slot,
            food_id: item.food_id,
            quantity_g: item.quantity_g,
            kcal: item.kcal ?? 0,
            protein_g: item.protein_g ?? 0,
            carbs_g: item.carbs_g ?? 0,
            fat_g: item.fat_g ?? 0,
            item_name: item.name,
            notes: null,
        }))

        const inserted = await addNutritionLogEntriesBatch(entries)
        setLoggingMealId(null)
        if (inserted.length === 0) {
            toast.error('No se pudo registrar la comida')
            return
        }

        setLoggedToday(current => {
            const next = { ...current, [meal.id]: true }
            writeStorage(loggedKey, next)
            return next
        })
        toast.success(`${meal.name} añadida a tu diario de hoy`, {
            action: {
                label: 'Deshacer',
                onClick: async () => {
                    await Promise.all(inserted.map(entry => deleteNutritionLogEntry(entry.id)))
                    setLoggedToday(current => {
                        const next = { ...current }
                        delete next[meal.id]
                        writeStorage(loggedKey, next)
                        return next
                    })
                },
            },
        })
    }

    return (
        <div className="space-y-4">
            {/* Resumen del plan */}
            <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tu plan</p>
                <h2 className="text-lg font-semibold leading-tight">{planName}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Elige una opción en cada comida. Puedes cambiar los alimentos marcados con «ó» por su equivalente.
                </p>
                {hasDailyTarget && (
                    <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border/60 pt-3 text-center">
                        <MacroStat label="kcal" value={dailyTarget.kcal} />
                        <MacroStat label="Proteína" value={dailyTarget.protein_g} unit="g" className="text-rose-600 dark:text-rose-400" />
                        <MacroStat label="Hidratos" value={dailyTarget.carbs_g} unit="g" className="text-amber-600 dark:text-amber-400" />
                        <MacroStat label="Grasa" value={dailyTarget.fat_g} unit="g" className="text-sky-600 dark:text-sky-400" />
                    </div>
                )}
            </section>

            {dayTypes.length > 1 && (
                <div className="inline-flex rounded-full bg-muted p-1">
                    {dayTypes.map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setDayType(type)}
                            className={cn(
                                'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                                dayType === type ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                            )}
                        >
                            Día {DAY_TYPE_LABEL[type] ?? type}
                        </button>
                    ))}
                </div>
            )}

            {visibleMeals.map(meal => (
                <MealCard
                    key={meal.id}
                    meal={meal}
                    choice={choices[meal.id]}
                    onChoice={(choice) => updateChoice(meal.id, choice)}
                    onLog={(option) => handleLog(meal, option)}
                    logging={loggingMealId === meal.id}
                    logged={Boolean(loggedToday[meal.id])}
                />
            ))}
        </div>
    )
}

function MacroStat({ label, value, unit, className }: { label: string; value: number; unit?: string; className?: string }) {
    return (
        <div>
            <p className={cn('text-base font-semibold tabular-nums', className)}>
                {Math.round(value)}
                {unit && <span className="text-xs font-normal text-muted-foreground"> {unit}</span>}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Comida
// ---------------------------------------------------------------------------

interface MealCardProps {
    meal: ClientDietMeal
    choice: OptionChoice | undefined
    onChoice: (choice: OptionChoice) => void
    onLog: (option: ClientDietOption) => void
    logging: boolean
    logged: boolean
}

function MealCard({ meal, choice, onChoice, onLog, logging, logged }: MealCardProps) {
    const style = mealStyle(meal.name)
    const Icon = style.icon
    const option = meal.options.find(item => item.id === choice?.optionId) ?? meal.options[0]
    if (!option) return null

    const eaten = chosenItems(option, choice)
    const totals = sumMacros(eaten)
    const hasMacros = eaten.some(item => item.kcal !== null)

    const selectOption = (optionId: string) => {
        if (optionId === option.id) return
        onChoice({ optionId, alternatives: {} })
    }

    const selectAlternative = (group: number, itemId: string) => {
        onChoice({
            optionId: option.id,
            alternatives: { ...(choice?.optionId === option.id ? choice.alternatives : {}), [String(group)]: itemId },
        })
    }

    return (
        <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            {/* Cabecera */}
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', style.tile)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold leading-tight">{meal.name}</h3>
                    {meal.target ? (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                            Objetivo {Math.round(meal.target.kcal ?? 0)} kcal · P {Math.round(meal.target.protein_g ?? 0)} · C {Math.round(meal.target.carbs_g ?? 0)} · G {Math.round(meal.target.fat_g ?? 0)}
                        </p>
                    ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {meal.options.length} {meal.options.length === 1 ? 'opción' : 'opciones'}
                        </p>
                    )}
                </div>
                {logged && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} /> Hoy
                    </span>
                )}
            </div>

            {/* Opciones */}
            {meal.options.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-hide" role="tablist" aria-label={`Opciones de ${meal.name}`}>
                    {meal.options.map(item => {
                        const isActive = item.id === option.id
                        const optionKcal = sumMacros(chosenItems(item, undefined)).kcal
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => selectOption(item.id)}
                                className={cn(
                                    'flex shrink-0 flex-col items-start rounded-xl border px-3 py-1.5 text-left transition-colors',
                                    isActive ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border/70 bg-background text-foreground hover:bg-muted/60'
                                )}
                            >
                                <span className="max-w-[9rem] truncate text-xs font-semibold">{item.name}</span>
                                {optionKcal > 0 && (
                                    <span className={cn('text-[10px] tabular-nums', isActive ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                                        {Math.round(optionKcal)} kcal
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Alimentos de la opción elegida */}
            <ul className="divide-y divide-border/60 border-t border-border/60">
                {option.items.filter(item => eaten.includes(item)).map(item => {
                    const alternatives = item.alternative_group !== null
                        ? option.items.filter(other => other.alternative_group === item.alternative_group && other.id !== item.id)
                        : []
                    const quantity = formatQuantity(item)
                    return (
                        <li key={item.id} className="px-4 py-2.5">
                            <div className="flex items-baseline gap-3">
                                <span className="min-w-0 flex-1 text-sm font-medium">{item.name}</span>
                                {quantity && <span className="shrink-0 text-sm font-semibold tabular-nums">{quantity}</span>}
                            </div>
                            {(item.kcal !== null || item.notes) && (
                                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                    {item.kcal !== null && (
                                        <>
                                            {Math.round(item.kcal)} kcal · P {Math.round(item.protein_g ?? 0)} · C {Math.round(item.carbs_g ?? 0)} · G {Math.round(item.fat_g ?? 0)}
                                        </>
                                    )}
                                    {item.kcal !== null && item.notes ? ' · ' : ''}
                                    {item.notes}
                                </p>
                            )}
                            {alternatives.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {alternatives.map(alternative => (
                                        <button
                                            key={alternative.id}
                                            type="button"
                                            onClick={() => selectAlternative(item.alternative_group as number, alternative.id)}
                                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                                            title="Cambiar por este alimento (equivalente)"
                                        >
                                            <span className="font-semibold">ó</span>
                                            {alternative.name}
                                            {formatQuantity(alternative) && <span className="tabular-nums">· {formatQuantity(alternative)}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>

            {option.notes && (
                <p className="mx-4 mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs text-primary">{option.notes}</p>
            )}

            {/* Totales + registrar */}
            <div className="flex items-center gap-3 px-4 py-3">
                {hasMacros ? (
                    <p className="min-w-0 flex-1 text-xs tabular-nums text-muted-foreground">
                        <span className="text-sm font-semibold text-foreground">{Math.round(totals.kcal)} kcal</span>
                        {' · '}<span className="text-rose-600 dark:text-rose-400">P {Math.round(totals.protein_g)}</span>
                        {' · '}<span className="text-amber-600 dark:text-amber-400">C {Math.round(totals.carbs_g)}</span>
                        {' · '}<span className="text-sky-600 dark:text-sky-400">G {Math.round(totals.fat_g)}</span>
                    </p>
                ) : (
                    <span className="flex-1" />
                )}
                {hasMacros && (
                    <button
                        type="button"
                        onClick={() => onLog(option)}
                        disabled={logging}
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60',
                            logged ? 'bg-muted text-muted-foreground hover:bg-muted/80' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        )}
                    >
                        {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NotebookPen className="h-3.5 w-3.5" />}
                        {logged ? 'Registrar otra vez' : 'Registrar'}
                    </button>
                )}
            </div>
        </article>
    )
}
