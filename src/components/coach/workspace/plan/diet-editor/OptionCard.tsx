'use client'

import { Copy, GitBranch, Lock, MoreHorizontal, Trash2, Type, Unlock, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { compareToTarget } from '@/lib/nutrition/diet-macros'
import { cn } from '@/lib/utils'
import type { DietFoodRef } from '@/data/nutrition/types'
import { FoodPicker } from './FoodPicker'
import { MacroTotals, statusDotClass } from './MacroTotals'
import {
    addAlternative,
    adjustOption,
    createFoodItem,
    createTextItem,
    effectiveTarget,
    hasTarget,
    itemMacros,
    optionSummary,
    removeItem,
    reindex,
    replaceFood,
    updateItem,
    type EditorItem,
    type EditorOption,
    type MealTarget,
} from '@/lib/nutrition/diet-plan-model'

interface OptionCardProps {
    option: EditorOption
    index: number
    target: MealTarget
    onChange: (option: EditorOption) => void
    onDuplicate: () => void
    onRemove: () => void
    canRemove: boolean
}

function formatNumber(value: number) {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(value)
}

export function OptionCard({ option, index, target, onChange, onDuplicate, onRemove, canRemove }: OptionCardProps) {
    const totals = optionSummary(option)
    const resolvedTarget = effectiveTarget(target)
    const comparison = compareToTarget(totals, resolvedTarget)
    const canAdjust = hasTarget(target) && option.items.some(item => item.food && !item.locked && !item.is_alternative)

    const handleAdjust = () => {
        const { option: adjusted, changed } = adjustOption(option, target)
        onChange(adjusted)
        toast[changed ? 'success' : 'info'](changed ? 'Cantidades ajustadas al objetivo' : 'La opción ya está ajustada')
    }

    const addFood = (food: DietFoodRef) => {
        onChange({ ...option, items: reindex([...option.items, createFoodItem(food, option.items.length)]) })
    }

    return (
        <article className="flex flex-col rounded-2xl border border-border/70 bg-card shadow-sm">
            {/* Cabecera */}
            <div className="flex items-start gap-2 border-b border-border/60 p-3">
                <span className={cn('mt-3 h-2 w-2 shrink-0 rounded-full', statusDotClass(comparison.status))} aria-hidden />
                <div className="min-w-0 flex-1 space-y-2">
                    <Input
                        value={option.name}
                        onChange={(event) => onChange({ ...option, name: event.target.value })}
                        placeholder={`Opción ${index + 1}`}
                        className="h-8 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none hover:border-border focus-visible:border-input"
                    />
                    <MacroTotals totals={totals} target={hasTarget(target) ? resolvedTarget : null} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={comparison.status === 'off' || comparison.status === 'warn' ? 'default' : 'outline'}
                        onClick={handleAdjust}
                        disabled={!canAdjust}
                        className="h-8 gap-1.5"
                        title={hasTarget(target) ? 'Recalcula los gramos para acercarse al objetivo de la comida' : 'Pon un objetivo de macros a la comida para poder ajustar'}
                    >
                        <Wand2 className="h-3.5 w-3.5" />
                        Ajustar
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones de la opción">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onDuplicate}>
                                <Copy className="mr-2 h-4 w-4" /> Duplicar opción
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onRemove} disabled={!canRemove} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar opción
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Alimentos */}
            <div className="flex-1 space-y-1.5 p-3">
                {option.items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border/80 px-3 py-4 text-center text-xs text-muted-foreground">
                        Añade alimentos de la base de datos para calcular los macros.
                    </p>
                )}
                {option.items.map(item => (
                    <ItemRow
                        key={item.key}
                        item={item}
                        onChange={(patch) => onChange(updateItem(option, item.key, patch))}
                        onReplaceFood={(food) => onChange(updateItem(option, item.key, replaceFood(item, food)))}
                        onAddAlternative={(food) => onChange(addAlternative(option, item.key, food))}
                        onRemove={() => onChange(removeItem(option, item.key))}
                    />
                ))}

                <div className="flex flex-wrap items-center gap-2 pt-1.5">
                    <FoodPicker
                        value={null}
                        onSelect={addFood}
                        placeholder="Añadir alimento"
                        compact
                        className="min-w-[10rem] flex-1 border-dashed"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 gap-1.5 text-muted-foreground"
                        onClick={() => onChange({ ...option, items: reindex([...option.items, createTextItem(option.items.length)]) })}
                        title="Texto libre que no cuenta en los macros (p. ej. «Verdura libre», «Café»)"
                    >
                        <Type className="h-3.5 w-3.5" /> Texto libre
                    </Button>
                </div>
            </div>

            {/* Notas + aviso */}
            <div className="space-y-2 border-t border-border/60 p-3">
                {totals.uncounted > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                        {totals.uncounted} {totals.uncounted === 1 ? 'ítem no cuenta' : 'ítems no cuentan'} en los macros (texto libre o sin vincular).
                    </p>
                )}
                <Input
                    value={option.notes || ''}
                    onChange={(event) => onChange({ ...option, notes: event.target.value })}
                    placeholder="Notas para el atleta (opcional)"
                    className="h-8 text-xs"
                />
            </div>
        </article>
    )
}

// ---------------------------------------------------------------------------
// Fila de alimento
// ---------------------------------------------------------------------------

