import { cn } from '@/lib/utils'
import type { DietMealWithOptions, DietOptionWithItems } from '@/data/nutrition/types'
import { MacroTotals } from './MacroTotals'

function sumMacros(items: DietOptionWithItems['items']) {
    return items.reduce((total, item) => {
        if (item.is_alternative) return total
        return {
            kcal: total.kcal + (Number(item.kcal) || 0),
            protein_g: total.protein_g + (Number(item.protein_g) || 0),
            carbs_g: total.carbs_g + (Number(item.carbs_g) || 0),
            fat_g: total.fat_g + (Number(item.fat_g) || 0),
        }
    }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
}

function mealTargetOf(meal: DietMealWithOptions) {
    const target = {
        kcal: meal.target_kcal != null ? Number(meal.target_kcal) : null,
        protein_g: meal.target_protein_g != null ? Number(meal.target_protein_g) : null,
        carbs_g: meal.target_carbs_g != null ? Number(meal.target_carbs_g) : null,
        fat_g: meal.target_fat_g != null ? Number(meal.target_fat_g) : null,
    }
    return Object.values(target).some(value => Number(value) > 0) ? target : null
}

/** Opción de un plan guardado, con macros y desviación frente al objetivo de la comida */
export function OptionMacroView({ meal, option }: { meal: DietMealWithOptions; option: DietOptionWithItems }) {
    const items = [...option.items].sort((a, b) => a.order_index - b.order_index)
    const hasMacros = items.some(item => item.kcal != null)
    const target = mealTargetOf(meal)

    return (
        <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{option.name}</p>
                {hasMacros && <MacroTotals totals={sumMacros(items)} target={target} />}
            </div>
            <ul className="space-y-1">
                {items.map(item => (
                    <li key={item.id} className={cn('flex items-baseline gap-2 text-sm text-muted-foreground', item.is_alternative && 'pl-4')}>
                        <span className={cn('w-3 shrink-0 text-center', item.is_alternative ? 'text-xs font-semibold' : 'text-primary')}>
                            {item.is_alternative ? 'ó' : '•'}
                        </span>
                        <span className="min-w-0 flex-1">
                            {item.quantity_value != null && (
                                <strong className="font-semibold text-foreground/80">
                                    {item.quantity_value}{item.quantity_unit ? ` ${item.quantity_unit}` : ''}{' '}
                                </strong>
                            )}
                            {item.quantity_value == null && item.quantity_unit && (
                                <strong className="font-semibold text-foreground/80">{item.quantity_unit} </strong>
                            )}
                            {item.name}
                            {item.notes && <span className="text-muted-foreground/70"> ({item.notes})</span>}
                        </span>
                        {item.kcal != null ? (
                            <span className="shrink-0 text-xs tabular-nums">{Math.round(Number(item.kcal))} kcal</span>
                        ) : !item.food_id ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground/60">sin macros</span>
                        ) : null}
                    </li>
                ))}
            </ul>
            {option.notes && (
                <p className="mt-2 inline-block rounded bg-primary/5 px-2 py-1 text-xs text-primary">💡 {option.notes}</p>
            )}
        </div>
    )
}

/** Resumen del objetivo de una comida para cabeceras */
export function mealTargetLabel(meal: DietMealWithOptions) {
    const target = mealTargetOf(meal)
    if (!target) return null
    return `${Math.round(target.kcal ?? 0)} kcal · P ${Math.round(target.protein_g ?? 0)} · C ${Math.round(target.carbs_g ?? 0)} · G ${Math.round(target.fat_g ?? 0)}`
}
