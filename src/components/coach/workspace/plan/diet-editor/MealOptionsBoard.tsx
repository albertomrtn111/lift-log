'use client'

import { useState } from 'react'
import { Plus, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { compareToTarget } from '@/lib/nutrition/diet-macros'
import { cn } from '@/lib/utils'
import { OptionCard } from './OptionCard'
import { MealTargetInputs } from './MealTargets'
import { statusDotClass } from './MacroTotals'
import {
    adjustOption,
    createEmptyOption,
    effectiveTarget,
    hasTarget,
    mealTarget,
    newKey,
    optionSummary,
    type EditorMeal,
} from '@/lib/nutrition/diet-plan-model'

type Status = 'ok' | 'warn' | 'off' | 'none'
const RANK: Record<Status, number> = { none: -1, ok: 0, warn: 1, off: 2 }

function mealStatus(meal: EditorMeal): Status {
    const target = mealTarget(meal)
    if (!hasTarget(target)) return 'none'
    return meal.options.reduce<Status>((worst, option) => {
        const { status } = compareToTarget(optionSummary(option), effectiveTarget(target))
        return RANK[status] > RANK[worst] ? status : worst
    }, 'none')
}

/** Paso 3: comidas en pestañas y, para cada una, sus opciones con macros */
export function MealOptionsBoard({ meals, onChangeMeal }: { meals: EditorMeal[]; onChangeMeal: (index: number, meal: EditorMeal) => void }) {
    const [selected, setSelected] = useState(0)
    const index = Math.min(selected, meals.length - 1)
    const meal = meals[index]
    if (!meal) return null

    const target = mealTarget(meal)

    const updateOption = (optionIndex: number, option: EditorMeal['options'][number]) => {
        onChangeMeal(index, { ...meal, options: meal.options.map((o, i) => (i === optionIndex ? option : o)) })
    }

    const addOption = () => {
        onChangeMeal(index, { ...meal, options: [...meal.options, createEmptyOption(meal.options.length)] })
    }

    const duplicateOption = (optionIndex: number) => {
        const source = meal.options[optionIndex]
        const copy = {
            ...source,
            key: newKey(),
            name: `${source.name} (copia)`,
            items: source.items.map(item => ({ ...item, key: newKey() })),
        }
        const options = [...meal.options]
        options.splice(optionIndex + 1, 0, copy)
        onChangeMeal(index, { ...meal, options: options.map((o, i) => ({ ...o, order_index: i })) })
    }

    const removeOption = (optionIndex: number) => {
        onChangeMeal(index, {
            ...meal,
            options: meal.options.filter((_, i) => i !== optionIndex).map((o, i) => ({ ...o, order_index: i })),
        })
    }

    const adjustAll = () => {
        let changedCount = 0
        const options = meal.options.map(option => {
            const result = adjustOption(option, target)
            if (result.changed) changedCount += 1
            return result.option
        })
        onChangeMeal(index, { ...meal, options })
        toast.success(changedCount > 0 ? `${changedCount} ${changedCount === 1 ? 'opción ajustada' : 'opciones ajustadas'}` : 'Todas las opciones ya están ajustadas')
    }

    return (
        <div className="space-y-4">
            {/* Comidas */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Comidas">
                {meals.map((item, i) => {
                    const status = mealStatus(item)
                    const isActive = i === index
                    return (
                        <button
                            key={`${item.name}-${i}`}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setSelected(i)}
                            className={cn(
                                'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                                isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 bg-card text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <span className={cn('h-2 w-2 rounded-full', isActive && status === 'none' ? 'bg-primary-foreground/40' : statusDotClass(status))} />
                            {item.name}
                            <span className={cn('text-xs tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>
                                {item.options.length}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Objetivo de la comida */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-48">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Objetivo de {meal.name}</p>
                    <p className="text-xs text-muted-foreground">
                        {hasTarget(target) ? 'Cada opción se compara con este objetivo.' : 'Sin objetivo: solo se suman los macros.'}
                    </p>
                </div>
                <MealTargetInputs
                    meal={meal}
                    onChange={(patch) => onChangeMeal(index, { ...meal, ...patch })}
                    className="flex-1"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={adjustAll}
                    disabled={!hasTarget(target) || meal.options.length === 0}
                    className="h-8 shrink-0 gap-1.5"
                >
                    <Wand2 className="h-3.5 w-3.5" /> Ajustar todas
                </Button>
            </div>

            {/* Opciones */}
            <div className="grid gap-3 lg:grid-cols-2">
                {meal.options.map((option, optionIndex) => (
                    <OptionCard
                        key={option.key}
                        option={option}
                        index={optionIndex}
                        target={target}
                        onChange={(updated) => updateOption(optionIndex, updated)}
                        onDuplicate={() => duplicateOption(optionIndex)}
                        onRemove={() => removeOption(optionIndex)}
                        canRemove={meal.options.length > 1}
                    />
                ))}
                <button
                    type="button"
                    onClick={addOption}
                    className="flex min-h-[8rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/80 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Plus className="h-5 w-5" />
                    Añadir opción
                </button>
            </div>
        </div>
    )
}