interface ItemRowProps {
    item: EditorItem
    onChange: (patch: Partial<EditorItem>) => void
    onReplaceFood: (food: DietFoodRef) => void
    onAddAlternative: (food: DietFoodRef) => void
    onRemove: () => void
}

function ItemRow({ item, onChange, onReplaceFood, onAddAlternative, onRemove }: ItemRowProps) {
    const food = item.food
    const macros = itemMacros(item)
    const unitWeight = food?.unit_weight_g ? Number(food.unit_weight_g) : null
    const showUnits = Boolean(item.unit_based && unitWeight)
    const displayQuantity = item.quantity_g === null || item.quantity_g === undefined
        ? ''
        : showUnits ? formatNumber(item.quantity_g / (unitWeight as number)) : formatNumber(item.quantity_g)

    const handleQuantity = (raw: string) => {
        const value = parseFloat(raw.replace(',', '.'))
        if (!raw.trim()) return onChange({ quantity_g: null })
        if (!Number.isFinite(value) || value < 0) return
        // Tocar a mano una alternativa la bloquea: deja de seguir a la referencia
        onChange({
            quantity_g: showUnits ? value * (unitWeight as number) : value,
            ...(item.is_alternative ? { locked: true } : {}),
        })
    }

    return (
        <div className={cn('group', item.is_alternative && 'pl-6')}>
            <div className="flex items-center gap-1.5">
                {item.is_alternative && (
                    <span className="-ml-6 w-6 shrink-0 text-center text-[11px] font-semibold uppercase text-muted-foreground">o</span>
                )}

                {food ? (
                    <FoodPicker value={food} onSelect={onReplaceFood} compact className="min-w-0 flex-1" />
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Input
                            value={item.name}
                            onChange={(event) => onChange({ name: event.target.value })}
                            placeholder="Texto libre (p. ej. Verdura libre)"
                            className="h-9 min-w-0 flex-1 text-sm"
                        />
                        <FoodPicker value={null} fallbackLabel={item.name} onSelect={onReplaceFood} iconOnly />
                    </div>
                )}

                {food ? (
                    <div className="flex shrink-0 items-center">
                        <Input
                            key={`${item.key}-${item.quantity_g}-${showUnits}`}
                            defaultValue={displayQuantity}
                            onBlur={(event) => handleQuantity(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur() }}
                            inputMode="decimal"
                            className="h-9 w-16 rounded-r-none text-right tabular-nums"
                            aria-label="Cantidad"
                        />
                        {unitWeight ? (
                            <button
                                type="button"
                                onClick={() => onChange({ unit_based: !item.unit_based })}
                                className="h-9 w-12 rounded-r-lg border border-l-0 border-input bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground"
                                title={`Cambiar a ${showUnits ? 'gramos' : food.unit_label ?? 'unidades'}`}
                            >
                                {showUnits ? (food.unit_label === 'unidad' ? 'ud' : food.unit_label ?? 'ud') : 'g'}
                            </button>
                        ) : (
                            <span className="flex h-9 w-12 items-center justify-center rounded-r-lg border border-l-0 border-input bg-muted/50 text-xs font-medium text-muted-foreground">g</span>
                        )}
                    </div>
                ) : (
                    <Input
                        value={[item.quantity_value ?? '', item.quantity_unit ?? ''].join(' ').trim()}
                        onChange={(event) => {
                            const match = event.target.value.match(/^\s*([\d.,]+)?\s*(.*)$/)
                            const value = match?.[1] ? parseFloat(match[1].replace(',', '.')) : null
                            onChange({ quantity_value: Number.isFinite(value as number) ? value : null, quantity_unit: match?.[2] ?? '' })
                        }}
                        placeholder="Cantidad"
                        className="h-9 w-28 shrink-0 text-sm"
                        aria-label="Cantidad libre"
                    />
                )}

                {food && !item.is_alternative ? (
                    <FoodPicker
                        value={null}
                        onSelect={onAddAlternative}
                        trigger={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-8 shrink-0 text-muted-foreground"
                                title="Añadir alternativa equivalente (p. ej. arroz ó pasta)"
                                aria-label="Añadir alternativa equivalente"
                            >
                                <GitBranch className="h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                ) : (
                    <span className="w-8 shrink-0" aria-hidden />
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-8 shrink-0 text-muted-foreground" aria-label="Acciones del alimento">
                            {item.locked ? <Lock className="h-3.5 w-3.5" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        {food && (
                            <DropdownMenuItem onClick={() => onChange({ locked: !item.locked })}>
                                {item.locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                                {item.locked ? 'Desbloquear cantidad' : 'Bloquear cantidad'}
                            </DropdownMenuItem>
                        )}
                        {food && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Quitar
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {macros && (
                <p className={cn('mt-0.5 pr-10 text-[11px] tabular-nums text-muted-foreground', item.is_alternative ? 'pl-0' : 'pl-1')}>
                    {Math.round(macros.kcal)} kcal · <span className="text-rose-600/80 dark:text-rose-400/80">P {formatNumber(macros.protein_g)}</span>
                    {' · '}<span className="text-amber-600/80 dark:text-amber-400/80">C {formatNumber(macros.carbs_g)}</span>
                    {' · '}<span className="text-sky-600/80 dark:text-sky-400/80">G {formatNumber(macros.fat_g)}</span>
                    {showUnits && item.quantity_g ? ` · ${formatNumber(item.quantity_g)} g` : ''}
                    {item.is_alternative && !item.locked ? ' · equivalente' : ''}
                </p>
            )}
        </div>
    )
}
